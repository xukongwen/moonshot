// Solar-system tree: parent-relative states, inertial helpers, generic SOI.
import { Vector3 } from 'three';
import {
  BODIES, getBodyState, getInertialState, getRelativeState, childrenOf,
  MUN_OMEGA, MUN_PHASE0,
} from '../src/constants.js';
import { checkSOI } from '../src/physics.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
}

const aMun = 12_000_000;
const th0 = MUN_PHASE0;
const munPos0 = new Vector3(aMun * Math.cos(th0), 0, -aMun * Math.sin(th0));
const munVel0 = new Vector3(
  -aMun * MUN_OMEGA * Math.sin(th0), 0, -aMun * MUN_OMEGA * Math.cos(th0),
);

{
  const s = getBodyState('mun', 0);
  check('getBodyState(mun, 0) pos matches old formula', s.pos.distanceTo(munPos0) < 1e-6,
    `err=${s.pos.distanceTo(munPos0)}`);
  check('getBodyState(mun, 0) vel matches old formula', s.vel.distanceTo(munVel0) < 1e-9,
    `err=${s.vel.distanceTo(munVel0)}`);
}

check('MUN_PHASE0 is 1.7', MUN_PHASE0 === 1.7, `phase0=${MUN_PHASE0}`);
check('MUN_OMEGA equals sqrt(kerbin.mu / 12e6**3)',
  Math.abs(MUN_OMEGA - Math.sqrt(BODIES.kerbin.mu / aMun ** 3)) < 1e-18,
  `omega=${MUN_OMEGA}`);
check('mun SMA unchanged', BODIES.mun.orbitRadius === aMun);
check('mun mu/radius/soi unchanged',
  BODIES.mun.mu === 6.5138e10 && BODIES.mun.radius === 200_000 && BODIES.mun.soi === 2_429_559);

{
  const t = 12345.6;
  const munI = getInertialState('mun', t);
  const kerI = getInertialState('kerbin', t);
  const munR = getBodyState('mun', t);
  check('getInertialState(mun) = inertial(kerbin) + getBodyState(mun)',
    munI.pos.distanceTo(kerI.pos.clone().add(munR.pos)) < 1e-3
    && munI.vel.distanceTo(kerI.vel.clone().add(munR.vel)) < 1e-6);
}

{
  const t = 99;
  const rel = getRelativeState('mun', 'kerbin', t);
  const gs = getBodyState('mun', t);
  check("getRelativeState(mun, kerbin) equals getBodyState(mun)",
    rel.pos.distanceTo(gs.pos) < 1e-6 && rel.vel.distanceTo(gs.vel) < 1e-9);
}

{
  const rel = getRelativeState('kerbin', 'kerbin', 0);
  check("getRelativeState(kerbin, kerbin) is origin",
    rel.pos.length() < 1e-9 && rel.vel.length() < 1e-9);
}

{
  const kids = childrenOf('kerbin');
  check("childrenOf(kerbin) includes mun and minmus",
    kids.includes('mun') && kids.includes('minmus'), `kids=${kids}`);
  check("childrenOf(kerbin) does not include ike", !kids.includes('ike'));
}

{
  const kids = childrenOf('kerbol');
  check("childrenOf(kerbol) includes kerbin and duna",
    kids.includes('kerbin') && kids.includes('duna'), `kids=${kids}`);
  check("childrenOf(kerbol) does not include jool", !kids.includes('jool'));
}

{
  const mun = getBodyState('mun', 0);
  const offset = new Vector3(BODIES.mun.soi * 0.5, 0, 0);
  const st = {
    t: 0, body: 'kerbin',
    pos: mun.pos.clone().add(offset),
    vel: mun.vel.clone().add(new Vector3(3, 0, 1)),
  };
  const events = [];
  checkSOI(st, events);
  check('checkSOI: near Mun on Kerbin enters mun',
    st.body === 'mun' && events[0]?.type === 'soi' && events[0]?.body === 'mun');
  check('checkSOI: enter mun subtracts mun state',
    st.pos.distanceTo(offset) < 1e-6 && st.vel.distanceTo(new Vector3(3, 0, 1)) < 1e-9,
    `pos=${st.pos.toArray()} vel=${st.vel.toArray()}`);
}

{
  const t = 100;
  const mun = getBodyState('mun', t);
  const r = BODIES.mun.soi * 1.1;
  const st = {
    t, body: 'mun',
    pos: new Vector3(r, 0, 0),
    vel: new Vector3(10, 2, -4),
  };
  const events = [];
  checkSOI(st, events);
  check('checkSOI: r>soi on Mun returns to kerbin',
    st.body === 'kerbin' && events[0]?.type === 'soi' && events[0]?.body === 'kerbin');
  const expPos = new Vector3(r, 0, 0).add(mun.pos);
  const expVel = new Vector3(10, 2, -4).add(mun.vel);
  check('checkSOI: leave mun adds mun parent-relative state',
    st.pos.distanceTo(expPos) < 1e-3 && st.vel.distanceTo(expVel) < 1e-6,
    `pos err=${st.pos.distanceTo(expPos)} vel err=${st.vel.distanceTo(expVel)}`);
}

{
  const s = getBodyState('minmus', 0);
  check('Minmus getBodyState at t=0 has a y component (inclined)',
    Math.abs(s.pos.y) > 1000, `y=${s.pos.y}`);
}

{
  const k = getInertialState('kerbin', 0);
  check('Kerbin inertial radius ≈ 13.599e9',
    Math.abs(k.pos.length() - 13_599_840_256) < 1,
    `r=${k.pos.length()}`);
}

{
  const k = getBodyState('kerbin', 0);
  check('getBodyState(kerbin) is Kerbol-relative, not origin',
    k.pos.length() > 1e9, `r=${k.pos.length()}`);
  const root = getBodyState('kerbol', 0);
  check('getBodyState(kerbol) is origin', root.pos.length() === 0 && root.vel.length() === 0);
}

console.log(failures === 0 ? '\nAll system tests passed.' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
