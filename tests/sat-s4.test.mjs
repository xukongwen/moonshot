// S4: nadir photo gates + album + EC. Same gates for human and MCP.
import { Vector3, Quaternion } from 'three';
import { PARTS } from '../src/parts.js';
import { STOCK } from '../src/stock.js';
import { BODIES, getInertialState } from '../src/constants.js';
import { buildVesselParts, stackGeometry, computeSections, massProps, hasBrain } from '../src/vessel.js';
import { fillEC } from '../src/power.js';
import { commState } from '../src/comms.js';
import { PHOTO_EC, hasCamera, canPhoto, payPhoto } from '../src/photo.js';
import { SimSession } from '../mcp/session.mjs';
import { TOOLS } from '../mcp/server.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

function eyeParts({ camera = true } = {}) {
  const design = {
    name: 'Kerbin Eye',
    stack: STOCK['Kerbin Eye'].stack.filter((id) => camera || id !== 'cam-nadir'),
    radials: STOCK['Kerbin Eye'].radials.map((r) => ({ ...r })),
  };
  if (!camera && design.stack.length === 0) design.stack = ['sat-bus-s'];
  return buildVesselParts(design);
}

function makeSt(parts, { body, pos, vel, t = 0 } = {}) {
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
    sas: true, sasMode: 'hold', sasTarget: quat.clone(),
    album: [],
  };
  fillEC(st);
  return st;
}

function placeDay({ t = 0, alt = 80_000, camera = true } = {}) {
  const parts = eyeParts({ camera });
  const bodyPos = getInertialState('kerbin', t).pos;
  const sunFromBody = bodyPos.clone().negate().normalize();
  const r = BODIES.kerbin.radius + alt;
  const pos = sunFromBody.multiplyScalar(r);
  const vel = new Vector3().crossVectors(new Vector3(0, 1, 0), pos).normalize()
    .multiplyScalar(Math.sqrt(BODIES.kerbin.mu / r) * 1.002);
  return makeSt(parts, { body: 'kerbin', pos, vel, t });
}

function placeMunFar({ t = 0, alt = 60_000 } = {}) {
  const parts = eyeParts();
  const munIn = getInertialState('mun', t);
  const kerbinIn = getInertialState('kerbin', t);
  const radial = munIn.pos.clone().sub(kerbinIn.pos).normalize();
  const r = BODIES.mun.radius + alt;
  const pos = radial.multiplyScalar(r);
  const vel = new Vector3().crossVectors(new Vector3(0, 1, 0), pos);
  if (vel.lengthSq() < 1e-12) vel.set(0, 0, -1);
  vel.normalize().multiplyScalar(Math.sqrt(BODIES.mun.mu / r));
  return makeSt(parts, { body: 'mun', pos, vel, t });
}

console.log('1. cam-nadir has camera: true');
{
  const cam = PARTS['cam-nadir'];
  check('exists', !!cam);
  check('camera: true', cam?.camera === true);
}

console.log('2. Kerbin Eye 80 km: canPhoto.ok');
{
  const st = placeDay();
  const g = canPhoto(st);
  check('hasCamera', hasCamera(st.parts) === true);
  check('ok', g.ok === true, JSON.stringify(g));
  check('reason ok', g.reason === 'ok', String(g.reason));
  check('PHOTO_EC is 5', PHOTO_EC === 5, String(PHOTO_EC));
  check('ec >= PHOTO_EC', st.ec >= PHOTO_EC, String(st.ec));
}

console.log('3. strip camera → no-camera');
{
  const st = placeDay({ camera: false });
  const g = canPhoto(st);
  check('hasCamera false', hasCamera(st.parts) === false);
  check('ok false', g.ok === false);
  check('reason no-camera', g.reason === 'no-camera', String(g.reason));
}

console.log('4. ec = 0 → no-ec; brain still true');
{
  const st = placeDay();
  st.ec = 0;
  const g = canPhoto(st);
  check('ok false', g.ok === false);
  check('reason no-ec', g.reason === 'no-ec', String(g.reason));
  check('brain still', hasBrain(st.parts) === true);
}

console.log("5. body = 'kerbol' → no-ground");
{
  const st = placeDay();
  st.body = 'kerbol';
  const g = canPhoto(st);
  check('ok false', g.ok === false);
  check('reason no-ground', g.reason === 'no-ground', String(g.reason));
}

console.log('6. headless ksp_sat_photo on Kerbin Eye');
{
  const session = new SimSession();
  session.newFlightFromDesign({
    name: 'Kerbin Eye',
    stack: [...STOCK['Kerbin Eye'].stack],
    radials: STOCK['Kerbin Eye'].radials.map((r) => ({ ...r })),
  });
  const day = placeDay();
  session.st.body = day.body;
  session.st.pos.copy(day.pos);
  session.st.vel.copy(day.vel);
  session.st.landed = false;
  session.st.dead = false;
  session.st.ec = day.ec;
  const ecBefore = session.st.ec;
  const r = await session.satPhoto();
  check('ok', r.ok === true, JSON.stringify({ ok: r.ok, reason: r.reason }));
  check('reason ok', r.reason === 'ok', String(r.reason));
  check('ec dropped by PHOTO_EC', Math.abs((ecBefore - session.st.ec) - PHOTO_EC) < 1e-9,
    `before=${ecBefore} after=${session.st.ec} cost=${PHOTO_EC}`);
  check('albumN 1', r.albumN === 1, String(r.albumN));
  check('session album length 1', session.st.album?.length === 1, String(session.st.album?.length));
  check('png null headless', r.png == null, String(r.png));
  const dump = JSON.stringify(r);
  check('no invented city/biome', !/city|biome|KSC|inland|coastal|landmark/i.test(dump), dump.slice(0, 200));
  check('no invented filename content', !r.path && !/sat-[A-Za-z]+-city/i.test(dump), String(r.path));
  check('album entry fields', !!(session.st.album[0]?.body && session.st.album[0].ecSpent === PHOTO_EC),
    JSON.stringify(session.st.album[0]));
  check('telemetry albumN', session.telemetry().albumN === 1);
  check('telemetry photoEc', session.telemetry().photoEc === PHOTO_EC);
  check('body kerbin', r.body === 'kerbin', String(r.body));
}

console.log('7. Express (no camera) → no-camera; throttle still works');
{
  const session = new SimSession();
  session.newFlight('Mun Express');
  const r = await session.satPhoto();
  check('ok false', r.ok === false);
  check('reason no-camera', r.reason === 'no-camera', String(r.reason));
  check('albumN 0', r.albumN === 0, String(r.albumN));
  const th = session.setThrottle(0.6);
  check('throttle still works', th.ok !== false && session.st.throttle === 0.6,
    JSON.stringify({ ok: th.ok, th: session.st.throttle }));
}

console.log('8. Mun far-side Eye: photo ok (onboard), comm false');
{
  const st = placeMunFar();
  const cs = commState(st);
  const g = canPhoto(st);
  check('comm false', cs.comm === false, JSON.stringify(cs));
  check('photo ok', g.ok === true, JSON.stringify(g));

  const session = new SimSession();
  session.newFlightFromDesign({
    name: 'Kerbin Eye',
    stack: [...STOCK['Kerbin Eye'].stack],
    radials: STOCK['Kerbin Eye'].radials.map((r) => ({ ...r })),
  });
  session.st.body = st.body;
  session.st.pos.copy(st.pos);
  session.st.vel.copy(st.vel);
  session.st.landed = false;
  session.st.dead = false;
  session.st.ec = st.ec;
  const r = await session.satPhoto();
  check('satPhoto ok', r.ok === true, JSON.stringify({ ok: r.ok, reason: r.reason }));
  check('satPhoto comm false', r.comm === false, String(r.comm));
  check('body mun', r.body === 'mun', String(r.body));
}

console.log('9. MCP tool landed + payPhoto clamp');
{
  check('ksp_sat_photo in TOOLS', TOOLS.some((x) => x.name === 'ksp_sat_photo'));
  const st = placeDay();
  const before = st.ec;
  payPhoto(st);
  check('payPhoto subtracts', Math.abs((before - st.ec) - PHOTO_EC) < 1e-9, String(st.ec));
  st.ec = 0;
  payPhoto(st);
  check('payPhoto does not create energy', st.ec === 0, String(st.ec));
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nsat-s4 tests passed');
