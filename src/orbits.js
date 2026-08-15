// Two-body orbital mechanics: state <-> elements, analytic propagation
// (elliptic + hyperbolic), sampling for map view, and Mun encounter search.
//
// Frame-agnostic: vectors are relative to the focus body. JS numbers are
// 64-bit floats, so THREE.Vector3 doubles as a double-precision vector here.

import { Vector3 } from 'three';
import { BODIES, getBodyState } from './constants.js';

const TWO_PI = Math.PI * 2;

function solveKeplerE(M, e) {
  M = ((M % TWO_PI) + TWO_PI) % TWO_PI;
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 40; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

function solveKeplerH(M, e) {
  let H = Math.asinh(M / e);
  for (let i = 0; i < 60; i++) {
    const d = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
    H -= d;
    if (Math.abs(d) < 1e-13 * Math.max(1, Math.abs(H))) break;
  }
  return H;
}

/**
 * Build orbital elements from a state vector at time t0.
 * Returns { mu, a, e, phat, qhat, what, M0, t0, rp, ra, period|null }.
 * phat points at periapsis, what is the orbit normal, qhat = what x phat.
 */
export function elementsFromState(r, v, mu, t0) {
  const rmag = r.length();
  const vmag = v.length();
  const a = 1 / (2 / rmag - (vmag * vmag) / mu); // negative for hyperbolic

  let h = new Vector3().crossVectors(r, v);
  if (h.lengthSq() < 1e-12 * rmag * rmag * vmag * vmag + 1e-6) {
    // Degenerate radial orbit: pick any perpendicular as the orbit normal.
    const tmp = Math.abs(r.x) < 0.9 * rmag ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    h = new Vector3().crossVectors(r, tmp).normalize().multiplyScalar(1e-3);
  }
  const what = h.clone().normalize();

  const evec = new Vector3()
    .crossVectors(v, h)
    .divideScalar(mu)
    .sub(r.clone().divideScalar(rmag));
  const e = evec.length();

  const phat = e > 1e-9 ? evec.clone().normalize() : r.clone().normalize();
  const qhat = new Vector3().crossVectors(what, phat).normalize();

  const rdotv = r.dot(v);
  let M0;
  // Branch on the sign of a, not on e: near-radial trajectories sit at e≈1.0
  // with numeric noise, but a's sign (bound vs unbound) is robust.
  if (a > 0) {
    const ecosE = 1 - rmag / a;
    const esinE = rdotv / Math.sqrt(mu * a);
    const E = Math.atan2(esinE, ecosE);
    M0 = E - e * Math.sin(E);
  } else {
    const sinhH = rdotv / Math.sqrt(-mu * a) / e;
    const H = Math.asinh(sinhH);
    M0 = e * Math.sinh(H) - H;
  }

  return {
    mu, a, e: a > 0 ? Math.min(e, 0.9999999) : Math.max(e, 1.0000001),
    phat, qhat, what, M0, t0,
    rp: a * (1 - e),
    ra: a > 0 ? a * (1 + e) : Infinity,
    period: a > 0 ? TWO_PI * Math.sqrt(a ** 3 / mu) : null,
  };
}

/** Analytic state at time t. Returns { pos, vel } (THREE.Vector3). */
export function propagate(el, t) {
  const { mu, a, e, phat, qhat } = el;
  const pos = new Vector3();
  const vel = new Vector3();

  if (a > 0) {
    const n = Math.sqrt(mu / (a * a * a));
    const M = el.M0 + n * (t - el.t0);
    const E = solveKeplerE(M, e);
    const cE = Math.cos(E), sE = Math.sin(E);
    const r = a * (1 - e * cE);
    const b = Math.sqrt(1 - e * e);
    pos.copy(phat).multiplyScalar(a * (cE - e))
      .addScaledVector(qhat, a * b * sE);
    const k = Math.sqrt(mu * a) / r;
    vel.copy(phat).multiplyScalar(-k * sE)
      .addScaledVector(qhat, k * b * cE);
  } else {
    const n = Math.sqrt(mu / Math.pow(-a, 3));
    const M = el.M0 + n * (t - el.t0);
    const H = solveKeplerH(M, e);
    const cH = Math.cosh(H), sH = Math.sinh(H);
    const r = a * (1 - e * cH); // positive: a < 0
    const b = Math.sqrt(e * e - 1);
    pos.copy(phat).multiplyScalar(a * (cH - e))
      .addScaledVector(qhat, -a * b * sH);
    const k = Math.sqrt(-mu * a) / r;
    vel.copy(phat).multiplyScalar(-k * sH)
      .addScaledVector(qhat, k * b * cH);
  }
  return { pos, vel };
}

/** Seconds until next periapsis. */
export function timeToPeriapsis(el, t) {
  if (el.a > 0) {
    const n = Math.sqrt(el.mu / el.a ** 3);
    const M = (el.M0 + n * (t - el.t0)) % TWO_PI;
    return ((TWO_PI - ((M + TWO_PI) % TWO_PI)) % TWO_PI) / n;
  }
  const n = Math.sqrt(el.mu / Math.pow(-el.a, 3));
  const M = el.M0 + n * (t - el.t0);
  return M < 0 ? -M / n : Infinity; // past periapsis on a hyperbola: never again
}

/** Seconds until next apoapsis (elliptic only). */
export function timeToApoapsis(el, t) {
  if (el.a <= 0) return Infinity;
  const n = Math.sqrt(el.mu / el.a ** 3);
  const M = ((el.M0 + n * (t - el.t0)) % TWO_PI + TWO_PI) % TWO_PI;
  return ((Math.PI - M + TWO_PI) % TWO_PI) / n;
}

/**
 * Sample orbit positions for drawing. Elliptic: the whole ellipse.
 * Hyperbolic: clamped to +-maxR from the focus.
 */
export function sampleOrbitPoints(el, count = 192, maxR = 1e9) {
  const pts = [];
  const { a, e, phat, qhat } = el;
  if (a > 0) {
    const b = Math.sqrt(1 - e * e);
    for (let i = 0; i <= count; i++) {
      const E = (i / count) * TWO_PI;
      pts.push(new Vector3()
        .copy(phat).multiplyScalar(a * (Math.cos(E) - e))
        .addScaledVector(qhat, a * b * Math.sin(E)));
    }
  } else {
    const b = Math.sqrt(e * e - 1);
    // r = a(1 - e coshH) <= maxR  ->  coshH <= (1 - maxR/a)/e
    const cMax = Math.max(1.0, (1 - maxR / a) / e);
    const Hmax = Math.acosh(cMax);
    for (let i = 0; i <= count; i++) {
      const H = -Hmax + (i / count) * 2 * Hmax;
      pts.push(new Vector3()
        .copy(phat).multiplyScalar(a * (Math.cosh(H) - e))
        .addScaledVector(qhat, -a * b * Math.sinh(H)));
    }
  }
  return pts;
}

/**
 * Search for a child-body SOI encounter on a parent-centred orbit within
 * [t, t+horizon]. Coarse time scan + bisection refine. Returns null or
 * { tEnter, relElements, periapsis, tPe, child }.
 */
export function findEncounter(el, t, horizon, childName) {
  const child = BODIES[childName];
  const soi = child.soi;
  const steps = 600;
  const dt = horizon / steps;

  const distAt = (tt) => {
    const { pos } = propagate(el, tt);
    return pos.distanceTo(getBodyState(childName, tt).pos);
  };

  let tEnter = null;
  let prev = distAt(t);
  for (let i = 1; i <= steps; i++) {
    const tt = t + i * dt;
    const d = distAt(tt);
    if (prev > soi && d <= soi) {
      // bisect the crossing
      let lo = tt - dt, hi = tt;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (distAt(mid) > soi) lo = mid; else hi = mid;
      }
      tEnter = hi;
      break;
    }
    prev = d;
  }
  if (tEnter === null) return null;

  const { pos, vel } = propagate(el, tEnter);
  const bod = getBodyState(childName, tEnter);
  const relPos = pos.clone().sub(bod.pos);
  const relVel = vel.clone().sub(bod.vel);
  const relElements = elementsFromState(relPos, relVel, child.mu, tEnter);
  const periapsis = relElements.rp - child.radius;
  return {
    tEnter,
    relElements,
    periapsis,
    tPe: tEnter + timeToPeriapsis(relElements, tEnter),
    child: childName,
  };
}

/**
 * Search for a Mun SOI encounter on a Kerbin-centred orbit within [t, t+horizon].
 * Thin wrapper around findEncounter. Returns null or
 * { tEnter, relElements, munPeriapsis, tPe, child, periapsis }.
 */
export function findMunEncounter(el, t, horizon) {
  const enc = findEncounter(el, t, horizon, 'mun');
  if (!enc) return null;
  return { ...enc, munPeriapsis: enc.periapsis };
}

/** Hohmann-ish phase angle (deg) for a transfer from circular radius r1 to the Mun. */
export function munTransferPhase(r1) {
  const r2 = BODIES.mun.orbitRadius;
  const aT = (r1 + r2) / 2;
  const tT = Math.PI * Math.sqrt(aT ** 3 / BODIES.kerbin.mu);
  const munMove = Math.sqrt(BODIES.kerbin.mu / r2 ** 3) * tT;
  return 180 - (munMove * 180) / Math.PI;
}

/** Hohmann-ish phase angle (deg) for a transfer from circular radius r1 to any child. */
export function transferPhase(r1, childName, parentMu) {
  const child = BODIES[childName];
  const r2 = child.orbitRadius;
  const mu = parentMu ?? BODIES[child.parent].mu;
  const aT = (r1 + r2) / 2;
  const tT = Math.PI * Math.sqrt(aT ** 3 / mu);
  const move = Math.sqrt(mu / r2 ** 3) * tT;
  return 180 - (move * 180) / Math.PI;
}

/** Signed phase angle (deg, 0..360) of `to` as seen from `from`, both parent-relative. */
export function planetPhaseDeg(fromName, toName, t) {
  const rv = getBodyState(fromName, t).pos.clone().normalize();
  const rm = getBodyState(toName, t).pos.clone().normalize();
  const cross = new Vector3().crossVectors(rv, rm);
  let a = Math.atan2(cross.y, rv.dot(rm)) * 180 / Math.PI;
  if (a < 0) a += 360;
  return a;
}

/**
 * Hohmann between two siblings around the same parent (default: kerbin → duna around kerbol).
 * Returns {
 *   r1, r2, mu, aT, tT,           // metres, seconds
 *   phaseDeg,                     // lead angle of target at departure
 *   v1, v2,                       // circular speeds
 *   vPe, vAp,                     // transfer ellipse speeds
 *   vInfDep, vInfArr,             // hyperbolic excess out / in
 * }
 */
export function hohmannTransfer(fromName = 'kerbin', toName = 'duna') {
  const from = BODIES[fromName];
  const to = BODIES[toName];
  const parentName = from.parent;
  const mu = BODIES[parentName].mu;
  const r1 = from.orbitRadius;
  const r2 = to.orbitRadius;
  const aT = (r1 + r2) / 2;
  const tT = Math.PI * Math.sqrt(aT ** 3 / mu);
  const n2 = Math.sqrt(mu / r2 ** 3);
  const phaseDeg = 180 - (n2 * tT * 180) / Math.PI;
  const v1 = Math.sqrt(mu / r1);
  const v2 = Math.sqrt(mu / r2);
  const vPe = Math.sqrt(mu * (2 / r1 - 1 / aT));
  const vAp = Math.sqrt(mu * (2 / r2 - 1 / aT));
  const vInfDep = Math.abs(vPe - v1);
  const vInfArr = Math.abs(v2 - vAp);
  return { r1, r2, mu, aT, tT, phaseDeg, v1, v2, vPe, vAp, vInfDep, vInfArr };
}

/**
 * Circular parking orbit ejection to a given v∞.
 * Returns { vCirc, vEsc, vEj, dV }
 */
export function ejectionDeltaV(rPark, muPlanet, vInf) {
  const vCirc = Math.sqrt(muPlanet / rPark);
  const vEsc = Math.sqrt(2 * muPlanet / rPark);
  const vEj = Math.sqrt(vEsc * vEsc + vInf * vInf);
  return { vCirc, vEsc, vEj, dV: vEj - vCirc };
}
