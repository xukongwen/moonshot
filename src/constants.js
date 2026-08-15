import { Vector3 } from 'three';

export const G0 = 9.80665;

// KSP-scale patched-conic system. Kerbol is the inertial root.
export const BODIES = {
  kerbol: {
    name: 'Kerbol',
    radius: 261_600_000,
    mu: 1.1723328e18,
    atmoHeight: 0,
    rho0: 0,
    scaleHeight: 1,
    soi: Infinity,
    surfaceGravity: 1.1723328e18 / 261_600_000 ** 2,
    color: 0xffee66,
  },
  kerbin: {
    name: 'Kerbin',
    radius: 600_000,
    mu: 3.5316e12,
    atmoHeight: 70_000,
    rho0: 1.225,
    scaleHeight: 5600,
    soi: 84_159_286,
    surfaceGravity: 3.5316e12 / 600_000 ** 2,
    parent: 'kerbol',
    orbitRadius: 13_599_840_256,
    phase0: Math.PI,
    inc: 0,
    p0: 1,
    color: 0x3d8fd9,
  },
  mun: {
    name: 'the Mun',
    radius: 200_000,
    mu: 6.5138e10,
    atmoHeight: 0,
    rho0: 0,
    scaleHeight: 1,
    soi: 2_429_559,
    orbitRadius: 12_000_000,
    parent: 'kerbin',
    phase0: 1.7,
    inc: 0,
    surfaceGravity: 6.5138e10 / 200_000 ** 2,
    color: 0x9a9aa8,
  },
  minmus: {
    name: 'Minmus',
    radius: 60_000,
    mu: 1.7658e9,
    atmoHeight: 0,
    rho0: 0,
    scaleHeight: 1,
    soi: 2_247_428.4,
    orbitRadius: 47_000_000,
    parent: 'kerbin',
    phase0: 0.94,
    inc: 6 * Math.PI / 180,
    surfaceGravity: 1.7658e9 / 60_000 ** 2,
    color: 0x8ec9b8,
  },
  duna: {
    name: 'Duna',
    aka: '火星',
    radius: 320_000,
    mu: 3.01363e11,
    atmoHeight: 50_000,
    rho0: 0.15,
    scaleHeight: 6000,
    soi: 47_921_949,
    orbitRadius: 20_726_155_264,
    parent: 'kerbol',
    phase0: 0.8,
    inc: 0,
    p0: 0.0666,
    surfaceGravity: 3.01363e11 / 320_000 ** 2,
    color: 0xc45c32,
  },
};

for (const b of Object.values(BODIES)) {
  if (b.parent) b.omega = Math.sqrt(BODIES[b.parent].mu / b.orbitRadius ** 3);
}

export const MUN_OMEGA = BODIES.mun.omega; // must equal sqrt(kerbin.mu / 12e6**3)
export const MUN_PHASE0 = BODIES.mun.phase0; // 1.7

// Launch site: equator, +X direction. East is -Z there.
export const PAD_DIR = new Vector3(1, 0, 0);
export const PAD_ALTITUDE = 50; // terrain is flattened to this height around the pad

function circularRel(b, t) {
  const a = b.orbitRadius, w = b.omega, th = (b.phase0 || 0) + w * t;
  const pos = new Vector3(a * Math.cos(th), 0, -a * Math.sin(th));
  const vel = new Vector3(-a * w * Math.sin(th), 0, -a * w * Math.cos(th));
  if (b.inc) {
    const c = Math.cos(b.inc), s = Math.sin(b.inc);
    const py = pos.y * c - pos.z * s, pz = pos.y * s + pos.z * c;
    pos.y = py; pos.z = pz;
    const vy = vel.y * c - vel.z * s, vz = vel.y * s + vel.z * c;
    vel.y = vy; vel.z = vz;
  }
  return { pos, vel };
}

/** Position/velocity of a body relative to its parent at sim time t. */
export function getBodyState(name, t) {
  const b = BODIES[name];
  if (!b || !b.parent) return { pos: new Vector3(), vel: new Vector3() };
  return circularRel(b, t);
}

export function childrenOf(name) {
  return Object.keys(BODIES).filter((k) => BODIES[k].parent === name);
}

/** Inertial (Kerbol-centred) state: walk parent chain and sum relative states. */
export function getInertialState(name, t) {
  const pos = new Vector3();
  const vel = new Vector3();
  let n = name;
  while (n) {
    const s = getBodyState(n, t);
    pos.add(s.pos);
    vel.add(s.vel);
    n = BODIES[n]?.parent;
  }
  return { pos, vel };
}

/** State of `name` in the inertial frame of `frame`. */
export function getRelativeState(name, frame, t) {
  if (name === frame) return { pos: new Vector3(), vel: new Vector3() };
  const a = getInertialState(name, t);
  const b = getInertialState(frame, t);
  return { pos: a.pos.sub(b.pos), vel: a.vel.sub(b.vel) };
}

export function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

export function fmtDist(m) {
  const neg = m < 0 ? '-' : '';
  m = Math.abs(m);
  if (m >= 1e6) return `${neg}${(m / 1e6).toFixed(2)} Mm`;
  if (m >= 1e4) return `${neg}${(m / 1e3).toFixed(1)} km`;
  if (m >= 1e3) return `${neg}${(m / 1e3).toFixed(2)} km`;
  return `${neg}${m.toFixed(0)} m`;
}
