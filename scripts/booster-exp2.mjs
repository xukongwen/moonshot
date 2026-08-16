// R2: stock Titan has legs + landing reserve. Fly Mun Express, stage with
// leftover, switch, coast into thick air, suicide-burn. Also check LKO.
// No teleport. No invented telemetry.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SimSession } from '../mcp/session.mjs';
import { BODIES } from '../src/constants.js';
import { heightAt } from '../src/terrain.js';
import {
  ascentTick, pointState, orbitCheck, lifterFuelKg, lifterReserveKg,
} from '../src/agent-muscles.js';
import { runPoweredDescent } from '../src/agent-burns.js';
import { serializeSnapshot, writeSnapshot } from '../mcp/snapshot.mjs';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
mkdirSync(join(ROOT, 'logs'), { recursive: true });
mkdirSync(join(ROOT, 'logs/snapshots'), { recursive: true });

function aglOf(st) {
  const body = BODIES[st.body];
  const u = st.pos.clone().normalize();
  const alt = st.pos.length() - body.radius;
  const th = alt < 95_000 ? heightAt(st.body, u) : 0;
  return alt - th - (st.massProps?.comY ?? 0);
}

function fuelOf(st) {
  return (st.parts ?? [])
    .filter((p) => p.fuel > 0 && !p.def?.engine?.srb)
    .reduce((s, p) => s + p.fuel, 0);
}

function kin(st) {
  const u = st.pos.clone().normalize();
  const vUp = st.vel.dot(u);
  return {
    t: st.t,
    alt_m: st.pos.length() - BODIES[st.body].radius,
    agl_m: aglOf(st),
    speed_ms: st.vel.length(),
    vUp_ms: vUp,
    vH_ms: st.vel.clone().addScaledVector(u, -vUp).length(),
    fuel_kg: fuelOf(st),
    mass_kg: st.massProps?.m ?? null,
    body: st.body,
    landed: !!st.landed,
    dead: !!st.dead,
  };
}

function flyToTitanDrop(craft) {
  const session = new SimSession();
  session.newFlight(craft);
  const reserve = lifterReserveKg(session.st);
  session.stage();
  session.setThrottle(1);
  let dropped = null;
  let reason = 'timeout';
  let stageReason = null;
  const t0 = session.st.t;
  for (let i = 0; i < 16_000 && !session.st.dead; i++) {
    const tick = ascentTick(session.st, { plan: session.plan, stageIdx: session.stageIdx });
    pointState(session.st, tick.dir);
    session.st.throttle = tick.throttle;
    if (tick.stage) {
      stageReason = tick.stageReason;
      const out = session.stage();
      if (out.droppedId) {
        const v = session.vesselById(out.droppedId);
        if (v?.st.parts.some((p) => /Titan/.test(p.def?.name || ''))) {
          dropped = v;
          reason = 'titan-drop';
          break;
        }
      }
    }
    session.step(0.1);
    if (tick.done) { reason = 'orbit'; break; }
    if (session.st.t - t0 > 500) { reason = 'time-cap'; break; }
  }
  return { session, dropped, reason, stageReason, reserve };
}

function continueUpper(session, maxS = 520) {
  const t0 = session.st.t;
  let reason = 'time-cap';
  for (let i = 0; i < 20_000 && !session.st.dead; i++) {
    const tick = ascentTick(session.st, { plan: session.plan, stageIdx: session.stageIdx });
    pointState(session.st, tick.dir);
    session.st.throttle = tick.throttle;
    if (tick.stage) session.stage();
    session.step(0.1);
    if (tick.done) { reason = 'orbit'; break; }
    if (session.st.t - t0 > maxS) break;
    if (session.st.landed || session.st.dead) {
      reason = session.st.dead ? 'dead' : 'landed';
      break;
    }
  }
  session.st.throttle = 0;
  const orb = orbitCheck(session.st);
  return {
    reason,
    ...kin(session.st),
    peKm: orb.peKm,
    apKm: orb.apKm,
    bound: orb.ok,
    orbitText: orb.text,
    titanOn: session.st.parts.some((p) => /Titan/.test(p.def?.name || '')),
    parts: session.st.parts.map((p) => p.def.name),
  };
}

function coastToAgl(session, aglStart) {
  session.setThrottle(0);
  for (let i = 0; i < 50_000 && !session.st.dead && !session.st.landed; i++) {
    const agl = aglOf(session.st);
    const u = session.st.pos.clone().normalize();
    const vUp = session.st.vel.dot(u);
    pointState(session.st, session.st.vel.clone().negate());
    if (agl < aglStart && vUp < 80) break;
    if (agl < 2000) break;
    session.step(agl < 20_000 ? 0.06 : 0.14);
  }
}

console.log('=== LKO with production reserve ===');
const lko = {};
for (const craft of ['Mun Express', 'Duna Hauler']) {
  const { session, dropped, reason, stageReason, reserve } = flyToTitanDrop(craft);
  const drop = dropped ? {
    reason,
    stageReason,
    reserve_kg: reserve,
    ...kin(dropped.st),
    parts: dropped.st.parts.map((p) => p.def.name),
    hasLegs: dropped.st.parts.some((p) => p.def.legs),
  } : { reason, reserve_kg: reserve };
  console.log(`  ${craft} drop ${reason} reserve=${reserve} alt=${drop.alt_m?.toFixed?.(0)} v=${drop.speed_ms?.toFixed?.(0)} fuel=${drop.fuel_kg?.toFixed?.(0)} legs=${drop.hasLegs}`);
  const upper = continueUpper(session);
  console.log(`  ${craft} upper ${upper.reason} ${upper.orbitText} fuel=${upper.fuel_kg.toFixed(0)} titanOn=${upper.titanOn}`);
  lko[craft] = { drop, upper };
}

console.log('\n=== Mun Express booster landing ===');
const { session, dropped, reason, stageReason, reserve } = flyToTitanDrop('Mun Express');
if (!dropped) {
  console.error('no titan drop', reason);
  process.exit(2);
}
const atSep = {
  id: dropped.id,
  name: dropped.name,
  reason,
  stageReason,
  reserve_kg: reserve,
  ...kin(dropped.st),
  parts: dropped.st.parts.map((p) => p.def.name),
  ignited: dropped.st.parts.filter((p) => p.ignited).map((p) => p.def.name),
  hasLegs: dropped.st.parts.some((p) => p.def.legs),
};
console.log('  sep', JSON.stringify({
  t: atSep.t, alt: atSep.alt_m, v: atSep.speed_ms, vH: atSep.vH_ms, fuel: atSep.fuel_kg, legs: atSep.hasLegs,
}));

session.setActive(dropped.id);
session.setLegs(true);
const beforeCoast = kin(session.st);
coastToAgl(session, 5000);
const atBurn = kin(session.st);
console.log('  atBurn', JSON.stringify({
  alt: atBurn.alt_m, agl: atBurn.agl_m, v: atBurn.speed_ms, vH: atBurn.vH_ms, fuel: atBurn.fuel_kg,
}));

const burn = runPoweredDescent(session.st, 'kerbin', { useChutes: false, brakeFrac: 0.35 });
session.refreshMass();
const after = kin(session.st);
const impact = (session.lastEvents || []).filter((e) => e.type === 'landed' || e.type === 'crashed');
console.log('  burn', JSON.stringify(burn));
console.log('  after', JSON.stringify(after));

const snap = serializeSnapshot(session.st, { tag: 'booster-exp2', craft: 'Mun Express' });
const snapPath = writeSnapshot(snap);
const claimedLanding = !!(after.landed && !after.dead && after.agl_m < 2 && burn.speed != null && burn.speed <= 12);
const result = {
  reserve: { mun_kg: reserve, note: '3-XL Express 8000; 8-XL Hauler 5000 (LKO)' },
  lko,
  design: { name: 'Mun Express', stack: session.lastDesign?.stack, radials: session.lastDesign?.radials },
  landing: {
    craft: 'Mun Express',
    atSep,
    beforeCoast,
    atBurn,
    after,
    burn,
    impact,
    snapshot: snapPath,
    claimedLanding,
    claimedPad: false,
    water: !!burn.water,
  },
};
writeFileSync(join(ROOT, 'logs/booster-exp2.json'), JSON.stringify(result, null, 2));
console.log('\nwrote', snapPath);
console.log('wrote logs/booster-exp2.json');
console.log(claimedLanding
  ? `LANDING  touchdown ${burn.speed.toFixed(2)} m/s  AGL ${after.agl_m.toFixed(2)}  fuel ${after.fuel_kg.toFixed(0)} kg  water=${!!burn.water}  body=${after.body}`
  : `NO LANDING  dead=${after.dead} landed=${after.landed} speed=${after.speed_ms.toFixed(2)} touch=${burn.speed} AGL=${after.agl_m.toFixed(2)}`);
