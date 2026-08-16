// R3: flip + boostback after Mun Express Titan drop, then ballistic + suicide.
// Try 1 uses the 3 t landing reserve. If it crashes, try 2 leaves more reserve.
// No teleport. No invented telemetry. Attitude pointState only.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SimSession } from '../mcp/session.mjs';
import { BODIES } from '../src/constants.js';
import { heightAt } from '../src/terrain.js';
import { physicsStep } from '../src/physics.js';
import {
  ascentTick, pointState, orbitCheck, lifterReserveKg, fuelLeft,
} from '../src/agent-muscles.js';
import {
  runPoweredDescent, runBoostback, padDistanceM, vTowardPad,
} from '../src/agent-burns.js';
import { serializeSnapshot, writeSnapshot } from '../mcp/snapshot.mjs';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
mkdirSync(join(ROOT, 'logs'), { recursive: true });
mkdirSync(join(ROOT, 'logs/snapshots'), { recursive: true });

const EXP2_PAD_M = 138347.3;

function aglOf(st) {
  const body = BODIES[st.body];
  const u = st.pos.clone().normalize();
  const alt = st.pos.length() - body.radius;
  const th = alt < 95_000 ? heightAt(st.body, u) : 0;
  return alt - th - (st.massProps?.comY ?? 0);
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
    vTowardPad_ms: vTowardPad(st),
    pad_m: padDistanceM(st),
    fuel_kg: fuelLeft(st),
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

function coastToAgl(st, aglStart) {
  st.throttle = 0;
  for (let i = 0; i < 50_000 && !st.dead && !st.landed; i++) {
    const agl = aglOf(st);
    const u = st.pos.clone().normalize();
    const vUp = st.vel.dot(u);
    pointState(st, st.vel.clone().negate());
    if (agl < aglStart && vUp < 80) break;
    if (agl < 1500) break;
    const dt = agl < 20_000 ? 0.06 : 0.14;
    const evs = [];
    physicsStep(st, dt, evs);
    st.t += dt;
    if (st.met != null) st.met += dt;
    if (evs.some((e) => e.type === 'landed' || e.type === 'crashed')) break;
  }
}

function runProfile(label, { landReserveKg, vAwayStop, aglStart, brakeFrac }) {
  const { session, dropped, reason, stageReason, reserve } = flyToTitanDrop('Mun Express');
  if (!dropped) return { label, ok: false, reason };
  const atSep = {
    id: dropped.id,
    name: dropped.name,
    reason,
    stageReason,
    reserve_kg: reserve,
    ...kin(dropped.st),
    parts: dropped.st.parts.map((p) => p.def.name),
    hasLegs: dropped.st.parts.some((p) => p.def.legs),
  };
  session.setActive(dropped.id);
  session.setLegs(true);
  const beforeBb = kin(session.st);
  const boostback = runBoostback(session.st, { landReserveKg, vAwayStop });
  session.refreshMass();
  const afterBb = kin(session.st);
  coastToAgl(session.st, aglStart);
  const atBurn = kin(session.st);
  const burn = runPoweredDescent(session.st, 'kerbin', { useChutes: false, brakeFrac });
  session.refreshMass();
  const after = kin(session.st);
  const claimedLanding = !!(after.landed && !after.dead && after.agl_m < 2 && burn.speed != null && burn.speed <= 12);
  const pad_m = after.pad_m;
  return {
    label,
    profile: { landReserveKg, vAwayStop, aglStart, brakeFrac },
    session,
    atSep,
    beforeBb,
    boostback,
    afterBb,
    atBurn,
    after,
    burn,
    claimedLanding,
    claimedPad: !!(claimedLanding && pad_m != null && pad_m < 200),
    water: !!burn.water,
    pad_m,
    closerThanExp2: pad_m != null && pad_m < EXP2_PAD_M,
  };
}

console.log('=== R3 try 1: kill downrange, leave ~3 t, suicide 5 km / 0.35 ===');
const try1 = runProfile('try1-3t-5km', {
  landReserveKg: 3000,
  vAwayStop: 40,
  aglStart: 5000,
  brakeFrac: 0.35,
});
console.log('  sep', JSON.stringify({
  t: try1.atSep?.t, alt: try1.atSep?.alt_m, v: try1.atSep?.speed_ms,
  vH: try1.atSep?.vH_ms, vToward: try1.atSep?.vTowardPad_ms,
  fuel: try1.atSep?.fuel_kg, pad_km: try1.atSep ? try1.atSep.pad_m / 1000 : null,
}));
console.log('  bb', JSON.stringify(try1.boostback));
console.log('  after', JSON.stringify({
  land: try1.after?.landed, dead: try1.after?.dead, crash: try1.burn?.crashed,
  touch: try1.burn?.speed, fuel: try1.after?.fuel_kg, water: try1.burn?.water,
  pad_km: try1.pad_m != null ? try1.pad_m / 1000 : null, agl: try1.after?.agl_m,
}));

let official = try1;
let try2 = null;
if (!try1.claimedLanding) {
  console.log('\n=== R3 try 2: more landing reserve 5.8 t, suicide 4.5 km / 0.75 ===');
  try2 = runProfile('try2-5.8t-4.5km', {
    landReserveKg: 5800,
    vAwayStop: 40,
    aglStart: 4500,
    brakeFrac: 0.75,
  });
  console.log('  sep', JSON.stringify({
    t: try2.atSep?.t, alt: try2.atSep?.alt_m, v: try2.atSep?.speed_ms,
    vH: try2.atSep?.vH_ms, vToward: try2.atSep?.vTowardPad_ms,
    fuel: try2.atSep?.fuel_kg, pad_km: try2.atSep ? try2.atSep.pad_m / 1000 : null,
  }));
  console.log('  bb', JSON.stringify(try2.boostback));
  console.log('  after', JSON.stringify({
    land: try2.after?.landed, dead: try2.after?.dead, crash: try2.burn?.crashed,
    touch: try2.burn?.speed, fuel: try2.after?.fuel_kg, water: try2.burn?.water,
    pad_km: try2.pad_m != null ? try2.pad_m / 1000 : null, agl: try2.after?.agl_m,
  }));
  official = try2;
}

const { session } = official;
const snap = serializeSnapshot(session.st, { tag: 'booster-exp3', craft: 'Mun Express' });
const snapPath = writeSnapshot(snap);

const { session: _s, ...try1Log } = try1;
const try2Log = try2 ? (({ session: _x, ...rest }) => rest)(try2) : null;
const officialLog = official === try1 ? try1Log : try2Log;

const result = {
  exp2_pad_m: EXP2_PAD_M,
  try1: try1Log,
  try2: try2Log,
  official: official.label,
  design: { name: 'Mun Express', stack: session.lastDesign?.stack, radials: session.lastDesign?.radials },
  landing: {
    craft: 'Mun Express',
    ...officialLog,
    snapshot: snapPath,
  },
};
writeFileSync(join(ROOT, 'logs/booster-exp3.json'), JSON.stringify(result, null, 2));
console.log('\nwrote', snapPath);
console.log('wrote logs/booster-exp3.json');
const touch = official.burn?.speed;
const padKm = official.pad_m != null ? (official.pad_m / 1000).toFixed(2) : '?';
const exp2Km = (EXP2_PAD_M / 1000).toFixed(2);
if (official.claimedLanding) {
  console.log(`LANDING  touchdown ${touch.toFixed(2)} m/s  AGL ${official.after.agl_m.toFixed(2)}  fuel ${official.after.fuel_kg.toFixed(0)} kg  water=${!!official.water}  pad=${padKm} km  exp2=${exp2Km} km  closer=${official.closerThanExp2}  body=${official.after.body}`);
} else {
  console.log(`NO LANDING  dead=${official.after?.dead} land=${official.after?.landed} touch=${touch} pad=${padKm} km`);
}
