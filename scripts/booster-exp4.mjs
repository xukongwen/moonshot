// R4: aim the Mun Express Titan at the pad. Production 8.5 t reserve,
// boostback until a cheap ballistic impact is near the pad, then suicide.
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
  predictBallisticImpact,
} from '../src/agent-burns.js';
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

function kin(st) {
  const u = st.pos.clone().normalize();
  const vUp = st.vel.dot(u);
  const pred = predictBallisticImpact(st);
  return {
    t: st.t,
    alt_m: st.pos.length() - BODIES[st.body].radius,
    agl_m: aglOf(st),
    speed_ms: st.vel.length(),
    vUp_ms: vUp,
    vH_ms: st.vel.clone().addScaledVector(u, -vUp).length(),
    vTowardPad_ms: vTowardPad(st),
    pad_m: padDistanceM(st),
    pred_m: pred.ok ? pred.pad_m : null,
    pred_t_s: pred.ok ? pred.t : null,
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

function runProfile(label, { landReserveKg, impactPadM, aglStart, brakeFrac }) {
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
  const boostback = runBoostback(session.st, {
    landReserveKg, impactPadM, vAwayStop: -400,
  });
  session.refreshMass();
  const afterBb = kin(session.st);
  coastToAgl(session.st, aglStart);
  const atBurn = kin(session.st);
  const burn = runPoweredDescent(session.st, 'kerbin', {
    useChutes: false, brakeFrac, horizKillAgl: 1e9,
  });
  session.refreshMass();
  const after = kin(session.st);
  const claimedLanding = !!(after.landed && !after.dead && after.agl_m < 2 && burn.speed != null && burn.speed <= 12);
  const pad_m = after.pad_m;
  return {
    label,
    profile: { landReserveKg, impactPadM, aglStart, brakeFrac },
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
  };
}

console.log('=== R4 LKO with production 8.5 t ===');
const { session: lkoSess, dropped: lkoDrop, reserve: lkoReserve } = flyToTitanDrop('Mun Express');
const lkoDropKin = lkoDrop ? kin(lkoDrop.st) : null;
const upper = continueUpper(lkoSess);
console.log('  drop', JSON.stringify({
  reserve: lkoReserve, fuel: lkoDropKin?.fuel_kg, alt: lkoDropKin?.alt_m, v: lkoDropKin?.speed_ms,
}));
console.log('  upper', JSON.stringify({
  reason: upper.reason, orbit: upper.orbitText, bound: upper.bound, fuel: upper.fuel_kg,
}));

console.log('\n=== R4 try 1: impact 6 km, leave 5.2 t, 5 km / 0.70 ===');
const try1 = runProfile('try1-impact6-5.2t', {
  landReserveKg: 5200, impactPadM: 6000, aglStart: 5000, brakeFrac: 0.70,
});
console.log('  bb', JSON.stringify({
  reason: try1.boostback?.reason, dV: try1.boostback?.dV_ms,
  used: try1.boostback?.fuelUsed_kg, left: try1.boostback?.fuelLeft_kg,
  pred: try1.boostback?.pred_m,
}));
console.log('  after', JSON.stringify({
  land: try1.after?.landed, crash: try1.burn?.crashed, touch: try1.burn?.speed,
  fuel: try1.after?.fuel_kg, water: try1.burn?.water, pad_km: try1.pad_m != null ? try1.pad_m / 1000 : null,
}));

console.log('\n=== R4 try 2: impact 4 km, leave 5.2 t, 5 km / 0.70 ===');
const try2 = runProfile('try2-impact4-5.2t', {
  landReserveKg: 5200, impactPadM: 4000, aglStart: 5000, brakeFrac: 0.70,
});
console.log('  bb', JSON.stringify({
  reason: try2.boostback?.reason, dV: try2.boostback?.dV_ms,
  used: try2.boostback?.fuelUsed_kg, left: try2.boostback?.fuelLeft_kg,
  pred: try2.boostback?.pred_m,
}));
console.log('  after', JSON.stringify({
  land: try2.after?.landed, crash: try2.burn?.crashed, touch: try2.burn?.speed,
  fuel: try2.after?.fuel_kg, water: try2.burn?.water, pad_km: try2.pad_m != null ? try2.pad_m / 1000 : null,
}));

console.log('\n=== R4 try 3 official: impact 3 km, leave 5.15 t, 5 km / 0.72 ===');
const try3 = runProfile('try3-impact3-5.15t', {
  landReserveKg: 5150, impactPadM: 3000, aglStart: 5000, brakeFrac: 0.72,
});
console.log('  bb', JSON.stringify({
  reason: try3.boostback?.reason, dV: try3.boostback?.dV_ms,
  used: try3.boostback?.fuelUsed_kg, left: try3.boostback?.fuelLeft_kg,
  pred: try3.boostback?.pred_m,
}));
console.log('  after', JSON.stringify({
  land: try3.after?.landed, crash: try3.burn?.crashed, touch: try3.burn?.speed,
  fuel: try3.after?.fuel_kg, water: try3.burn?.water, pad_km: try3.pad_m != null ? try3.pad_m / 1000 : null,
}));

const official = try3;
const { session } = official;
const snap = serializeSnapshot(session.st, { tag: 'booster-exp4', craft: 'Mun Express' });
const snapPath = writeSnapshot(snap);

const strip = (run) => {
  if (!run) return null;
  const { session: _s, ...rest } = run;
  return rest;
};

const result = {
  lko: {
    craft: 'Mun Express',
    reserve_kg: lkoReserve,
    drop: lkoDropKin,
    upper: {
      reason: upper.reason,
      orbitText: upper.orbitText,
      bound: upper.bound,
      peKm: upper.peKm,
      apKm: upper.apKm,
      fuel_kg: upper.fuel_kg,
      titanOn: upper.titanOn,
    },
  },
  try1: strip(try1),
  try2: strip(try2),
  try3: strip(try3),
  official: official.label,
  design: { name: 'Mun Express', stack: session.lastDesign?.stack, radials: session.lastDesign?.radials },
  landing: {
    craft: 'Mun Express',
    ...strip(official),
    snapshot: snapPath,
  },
};
writeFileSync(join(ROOT, 'logs/booster-exp4.json'), JSON.stringify(result, null, 2));
console.log('\nwrote', snapPath);
console.log('wrote logs/booster-exp4.json');
const touch = official.burn?.speed;
const padKm = official.pad_m != null ? (official.pad_m / 1000).toFixed(2) : '?';
if (official.claimedLanding) {
  console.log(`LANDING  touchdown ${touch.toFixed(2)} m/s  AGL ${official.after.agl_m.toFixed(2)}  fuel ${official.after.fuel_kg.toFixed(0)} kg  water=${!!official.water}  pad=${padKm} km  claimedPad=${official.claimedPad}  body=${official.after.body}`);
} else {
  console.log(`NO LANDING  dead=${official.after?.dead} land=${official.after?.landed} touch=${touch} pad=${padKm} km`);
}
