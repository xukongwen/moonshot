// E1: vessel EC pool, SAS drain, wheels gate, snapshot fill/persist.
import { Vector3, Quaternion } from 'three';
import { buildVesselParts, stackGeometry, computeSections, massProps } from '../src/vessel.js';
import { physicsStep } from '../src/physics.js';
import { stateFromKepler } from '../src/orbits.js';
import { snapshotFromState } from '../src/save.js';
import { applySnapshotToState, serializeSnapshot } from '../mcp/snapshot.mjs';
import { fillEC, paySAS, wheelsLive, ecCap, clampEC } from '../src/power.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

function mk1Airborne({ sas = true } = {}) {
  const parts = buildVesselParts({ name: 'mk1', stack: ['pod-mk1'], radials: [] });
  const geom = stackGeometry(parts);
  const mp = massProps(parts, geom);
  const kv = stateFromKepler('kerbin', { ap_m: 80_000, pe_m: 80_000, ta_deg: 0 });
  const quat = new Quaternion();
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

console.log('1. Mk1-only fillEC === 50');
{
  const st = mk1Airborne();
  check('cap 50', ecCap(st) === 50, String(ecCap(st)));
  check('fillEC 50', st.ec === 50, String(st.ec));
}

console.log('2. paySAS 2 s drains 1.0');
{
  const st = mk1Airborne();
  const paid = paySAS(st, 2);
  check('paid 1.0', Math.abs(paid - 1) < 1e-6, String(paid));
  check('ec 49', Math.abs(st.ec - 49) < 1e-6, String(st.ec));
}

console.log('3. wheelsLive false at 0');
{
  const st = mk1Airborne();
  st.ec = 0;
  check('dead at 0', wheelsLive(st) === false);
  st.ec = 1e-12;
  check('dead near 0', wheelsLive(st) === false);
  st.ec = 0.01;
  check('live above eps', wheelsLive(st) === true);
}

console.log('4. snapshot without ec loads to cap');
{
  const st = mk1Airborne();
  const snap = snapshotFromState(st, { tag: 'e1-old' });
  delete snap.ec;
  const dest = mk1Airborne();
  dest.ec = 3;
  applySnapshotToState(dest, snap);
  check('missing ec fills cap', dest.ec === 50, String(dest.ec));
}

console.log('5. snapshot with ec: 12 persists');
{
  const st = mk1Airborne();
  const snap = serializeSnapshot(st, { tag: 'e1-ec' });
  snap.ec = 12;
  const dest = mk1Airborne();
  applySnapshotToState(dest, snap);
  check('ec 12 persists', dest.ec === 12, String(dest.ec));
  check('serialize has ec field', Object.prototype.hasOwnProperty.call(serializeSnapshot(st), 'ec'));
}

console.log('6. physics SAS drain + wheels gate');
{
  const st = mk1Airborne();
  // 90° hold error so SAS must apply wheel torque
  st.sasTarget.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
  const start = st.ec;
  for (let i = 0; i < 200; i++) {
    const evs = [];
    physicsStep(st, 0.1, evs);
    st.t += 0.1;
  }
  check('ec dropped over 20s', st.ec < start - 0.05, `${st.ec} vs start ${start}`);
  check('still airborne', st.landed === false && !st.dead);

  // Force empty. Reset spin. Same large error. Wheels must not drive angVel.
  st.ec = 0;
  clampEC(st);
  st.angVel.set(0, 0, 0);
  st.quat.identity();
  st.sasTarget.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
  const w0 = st.angVel.length();
  for (let i = 0; i < 20; i++) {
    const evs = [];
    physicsStep(st, 0.1, evs);
    st.t += 0.1;
  }
  const wDead = st.angVel.length();
  check('wheelsLive false after empty', wheelsLive(st) === false);
  check('ec stays 0', st.ec === 0, String(st.ec));

  // Control: same setup with full battery — wheels should spin it up.
  const live = mk1Airborne();
  live.angVel.set(0, 0, 0);
  live.quat.identity();
  live.sasTarget.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
  for (let i = 0; i < 20; i++) {
    const evs = [];
    physicsStep(live, 0.1, evs);
    live.t += 0.1;
  }
  const wLive = live.angVel.length();
  check('live wheels produce angVel', wLive > 0.01, String(wLive));
  check('empty wheels much smaller angVel', wDead < wLive * 0.15, `dead=${wDead} live=${wLive} start=${w0}`);
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\npower-e1 tests passed');
