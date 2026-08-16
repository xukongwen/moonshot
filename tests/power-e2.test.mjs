// E2: sun flux 1/r², geometric eclipse, static OX-STAT generation, day charge / night dark.
import { Vector3, Quaternion } from 'three';
import { buildVesselParts, stackGeometry, computeSections, massProps } from '../src/vessel.js';
import { physicsStep } from '../src/physics.js';
import { stateFromKepler } from '../src/orbits.js';
import { BODIES, getInertialState } from '../src/constants.js';
import {
  fillEC, clampEC, ecCap,
  sunVectorInertial, solarFlux, eclipsed, panelNormal, panelGen, stepEC, ecTelemetry,
} from '../src/power.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

function craft({ panel = true } = {}) {
  const radials = panel ? [{ part: 'panel-oxstat', sym: 1, host: 0 }] : [];
  const parts = buildVesselParts({ name: 'e2', stack: ['pod-mk1'], radials });
  const geom = stackGeometry(parts);
  const mp = massProps(parts, geom);
  return { parts, geom, mp };
}

function placeKerbin(stLike, { ta_deg = 0, t = 0 } = {}) {
  const kv = stateFromKepler('kerbin', { ap_m: 80_000, pe_m: 80_000, ta_deg });
  const { parts, geom, mp } = craft();
  const quat = new Quaternion();
  const st = {
    t, body: 'kerbin',
    pos: kv.pos.clone(), vel: kv.vel.clone(),
    quat, angVel: new Vector3(),
    throttle: 0, landed: false, dead: false,
    parts, geom, sections: computeSections(parts), massProps: mp,
    controls: { pitch: 0, yaw: 0, roll: 0 },
    sas: false, sasMode: 'hold', sasTarget: quat.clone(),
    ...stLike,
  };
  if (!st.parts) {
    st.parts = parts; st.geom = geom; st.massProps = mp;
    st.sections = computeSections(parts);
  }
  fillEC(st);
  return st;
}

/** Place on the sun-facing / anti-sun side of Kerbin using the real sun vector. */
function placeBySun({ night = false, t = 0, alt = 80_000 } = {}) {
  const { parts, geom, mp } = craft();
  const bodyPos = getInertialState('kerbin', t).pos;
  const sunFromBody = bodyPos.clone().negate().normalize(); // Kerbin → Kerbol
  const r = BODIES.kerbin.radius + alt;
  const radial = night ? sunFromBody.clone().negate() : sunFromBody;
  const pos = radial.multiplyScalar(r);
  const what = new Vector3(0, 1, 0);
  const vel = new Vector3().crossVectors(what, pos).normalize()
    .multiplyScalar(Math.sqrt(BODIES.kerbin.mu / r));
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

function facePanelAway(st) {
  const sun = sunVectorInertial(st, st.t);
  const panel = st.parts.find((p) => p.def.panel);
  const bodyN = panelNormal({ quat: new Quaternion() }, panel);
  st.quat.setFromUnitVectors(bodyN, sun.clone().negate());
  st.sasTarget.copy(st.quat);
}

function stepSeconds(st, seconds, dt = 0.1) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    physicsStep(st, dt, []);
    st.t += dt;
  }
}

console.log('1. Flux at Kerbin ≈ 1; Duna is (rK/rD)²');
{
  const day = placeBySun({ night: false, t: 0 });
  const fluxK = solarFlux(day, 0);
  check('Kerbin-orbit flux ≈ 1', Math.abs(fluxK - 1) < 0.01, String(fluxK));

  const duna = {
    t: 0, body: 'duna',
    pos: new Vector3(),
    quat: new Quaternion(),
    parts: [],
  };
  const fluxD = solarFlux(duna, 0);
  const expectD = (BODIES.kerbin.orbitRadius / BODIES.duna.orbitRadius) ** 2;
  check('Duna flux equals (rK/rD)²', Math.abs(fluxD - expectD) < 1e-12, `${fluxD} vs ${expectD}`);
  check('Duna flux < Kerbin flux', fluxD < fluxK, `${fluxD} vs ${fluxK}`);

  // formula at the vessel, not a guessed constant
  const rToSun = getInertialState('duna', 0).pos.length();
  check('Duna rToKerbol is orbitRadius', Math.abs(rToSun - BODIES.duna.orbitRadius) < 1e-3, String(rToSun));
}

console.log('2. Eclipse: night side yes, day side no (geometric)');
{
  const day = placeBySun({ night: false, t: 0 });
  const night = placeBySun({ night: true, t: 0 });
  const eDay = eclipsed(day, 0);
  const eNight = eclipsed(night, 0);
  check('day not eclipsed', eDay == null, String(eDay));
  check('night eclipsed by kerbin', eNight === 'kerbin', String(eNight));

  // same geometry via true anomaly at t=0 (sun from Kerbin is +X, ta=0 is +X)
  const taDay = placeKerbin({}, { ta_deg: 0, t: 0 });
  const taNight = placeKerbin({}, { ta_deg: 180, t: 0 });
  check('ta=0 day not eclipsed', eclipsed(taDay, 0) == null, String(eclipsed(taDay, 0)));
  check('ta=180 night eclipsed', eclipsed(taNight, 0) === 'kerbin', String(eclipsed(taNight, 0)));

  // sun vector is toward Kerbol, not a decorative constant
  const sun = sunVectorInertial(day, 0);
  const vin = getInertialState('kerbin', 0).pos.add(day.pos);
  const expectSun = vin.clone().negate().normalize();
  check('sun vector matches inertial Kerbol', sun.distanceTo(expectSun) < 1e-9, sun.toArray().join(','));
}

console.log('3. Panel: face-on ≈ 0.8 * flux; face-away 0; eclipsed 0');
{
  const day = placeBySun({ night: false, t: 0 });
  facePanelAtSun(day);
  const flux = solarFlux(day, 0);
  const n = panelNormal(day, day.parts.find((p) => p.def.panel));
  const sun = sunVectorInertial(day, 0);
  const ndot = n.dot(sun);
  const gen = panelGen(day, 0);
  check('face-on n·sun ≈ 1', Math.abs(ndot - 1) < 1e-9, String(ndot));
  check('face-on gen = 0.8 * flux * n·sun', Math.abs(gen - 0.8 * flux * Math.max(0, ndot)) < 1e-12, String(gen));
  check('face-on gen ≈ 0.8', Math.abs(gen - 0.8) < 0.01, String(gen));

  facePanelAway(day);
  const genAway = panelGen(day, 0);
  check('face-away gen 0', genAway === 0, String(genAway));

  const night = placeBySun({ night: true, t: 0 });
  facePanelAtSun(night);
  const genNight = panelGen(night, 0);
  check('eclipsed gen 0', genNight === 0, String(genNight));
  check('eclipsed telemetry', ecTelemetry(night, 0).eclipsed === 'kerbin');
  check('eclipsed ecGen 0', ecTelemetry(night, 0).ecGen === 0, String(ecTelemetry(night, 0).ecGen));
}

console.log('4. Daytime charge / night stays empty (physicsStep 10 s)');
{
  const day = placeBySun({ night: false, t: 0 });
  facePanelAtSun(day);
  day.ec = 0;
  clampEC(day);
  day.sas = false;
  const gen0 = panelGen(day, 0);
  stepSeconds(day, 10, 0.1);
  check('day EC rose', day.ec > 7, String(day.ec));
  check('day EC ≈ 10 * gen', Math.abs(day.ec - 10 * gen0) < 0.05, `${day.ec} vs ${10 * gen0}`);
  check('day still not eclipsed', eclipsed(day, day.t) == null, String(eclipsed(day, day.t)));
  check('still airborne day', day.landed === false && !day.dead);

  const night = placeBySun({ night: true, t: 0 });
  facePanelAtSun(night);
  night.ec = 0;
  clampEC(night);
  night.sas = false;
  stepSeconds(night, 10, 0.1);
  check('night EC stays 0', night.ec === 0, String(night.ec));
  check('night still eclipsed', eclipsed(night, night.t) === 'kerbin', String(eclipsed(night, night.t)));

  // stepEC itself, no physics
  const direct = placeBySun({ night: false, t: 0 });
  facePanelAtSun(direct);
  direct.ec = 0;
  const g = stepEC(direct, 10, 0);
  check('stepEC 10s ≈ 8', Math.abs(direct.ec - g * 10) < 1e-12, String(direct.ec));
  check('cap still 50', ecCap(direct) === 50, String(ecCap(direct)));
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\npower-e2 tests passed');
