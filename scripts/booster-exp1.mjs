// First honest booster-recovery experiment.
// Cheap hop: stage Titan with fuel left, switch, suicide-burn that vessel.
// Also measure leftover Titan fuel on stock Mun Express / Duna Hauler.
// No teleport. No invented telemetry.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SimSession } from '../mcp/session.mjs';
import { BODIES } from '../src/constants.js';
import { heightAt } from '../src/terrain.js';
import { ascentTick, pointState } from '../src/agent-muscles.js';
import { runPoweredDescent } from '../src/agent-burns.js';
import { serializeSnapshot, writeSnapshot } from '../mcp/snapshot.mjs';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
mkdirSync(join(ROOT, 'logs'), { recursive: true });
mkdirSync(join(ROOT, 'logs/snapshots'), { recursive: true });

const HOP = {
  name: 'Booster Hop',
  stack: [
    'pod-mk1', 'tank-s', 'eng-kestrel',
    'decoupler-l', 'adapter',
    'tank-xl', 'eng-titan',
  ],
  radials: [
    { part: 'legs', sym: 1, host: 5 },
    { part: 'fins', sym: 1, host: 5 },
  ],
};

function aglOf(st) {
  const body = BODIES[st.body];
  const u = st.pos.clone().normalize();
  const alt = st.pos.length() - body.radius;
  const th = alt < 95_000 ? heightAt(st.body, u) : 0;
  return alt - th - (st.massProps?.comY ?? 0);
}

function sectionFuel(st, pred) {
  return st.parts.filter(pred).reduce((s, p) => s + (p.fuel || 0), 0);
}

function leftoverOnStock(craft) {
  const session = new SimSession();
  session.newFlight(craft);
  session.stage();
  session.setThrottle(1);
  let dropped = null;
  let reason = 'timeout';
  const t0 = session.st.t;
  for (let i = 0; i < 12_000 && !session.st.dead; i++) {
    const tick = ascentTick(session.st, { plan: session.plan, stageIdx: session.stageIdx });
    pointState(session.st, tick.dir);
    session.st.throttle = tick.throttle;
    if (tick.stage) {
      const before = session.vessels.length;
      const out = session.stage();
      if (out.droppedId) {
        dropped = session.vesselById(out.droppedId);
        reason = 'decouple';
        break;
      }
      if (session.vessels.length > before) {
        dropped = session.vessels[session.vessels.length - 1];
        reason = 'decouple';
        break;
      }
    }
    session.step(0.1);
    if (tick.done) { reason = 'orbit'; break; }
    if (session.st.t - t0 > 400) { reason = 'time-cap'; break; }
  }
  if (!dropped) {
    return {
      craft,
      reason,
      t: session.st.t,
      alt_m: session.alt(),
      vessels: session.vessels.length,
      activeFuel_kg: session.fuelLeft(),
      boosterFuel_kg: null,
      boosterParts: [],
    };
  }
  const fuel = dropped.st.parts.reduce((s, p) => s + (p.fuel || 0), 0);
  return {
    craft,
    reason,
    t: session.st.t,
    alt_m: dropped.st.pos.length() - BODIES[dropped.st.body].radius,
    vessels: session.vessels.length,
    boosterId: dropped.id,
    boosterFuel_kg: fuel,
    boosterParts: dropped.st.parts.map((p) => p.def.name),
    titanIgnited: dropped.st.parts.some((p) => /Titan/.test(p.def.name) && p.ignited),
  };
}

console.log('=== leftover Titan on stock (real ascent) ===');
const leftover = {};
for (const craft of ['Mun Express', 'Duna Hauler']) {
  console.log('  flying', craft, '...');
  leftover[craft] = leftoverOnStock(craft);
  const r = leftover[craft];
  console.log(`  ${craft}: reason=${r.reason} t=${r.t?.toFixed(1)} alt=${r.alt_m?.toFixed(0)} m  boosterFuel=${r.boosterFuel_kg} kg  parts=${(r.boosterParts || []).join(', ')}`);
}

console.log('\n=== hop experiment ===');
const session = new SimSession();
session.newFlightFromDesign(HOP);
const ign = session.stage();
console.log('  ignite', ign.staged, ign.ignite);
session.setThrottle(1);
pointState(session.st, session.st.pos);

let stagedAt = null;
for (let i = 0; i < 400 && !session.st.dead; i++) {
  pointState(session.st, session.st.pos);
  session.st.throttle = 1;
  session.step(0.05);
  const alt = session.alt();
  if (alt > 7000 || session.st.t > 14) {
    stagedAt = {
      t: session.st.t,
      alt_m: alt,
      speed_ms: session.st.vel.length(),
      fuel_kg: session.fuelLeft(),
      titanFuel_kg: sectionFuel(session.st, (p) => p.stackIndex >= 3),
    };
    break;
  }
}
if (!stagedAt) {
  console.error('never reached stage altitude');
  process.exit(2);
}
console.log('  stage at', JSON.stringify(stagedAt));

const sep = session.stage();
console.log('  decouple', sep.droppedId, sep.droppedName, 'vessels', session.vessels.length);
if (!sep.droppedId) {
  console.error('R1 failed: no dropped vessel');
  process.exit(2);
}
const booster = session.vesselById(sep.droppedId);
const atSep = {
  id: booster.id,
  name: booster.name,
  fuel_kg: booster.st.parts.reduce((s, p) => s + (p.fuel || 0), 0),
  parts: booster.st.parts.map((p) => p.def.name),
  ignited: booster.st.parts.filter((p) => p.ignited).map((p) => p.def.name),
  alt_m: booster.st.pos.length() - BODIES.kerbin.radius,
  speed_ms: booster.st.vel.length(),
  agl_m: aglOf(booster.st),
};

session.setActive(sep.droppedId);
console.log('  switched to', session.activeId, 'fuel', session.fuelLeft().toFixed(0), 'kg');
session.setLegs(true);

const before = {
  t: session.st.t,
  alt_m: session.alt(),
  agl_m: aglOf(session.st),
  speed_ms: session.st.vel.length(),
  fuel_kg: session.fuelLeft(),
};
const burn = runPoweredDescent(session.st, 'kerbin', { useChutes: false, brakeFrac: 0.45 });
session.refreshMass();
const after = {
  t: session.st.t,
  alt_m: session.alt(),
  agl_m: aglOf(session.st),
  speed_ms: session.st.vel.length(),
  fuel_kg: session.fuelLeft(),
  landed: !!session.st.landed,
  dead: !!session.st.dead,
  body: session.st.body,
};
const impact = (session.lastEvents || []).filter((e) => e.type === 'landed' || e.type === 'crashed');
console.log('  burn', JSON.stringify(burn));
console.log('  after', JSON.stringify(after));
console.log('  events', JSON.stringify(impact));

const snap = serializeSnapshot(session.st, { tag: 'booster-exp1', craft: 'Booster Hop' });
const snapPath = writeSnapshot(snap);
const result = {
  leftover,
  hop: HOP,
  stagedAt,
  atSep,
  before,
  after,
  burn,
  impact,
  snapshot: snapPath,
  claimedLanding: !!(after.landed && !after.dead && after.agl_m < 2),
};
writeFileSync(join(ROOT, 'logs/booster-exp1.json'), JSON.stringify(result, null, 2));
console.log('\nwrote', snapPath);
console.log('wrote logs/booster-exp1.json');
const touch = burn.speed;
console.log(result.claimedLanding
  ? `LANDING  touchdown ${touch == null ? '?' : touch.toFixed(2)} m/s  AGL ${after.agl_m.toFixed(2)}  fuel ${after.fuel_kg.toFixed(0)} kg  water=${!!burn.water}`
  : `NO LANDING  dead=${after.dead} landed=${after.landed} speed=${after.speed_ms.toFixed(2)} AGL=${after.agl_m.toFixed(2)} touch=${touch}`);
