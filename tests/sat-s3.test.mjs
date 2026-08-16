// S3: antenna + LOS to Kerbin center. Probe mutes when blocked. Crewed always talks.
import { Vector3, Quaternion } from 'three';
import { PARTS } from '../src/parts.js';
import { STOCK } from '../src/stock.js';
import { BODIES, getInertialState } from '../src/constants.js';
import { buildVesselParts, stackGeometry, computeSections, massProps, hasBrain } from '../src/vessel.js';
import { fillEC } from '../src/power.js';
import { eclipsed } from '../src/power.js';
import { commState, canCommand, hasCrew, hasAntenna } from '../src/comms.js';
import { pointState } from '../src/agent-muscles.js';
import { SimSession } from '../mcp/session.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

function eyeParts({ antenna = true } = {}) {
  const design = {
    name: 'Kerbin Eye',
    stack: [...STOCK['Kerbin Eye'].stack],
    radials: STOCK['Kerbin Eye'].radials
      .filter((r) => antenna || r.part !== 'antenna-comm')
      .map((r) => ({ ...r })),
  };
  return buildVesselParts(design);
}

function makeSt(parts, { body, pos, vel, t = 0, sas = true } = {}) {
  const geom = stackGeometry(parts);
  const mp = massProps(parts, geom);
  const quat = new Quaternion();
  const st = {
    t, body,
    pos, vel: vel ?? new Vector3(),
    quat, angVel: new Vector3(),
    throttle: 0, landed: false, dead: false,
    parts, geom, sections: computeSections(parts), massProps: mp,
    controls: { pitch: 0, yaw: 0, roll: 0 },
    sas, sasMode: 'hold', sasTarget: quat.clone(),
  };
  fillEC(st);
  return st;
}

/** Day-side 80 km Kerbin (same geometry as probe-sat-s1 / s2 placeDay). */
function placeDay({ t = 0, alt = 80_000, antenna = true } = {}) {
  const parts = eyeParts({ antenna });
  const bodyPos = getInertialState('kerbin', t).pos;
  const sunFromBody = bodyPos.clone().negate().normalize();
  const r = BODIES.kerbin.radius + alt;
  const pos = sunFromBody.multiplyScalar(r);
  const vel = new Vector3().crossVectors(new Vector3(0, 1, 0), pos).normalize()
    .multiplyScalar(Math.sqrt(BODIES.kerbin.mu / r) * 1.002);
  return makeSt(parts, { body: 'kerbin', pos, vel, t });
}

/** Night-side 80 km: anti-sun radial. Kerbin eclipses the sun; LOS to center stays. */
function placeNight({ t = 0, alt = 80_000 } = {}) {
  const parts = eyeParts();
  const bodyPos = getInertialState('kerbin', t).pos;
  const sunFromBody = bodyPos.clone().negate().normalize();
  const r = BODIES.kerbin.radius + alt;
  const pos = sunFromBody.negate().multiplyScalar(r);
  const vel = new Vector3().crossVectors(new Vector3(0, 1, 0), pos).normalize()
    .multiplyScalar(Math.sqrt(BODIES.mun.mu > 0 ? BODIES.kerbin.mu / r : 1));
  return makeSt(parts, { body: 'kerbin', pos, vel, t });
}

/**
 * Mun SOI, 60 km alt, on the Kerbin line.
 * far=true: anti-Kerbin radial (Mun between vessel and Kerbin).
 * far=false: near-side (Kerbin visible).
 * Position is computed from getInertialState('mun') / ('kerbin'), not invented.
 */
function placeMunRadial({ far = true, alt = 60_000, t = 0, antenna = true } = {}) {
  const parts = eyeParts({ antenna });
  const munIn = getInertialState('mun', t);
  const kerbinIn = getInertialState('kerbin', t);
  const munFromKerbin = munIn.pos.clone().sub(kerbinIn.pos);
  const radial = munFromKerbin.normalize();
  if (!far) radial.negate();
  const r = BODIES.mun.radius + alt;
  const pos = radial.multiplyScalar(r);
  const vel = new Vector3().crossVectors(new Vector3(0, 1, 0), pos);
  if (vel.lengthSq() < 1e-12) vel.set(0, 0, -1);
  vel.normalize().multiplyScalar(Math.sqrt(BODIES.mun.mu / r));
  return makeSt(parts, { body: 'mun', pos, vel, t });
}

console.log('1. catalog: antenna-comm has antenna: true, radial');
{
  const ant = PARTS['antenna-comm'];
  check('antenna-comm exists', !!ant);
  check('antenna: true', ant?.antenna === true);
  check('radial', ant?.radial === true);
}

console.log('2. Kerbin Eye day-side 80 km: comm ok');
{
  const st = placeDay();
  const cs = commState(st);
  const cmd = canCommand(st);
  check('hasBrain', hasBrain(st.parts) === true);
  check('hasCrew false (probe bus)', hasCrew(st.parts) === false);
  check('hasAntenna', hasAntenna(st.parts) === true);
  check('comm true', cs.comm === true, JSON.stringify(cs));
  check('commReason ok', cs.commReason === 'ok', String(cs.commReason));
  check('canCommand', cmd.ok === true, JSON.stringify(cmd));
  check('los', cs.los === true);
}

console.log('2b. LKO night still 通 (eclipsed, not muted)');
{
  const st = placeNight();
  const cs = commState(st);
  check('night eclipsed kerbin', eclipsed(st) === 'kerbin', String(eclipsed(st)));
  check('night comm true', cs.comm === true, JSON.stringify(cs));
  check('night commReason ok', cs.commReason === 'ok', String(cs.commReason));
  check('night canCommand', canCommand(st).ok === true);
}

console.log('3. same sat, no antenna: no-comm mute');
{
  const design = {
    name: 'Eye-no-ant',
    stack: [...STOCK['Kerbin Eye'].stack],
    radials: STOCK['Kerbin Eye'].radials.filter((r) => r.part !== 'antenna-comm'),
  };
  const session = new SimSession();
  session.newFlightFromDesign(design);
  const tel = session.telemetry();
  check('comm false', tel.comm === false, JSON.stringify({ comm: tel.comm, commReason: tel.commReason }));
  check('commReason no-antenna', tel.commReason === 'no-antenna', String(tel.commReason));
  check('hasBrain still', tel.brain === true);
  const th = session.setThrottle(1);
  check('throttle muted', th.ok === false);
  check('throttle reason no-comm', th.reason === 'no-comm', String(th.reason));
  check('throttle stays 0', session.st.throttle === 0, String(session.st.throttle));
  const q0 = session.st.quat.clone();
  const pt = session.point('up');
  check('point muted', pt.ok === false && pt.reason === 'no-comm', JSON.stringify({ ok: pt.ok, reason: pt.reason }));
  check('point quat unchanged',
    session.st.quat.x === q0.x && session.st.quat.y === q0.y
    && session.st.quat.z === q0.z && session.st.quat.w === q0.w);
  pointState(session.st, session.st.pos.clone().normalize());
  check('pointState quat unchanged',
    session.st.quat.x === q0.x && session.st.quat.y === q0.y
    && session.st.quat.z === q0.z && session.st.quat.w === q0.w);
}

console.log('4. Mun far side: occulted by Mun');
{
  const st = placeMunRadial({ far: true, alt: 60_000, t: 0 });
  const cs = commState(st);
  const alt = st.pos.length() - BODIES.mun.radius;
  check('body mun', st.body === 'mun');
  check('alt ~60 km', Math.abs(alt - 60_000) < 1, String(alt));
  check('comm false', cs.comm === false, JSON.stringify(cs));
  check('reason occulted/mun', cs.commReason === 'occulted:mun', String(cs.commReason));
  check('canCommand no-comm', canCommand(st).ok === false && canCommand(st).reason === 'no-comm');
}

console.log('5. Mun near side: Kerbin visible');
{
  const st = placeMunRadial({ far: false, alt: 60_000, t: 0 });
  const cs = commState(st);
  const alt = st.pos.length() - BODIES.mun.radius;
  check('body mun', st.body === 'mun');
  check('alt ~60 km', Math.abs(alt - 60_000) < 1, String(alt));
  check('comm true', cs.comm === true, JSON.stringify(cs));
  check('commReason ok', cs.commReason === 'ok', String(cs.commReason));
  check('canCommand', canCommand(st).ok === true);
}

console.log('6. Mun Express pad / LKO: crew, throttle works');
{
  const session = new SimSession();
  session.newFlight('Mun Express');
  const tel = session.telemetry();
  check('pad comm true', tel.comm === true, JSON.stringify({ comm: tel.comm, commReason: tel.commReason }));
  check('pad commReason crew', tel.commReason === 'crew', String(tel.commReason));
  check('pad hasCrew', hasCrew(session.st.parts) === true);
  const th = session.setThrottle(0.7);
  check('ksp_throttle works', th.ok !== false && session.st.throttle === 0.7, JSON.stringify({ ok: th.ok, th: session.st.throttle }));

  const parts = buildVesselParts(STOCK['Mun Express']);
  const bodyPos = getInertialState('kerbin', 0).pos;
  const sunFromBody = bodyPos.clone().negate().normalize();
  const r = BODIES.kerbin.radius + 80_000;
  const pos = sunFromBody.multiplyScalar(r);
  const vel = new Vector3().crossVectors(new Vector3(0, 1, 0), pos).normalize()
    .multiplyScalar(Math.sqrt(BODIES.kerbin.mu / r));
  const st = makeSt(parts, { body: 'kerbin', pos, vel, t: 0 });
  const cs = commState(st);
  check('LKO comm true', cs.comm === true, JSON.stringify(cs));
  check('LKO commReason crew', cs.commReason === 'crew', String(cs.commReason));
  check('LKO no antenna required', hasAntenna(st.parts) === false);
}

console.log('7. S2 still: brainless Titan → no-brain (not no-comm)');
{
  const session = new SimSession();
  session.newFlightFromDesign({ name: 'Headless', stack: ['tank-xl', 'eng-titan'], radials: [] });
  check('no brain', hasBrain(session.st.parts) === false);
  const th = session.setThrottle(1);
  check('ok false', th.ok === false);
  check('reason no-brain', th.reason === 'no-brain', String(th.reason));
  const stg = session.stage();
  check('stage no-brain', stg.ok === false && stg.reason === 'no-brain', String(stg.reason));
  const q0 = session.st.quat.clone();
  pointState(session.st, session.st.pos.clone().normalize());
  check('pointState unchanged',
    session.st.quat.x === q0.x && session.st.quat.y === q0.y
    && session.st.quat.z === q0.z && session.st.quat.w === q0.w);
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nsat-s3 tests passed');
