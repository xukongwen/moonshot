// S2: unmanned brain rule. Probe ships can SAS / point / hold. Debris cannot.
import { Vector3, Quaternion } from 'three';
import { STOCK } from '../src/stock.js';
import { buildVesselParts, stackGeometry, computeSections, massProps, hasBrain } from '../src/vessel.js';
import { physicsStep } from '../src/physics.js';
import { stateFromKepler } from '../src/orbits.js';
import { fillEC, wheelsLive } from '../src/power.js';
import { pointState } from '../src/agent-muscles.js';
import { SimSession } from '../mcp/session.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

function eyeOrbit({ sas = true } = {}) {
  const parts = buildVesselParts(STOCK['Kerbin Eye']);
  const geom = stackGeometry(parts);
  const mp = massProps(parts, geom);
  const kv = stateFromKepler('kerbin', { ap_m: 80_000, pe_m: 80_000, ta_deg: 0 });
  const quat = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    kv.vel.lengthSq() > 1 ? kv.vel.clone().normalize() : new Vector3(0, 0, -1),
  );
  const st = {
    t: 0, body: 'kerbin',
    pos: kv.pos, vel: kv.vel,
    quat, angVel: new Vector3(),
    throttle: 0, landed: false, dead: false,
    parts, geom, sections: computeSections(parts), massProps: mp,
    controls: { pitch: 0, yaw: 0, roll: 0 },
    sas, sasMode: 'hold', sasTarget: quat.clone(),
  };
  fillEC(st);
  return st;
}

function holdErrorDeg(st) {
  if (!st.sasTarget) return 0;
  const err = st.sasTarget.clone().multiply(st.quat.clone().invert());
  return 2 * Math.acos(Math.min(1, Math.abs(err.w))) * 180 / Math.PI;
}

console.log('1. hasBrain(Kerbin Eye) === true');
{
  const parts = buildVesselParts(STOCK['Kerbin Eye']);
  check('Kerbin Eye has brain', hasBrain(parts) === true);
  check('sat-bus-s is the core', parts.some((p) => p.alive && (p.def?.probe === true || p.def?.pod)));
}

console.log('2. hasBrain({ stack: [tank-xl, eng-titan] }) === false');
{
  const parts = buildVesselParts({ name: 'debris', stack: ['tank-xl', 'eng-titan'], radials: [] });
  check('titan debris no brain', hasBrain(parts) === false);
}

console.log('3. mk1 hopper still has brain');
{
  const parts = buildVesselParts(STOCK['Suborbital Hopper']);
  check('hopper has brain', hasBrain(parts) === true);
  check('mk1 pod is the core', parts.some((p) => p.alive && p.def?.pod && !p.def?.probe));
}

console.log('4. Kerbin Eye 80 km SAS hold stays in deadband');
{
  const st = eyeOrbit({ sas: true });
  const err0 = holdErrorDeg(st);
  for (let i = 0; i < 160; i++) {
    const evs = [];
    physicsStep(st, 0.05, evs);
    st.t += 0.05;
  }
  const err = holdErrorDeg(st);
  const alt = st.pos.length() - 600_000;
  check('still airborne', st.landed === false && !st.dead);
  check('still ~80 km', Math.abs(alt - 80_000) < 2000, String(alt));
  console.log(`  hold error ${err.toFixed(4)} deg (start ${err0.toFixed(4)})`);
  check('hold error small (deadband-ish)', err < 2, `err0=${err0} err=${err}`);
  check('brain still true after hold', hasBrain(st.parts) === true);
}

console.log('5. no-brain: setThrottle / stage / pointState do not change');
{
  const session = new SimSession();
  session.newFlightFromDesign({ name: 'Headless', stack: ['tank-xl', 'eng-titan'], radials: [] });
  check('session no brain', hasBrain(session.st.parts) === false);
  check('telemetry brain false', session.telemetry().brain === false);
  const q0 = session.st.quat.clone();
  const th = session.setThrottle(1);
  check('setThrottle ok false', th.ok === false);
  check('setThrottle reason no-brain', th.reason === 'no-brain');
  check('throttle stays 0', session.st.throttle === 0, String(session.st.throttle));
  const stageIdx0 = session.stageIdx;
  const stg = session.stage();
  check('stage ok false', stg.ok === false);
  check('stage reason no-brain', stg.reason === 'no-brain');
  check('stageIdx unchanged', session.stageIdx === stageIdx0, String(session.stageIdx));
  const dir = session.st.pos.clone().normalize();
  pointState(session.st, dir);
  check('pointState quat unchanged',
    session.st.quat.x === q0.x && session.st.quat.y === q0.y
    && session.st.quat.z === q0.z && session.st.quat.w === q0.w,
    JSON.stringify([session.st.quat.toArray(), q0.toArray()]));
}

console.log('6. ec=0 on Kerbin Eye: brain still true, wheels dead');
{
  const st = eyeOrbit();
  check('brain true with EC', hasBrain(st.parts) === true);
  check('wheels live with EC', wheelsLive(st) === true);
  st.ec = 0;
  check('brain still true at ec=0', hasBrain(st.parts) === true);
  check('wheels dead at ec=0', wheelsLive(st) === false);
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nsat-s2 tests passed');
