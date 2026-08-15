// R3: 80 km chaser vs 100 km target → range < 5 km, |rel vel| < 20 m/s.
import { SimSession } from '../mcp/session.mjs';
import { BODIES } from '../src/constants.js';
import { elementsFromState, shipHohmann, timeToApoapsis, stateFromKepler } from '../src/orbits.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

const CRAFT = {
  name: 'Rdv',
  stack: ['pod-mk1', 'tank-m', 'eng-kestrel'],
  radials: [],
};

const session = new SimSession();
const dummyC = stateFromKepler('kerbin', { ap_m: 80_000, pe_m: 80_000, ta_deg: 0 });
const dummyT = stateFromKepler('kerbin', { ap_m: 100_000, pe_m: 100_000, ta_deg: 0 });
const plan0 = shipHohmann(dummyC.pos, dummyC.vel, dummyT.pos, dummyT.vel, BODIES.kerbin.mu);
const chaser = session.spawnOrbital(CRAFT, {
  body: 'kerbin', ap_m: 80_000, pe_m: 80_000, ta_deg: 0, name: 'Chaser',
});
const target = session.spawnOrbital(CRAFT, {
  body: 'kerbin', ap_m: 100_000, pe_m: 100_000, ta_deg: plan0.phaseDeg, name: 'Target',
});
session.activeId = chaser.id;
session.setTarget(target.id);

const tgt = session.vesselById(target.id);
const plan = shipHohmann(session.st.pos, session.st.vel, tgt.st.pos, tgt.st.vel, BODIES.kerbin.mu);
console.log('  hohmann', {
  phase: plan.phase?.toFixed(2),
  phaseDeg: plan.phaseDeg.toFixed(2),
  dv1: plan.dv1.toFixed(2),
  dv2: plan.dv2.toFixed(2),
  wait: plan.wait.toFixed(1),
  tT: plan.tT.toFixed(1),
});

function coastAll(seconds) {
  let left = seconds;
  session.setWarp(8);
  while (left > 0) {
    const chunk = Math.min(120, left);
    session.coast(chunk);
    left -= chunk;
  }
  session.setWarp(0);
}

function burnUntil(pred, maxS = 8) {
  for (const p of session.st.parts) if (p.def.engine) p.ignited = true;
  session.point('prograde');
  session.setThrottle(1);
  const t0 = session.st.t;
  while (session.st.t - t0 < maxS) {
    session.step(0.1);
    if (pred()) break;
  }
  session.setThrottle(0);
}

if (plan.wait > 2) coastAll(plan.wait);

const R = BODIES.kerbin.radius;
burnUntil(() => {
  try {
    const el = elementsFromState(session.st.pos, session.st.vel, BODIES.kerbin.mu, session.st.t);
    return el.ra - R >= 99_500;
  } catch { return false; }
}, 12);

let el = elementsFromState(session.st.pos, session.st.vel, BODIES.kerbin.mu, session.st.t);
const tAp = timeToApoapsis(el, session.st.t);
console.log('  after dv1', { ap: (el.ra - R).toFixed(0), pe: (el.rp - R).toFixed(0), tAp: tAp.toFixed(1) });
check('transfer ap raised', el.ra - R > 90_000, String(el.ra - R));

if (Number.isFinite(tAp) && tAp > 1) coastAll(tAp);

session.point('prograde');
burnUntil(() => {
  try {
    const e2 = elementsFromState(session.st.pos, session.st.vel, BODIES.kerbin.mu, session.st.t);
    return e2.rp - R > 95_000 && Math.abs(e2.ra - e2.rp) < 8_000;
  } catch { return false; }
}, 12);

const tlm = session.telemetry();
console.log('  rdv', {
  range_m: tlm.range_m,
  rel_speed_ms: tlm.rel_speed_ms,
  closing_ms: tlm.closing_ms,
  ap_m: tlm.ap_m,
  pe_m: tlm.pe_m,
});
check('range < 5 km', Number.isFinite(tlm.range_m) && tlm.range_m < 5e3, String(tlm.range_m));
check('|rel vel| < 20 m/s', Number.isFinite(tlm.rel_speed_ms) && tlm.rel_speed_ms < 20, String(tlm.rel_speed_ms));

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nrendezvous tests passed');
