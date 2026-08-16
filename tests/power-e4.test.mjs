// E4: rails / warp / agent coast walk the same EC step as realtime.
import { Vector3, Quaternion } from 'three';
import { buildVesselParts, stackGeometry, computeSections, massProps } from '../src/vessel.js';
import { physicsStep } from '../src/physics.js';
import { elementsFromState, propagate } from '../src/orbits.js';
import { BODIES, getInertialState } from '../src/constants.js';
import { coastRailsOnState } from '../src/agent-muscles.js';
import {
  fillEC, clampEC, ecCap, SAS_EC_PER_S,
  sunVectorInertial, eclipsed, panelNormal, panelGen, stepECOnRails,
  sasWouldPay, ecTelemetry,
} from '../src/power.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

function craft() {
  const parts = buildVesselParts({
    name: 'e4',
    stack: ['pod-mk1'],
    radials: [{ part: 'panel-oxstat', sym: 1, host: 0 }],
  });
  const geom = stackGeometry(parts);
  const mp = massProps(parts, geom);
  return { parts, geom, mp };
}

/** Place on the sun-facing / anti-sun side of Kerbin using the real sun vector.
 *  Speed is * 1.002 so elementsFromState has a real e (exact circular → M0=π).
 */
function placeBySun({ night = false, t = 0, alt = 80_000 } = {}) {
  const { parts, geom, mp } = craft();
  const bodyPos = getInertialState('kerbin', t).pos;
  const sunFromBody = bodyPos.clone().negate().normalize();
  const r = BODIES.kerbin.radius + alt;
  const radial = night ? sunFromBody.clone().negate() : sunFromBody;
  const pos = radial.multiplyScalar(r);
  const vel = new Vector3().crossVectors(new Vector3(0, 1, 0), pos).normalize()
    .multiplyScalar(Math.sqrt(BODIES.kerbin.mu / r) * 1.002);
  const quat = new Quaternion();
  const st = {
    t, body: 'kerbin',
    pos, vel, quat, angVel: new Vector3(),
    throttle: 0, landed: false, dead: false,
    parts, geom, sections: computeSections(parts), massProps: mp,
    controls: { pitch: 0, yaw: 0, roll: 0 },
    sas: false, sasMode: 'hold', sasTarget: quat.clone(),
  };
  fillEC(st);
  return st;
}

/** fromDayDeg=0 is noon; 90° is the terminator. Velocity toward night. */
function placeFromNoon({ fromDayDeg = 0, t = 0, alt = 80_000 } = {}) {
  const { parts, geom, mp } = craft();
  const bodyPos = getInertialState('kerbin', t).pos;
  const sunFromBody = bodyPos.clone().negate().normalize();
  const r = BODIES.kerbin.radius + alt;
  const east = new Vector3().crossVectors(new Vector3(0, 1, 0), sunFromBody).normalize();
  const ang = (fromDayDeg * Math.PI) / 180;
  const radial = sunFromBody.clone().multiplyScalar(Math.cos(ang)).addScaledVector(east, Math.sin(ang));
  const pos = radial.multiplyScalar(r);
  const vel = new Vector3().crossVectors(new Vector3(0, 1, 0), pos).normalize()
    .multiplyScalar(Math.sqrt(BODIES.kerbin.mu / r) * 1.002);
  const quat = new Quaternion();
  const st = {
    t, body: 'kerbin',
    pos, vel, quat, angVel: new Vector3(),
    throttle: 0, landed: false, dead: false,
    parts, geom, sections: computeSections(parts), massProps: mp,
    controls: { pitch: 0, yaw: 0, roll: 0 },
    sas: false, sasMode: 'hold', sasTarget: quat.clone(),
  };
  fillEC(st);
  return st;
}

function facePanelAtSun(st) {
  // Align the wing FACE (tangent), not the radial/span, to Kerbol.
  const sun = sunVectorInertial(st, st.t);
  const panel = st.parts.find((p) => p.def.panel);
  const bodyN = panelNormal({ quat: new Quaternion() }, panel);
  st.quat.setFromUnitVectors(bodyN, sun);
  st.sasTarget.copy(st.quat);
}

function cloneFlight(st) {
  return {
    ...st,
    pos: st.pos.clone(),
    vel: st.vel.clone(),
    quat: st.quat.clone(),
    angVel: st.angVel.clone(),
    sasTarget: st.sasTarget.clone(),
    controls: { ...st.controls },
    parts: st.parts,
    geom: st.geom,
    sections: st.sections,
    massProps: st.massProps,
  };
}

function stepPhysics(st, seconds, dt = 0.1) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    physicsStep(st, dt, []);
    st.t += dt;
  }
}

console.log('1. Night rails: no charge; SAS off stays put; SAS paying drains');
{
  const nightOff = placeBySun({ night: true });
  facePanelAtSun(nightOff);
  nightOff.ec = 40;
  clampEC(nightOff);
  nightOff.sas = false;
  const startOff = nightOff.ec;
  coastRailsOnState(nightOff, { maxS: 10, dt: 10 });
  check('night SAS-off EC unchanged', nightOff.ec === startOff, String(nightOff.ec));
  check('night still eclipsed', eclipsed(nightOff, nightOff.t) === 'kerbin', String(eclipsed(nightOff, nightOff.t)));
  check('night gen 0', panelGen(nightOff, nightOff.t) === 0, String(panelGen(nightOff, nightOff.t)));
  check('night t advanced 10', Math.abs(nightOff.t - 10) < 1e-9, String(nightOff.t));

  const nightOn = placeBySun({ night: true });
  facePanelAtSun(nightOn);
  nightOn.ec = 50;
  clampEC(nightOn);
  nightOn.sas = true;
  nightOn.sasMode = 'hold';
  nightOn.sasTarget.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
  check('SAS 90° would pay', sasWouldPay(nightOn) === true);
  coastRailsOnState(nightOn, { maxS: 10, dt: 10 });
  const expect = 50 - SAS_EC_PER_S * 10;
  check('night SAS-on EC dropped 5', Math.abs(nightOn.ec - expect) < 1e-9, `${nightOn.ec} vs ${expect}`);
}

console.log('2. Day rails charges; matches physicsStep 10 s (same step)');
{
  const dayRails = placeBySun({ night: false });
  facePanelAtSun(dayRails);
  dayRails.ec = 0;
  clampEC(dayRails);
  dayRails.sas = false;
  const gen0 = panelGen(dayRails, 0);
  const dayPhys = cloneFlight(dayRails);
  dayPhys.ec = 0;

  coastRailsOnState(dayRails, { maxS: 10, dt: 10 });
  stepPhysics(dayPhys, 10, 0.1);

  check('day rails EC rose', dayRails.ec > 7, String(dayRails.ec));
  check('day rails ≈ 10 * panelGen', Math.abs(dayRails.ec - 10 * gen0) < 0.05, `${dayRails.ec} vs ${10 * gen0}`);
  check('day rails still sunlit', eclipsed(dayRails, dayRails.t) == null, String(eclipsed(dayRails, dayRails.t)));
  check('physics 10s EC rose', dayPhys.ec > 7, String(dayPhys.ec));
  check('rails vs physics EC match', Math.abs(dayRails.ec - dayPhys.ec) < 0.05,
    `rails=${dayRails.ec} phys=${dayPhys.ec}`);
  check('cap still 50', ecCap(dayRails) === 50, String(ecCap(dayRails)));
}

console.log('3. High-warp chunk sees eclipse at the new state (not stale day)');
{
  // 80° from noon is still day; 200 s on an 80 km circle crosses the terminator.
  const near = placeFromNoon({ fromDayDeg: 80 });
  facePanelAtSun(near);
  near.ec = 0;
  clampEC(near);
  near.sas = false;
  const e0 = eclipsed(near, near.t);
  const g0 = panelGen(near, near.t);
  check('start just before terminator is day', e0 == null, String(e0));
  check('start gen > 0 (would be the stale day value)', g0 > 0.1, String(g0));

  coastRailsOnState(near, { maxS: 200, dt: 200 });
  const e1 = eclipsed(near, near.t);
  const tel = ecTelemetry(near, near.t);
  check('end eclipsed by kerbin', e1 === 'kerbin', String(e1));
  check('end telemetry eclipsed matches eclipsed()', tel.eclipsed === e1, String(tel.eclipsed));
  check('end gen 0 (not stale day)', tel.ecGen === 0, String(tel.ecGen));
  check('end EC did not rise on a night eval', near.ec === 0, String(near.ec));
  check('t advanced 200', Math.abs(near.t - 200) < 1e-6, String(near.t));
}

console.log('4. EC tick does not move pos/vel; coast matches propagate-only');
{
  const a = placeBySun({ night: false });
  facePanelAtSun(a);
  a.ec = 0;
  const b = cloneFlight(a);
  b.ec = 0;

  const pos0 = a.pos.clone();
  const vel0 = a.vel.clone();
  stepECOnRails(a, 10);
  check('helper leaves pos', a.pos.distanceTo(pos0) === 0, String(a.pos.distanceTo(pos0)));
  check('helper leaves vel', a.vel.distanceTo(vel0) === 0, String(a.vel.distanceTo(vel0)));
  check('helper still charged', a.ec > 7, String(a.ec));

  const el = elementsFromState(b.pos, b.vel, BODIES.kerbin.mu, b.t);
  const coast = cloneFlight(b);
  coast.ec = 0;
  coastRailsOnState(coast, { maxS: 10, dt: 10 });
  const pv = propagate(el, b.t + 10);
  check('coast pos = propagate-only', coast.pos.distanceTo(pv.pos) < 1e-6, String(coast.pos.distanceTo(pv.pos)));
  check('coast vel = propagate-only', coast.vel.distanceTo(pv.vel) < 1e-6, String(coast.vel.distanceTo(pv.vel)));
}

console.log('5. SAS off on rails never pays; hold-on-target is free');
{
  const hold = placeBySun({ night: true });
  facePanelAtSun(hold);
  hold.ec = 50;
  hold.sas = true;
  hold.sasMode = 'hold';
  hold.sasTarget.copy(hold.quat);
  check('aligned hold would not pay', sasWouldPay(hold) === false);
  coastRailsOnState(hold, { maxS: 10, dt: 10 });
  check('aligned hold EC stays 50', hold.ec === 50, String(hold.ec));

  const off = placeBySun({ night: true });
  off.ec = 50;
  off.sas = false;
  off.sasTarget.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
  check('SAS off would not pay', sasWouldPay(off) === false);
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\npower-e4 tests passed');
