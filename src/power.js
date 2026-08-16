// Vessel ElectricCharge pool. One ship, one tank.
// E2: sun flux 1/r², geometric eclipse, static radial panel gen.
// E4: rails / warp / agent coast use the same stepEC, one eval per substep.
// Sun vector is getInertialState → Kerbol, never flight.js SUNDIR.

import { Vector3, Quaternion } from 'three';
import { BODIES, getInertialState } from './constants.js';

export const SAS_EC_PER_S = 0.5;
export const SAS_EC_DEADBAND_DEG = 0.5;

const _n = new Vector3();
const _identity = new Quaternion();

function partECCap(p) {
  if (!p || p.alive === false) return 0;
  const def = p.def ?? {};
  const one = def.pod?.ecCap ?? def.ecCap ?? 0;
  return one * (p.sym || 1);
}

export function ecCap(st) {
  let cap = 0;
  for (const p of st?.parts ?? []) cap += partECCap(p);
  return cap;
}

export function clampEC(st) {
  const cap = ecCap(st);
  if (!Number.isFinite(st.ec)) st.ec = cap;
  else st.ec = Math.min(cap, Math.max(0, st.ec));
  return st.ec;
}

export function fillEC(st) {
  if (st.ec == null || Number.isNaN(st.ec)) st.ec = ecCap(st);
  else clampEC(st);
  return st.ec;
}

export function wheelsLive(st) {
  return (st.ec ?? 0) > 1e-9;
}

export function paySAS(st, dt) {
  const want = SAS_EC_PER_S * Math.max(0, Number(dt) || 0);
  const have = Math.max(0, Number.isFinite(st.ec) ? st.ec : 0);
  const paid = Math.min(want, have);
  st.ec = have - paid;
  if (st.ec < 0) st.ec = 0;
  return paid;
}

/** Split parentSt.ec by live-cap ratio. Call after both have their parts. Does not create energy. */
export function splitEC(parentSt, childSt) {
  const pCap = ecCap(parentSt);
  const cCap = ecCap(childSt);
  const total = pCap + cCap;
  const pool = Number.isFinite(parentSt.ec) ? Math.max(0, parentSt.ec) : 0;
  if (total <= 0) {
    parentSt.ec = 0;
    childSt.ec = 0;
    return;
  }
  parentSt.ec = pool * (pCap / total);
  childSt.ec = pool * (cCap / total);
  clampEC(parentSt);
  clampEC(childSt);
}

function simT(st, t) {
  if (Number.isFinite(t)) return t;
  if (Number.isFinite(st?.t)) return st.t;
  return 0;
}

/** Kerbol-centred vessel position: SOI body inertial + st.pos. */
export function vesselInertialPos(st, t) {
  const tt = simT(st, t);
  const body = st?.body || 'kerbin';
  const bodyPos = getInertialState(body, tt).pos;
  if (st?.pos) bodyPos.add(st.pos);
  return bodyPos;
}

/** Unit vector from vessel toward Kerbol in the inertial frame. */
export function sunVectorInertial(st, t) {
  const vin = vesselInertialPos(st, t);
  const r = vin.length();
  if (r < 1e-6) return new Vector3(1, 0, 0);
  return vin.multiplyScalar(-1 / r);
}

/** Flux = 1 at BODIES.kerbin.orbitRadius. flux = (rKerbin / rToKerbol)². */
export function solarFlux(st, t) {
  const rKerbin = BODIES.kerbin.orbitRadius;
  const rToKerbol = vesselInertialPos(st, t).length();
  if (!(rToKerbol > 1e-6)) return 0;
  const ratio = rKerbin / rToKerbol;
  return ratio * ratio;
}

/**
 * Point-sun geometric occult: the body's disk covers Kerbol's *center* as
 * seen from the vessel (cylindrical umbra). No penumbra, no self-shadow.
 * Kerbol never occults itself.
 */
function bodyOccultsSun(vesselInertial, bodyName, t) {
  const body = BODIES[bodyName];
  if (!body || bodyName === 'kerbol') return false;
  const bodyPos = getInertialState(bodyName, t).pos;
  const toSun = vesselInertial.clone().negate();
  const distSun = toSun.length();
  if (distSun < 1e-6) return false;
  const sunDir = toSun.divideScalar(distSun);
  const toBody = bodyPos.sub(vesselInertial);
  const along = toBody.dot(sunDir);
  if (along <= 0 || along >= distSun) return false;
  const perpSq = toBody.lengthSq() - along * along;
  const R = body.radius;
  return perpSq < R * R;
}

/**
 * True occulting body id, or null. Current SOI body first; in Kerbin SOI
 * also test Mun.
 */
export function eclipsed(st, t) {
  const tt = simT(st, t);
  const vin = vesselInertialPos(st, tt);
  const soi = st?.body;
  if (soi && bodyOccultsSun(vin, soi, tt)) return soi;
  if (soi === 'kerbin' && bodyOccultsSun(vin, 'mun', tt)) return 'mun';
  return null;
}

/**
 * Shared wing face normal in the inertial/SOI frame.
 * A sym pair is one plane [wing][bus][wing]: every instance uses the
 * tangent of instance 0, vessel (-sin a0, 0, cos a0), then st.quat.
 * Do not add 2π i / sym into the face — that leftover made opposite
 * wings cancel (one lit, one zero). Span/placement is still per-instance
 * radial (cos a, 0, sin a) in vesselviz; only the face is shared.
 * Single-sided cells: panelGen uses max(0, n·sun). Sun on the shared
 * face lights every wing; sun on the back lights none.
 */
export function panelNormal(st, part, inst = 0) {
  void inst; // face is shared; inst is placement-only
  const a0 = Number.isFinite(part?.attachAngle) ? part.attachAngle : 0;
  _n.set(-Math.sin(a0), 0, Math.cos(a0));
  const q = st?.quat || _identity;
  return _n.clone().applyQuaternion(q).normalize();
}

function panelStats(st, t) {
  const tt = simT(st, t);
  if (eclipsed(st, tt)) return { gen: 0, illum: 0 };
  const flux = solarFlux(st, tt);
  const sun = sunVectorInertial(st, tt);
  let gen = 0, illum = 0;
  for (const p of st?.parts ?? []) {
    if (!p || p.alive === false) continue;
    const rate = p.def?.panel?.ecPerS;
    if (!(rate > 0)) continue;
    const sym = Math.max(1, p.sym || 1);
    for (let i = 0; i < sym; i++) {
      const n = panelNormal(st, p, i);
      const face = Math.max(0, n.dot(sun));
      const w = face * flux;
      illum += w;
      gen += w * rate;
    }
  }
  return { gen, illum };
}

/** Sum over live panels: max(0, n·sun) * flux * ecPerS. 0 if eclipsed. */
export function panelGen(st, t) {
  return panelStats(st, t).gen;
}

/** Add generation for dt and clamp to cap. Does not pay SAS. */
export function stepEC(st, dt, t) {
  const gen = panelGen(st, t);
  const have = Number.isFinite(st.ec) ? st.ec : 0;
  st.ec = have + gen * Math.max(0, Number(dt) || 0);
  clampEC(st);
  return gen;
}

/** SAS error (rad) matching physics.js sasErrorAngle. Hold uses sasTarget. */
function sasErrorRad(st) {
  const q = st?.quat;
  if (!q) return 0;
  let targetQ = st.sasTarget;
  if (st.sasMode === 'prograde' || st.sasMode === 'retrograde') {
    if (!st.vel) return 0;
    const dir = st.vel.clone();
    if (dir.lengthSq() < 4) return 0;
    dir.normalize();
    if (st.sasMode === 'retrograde') dir.negate();
    const nose = new Vector3(0, 1, 0).applyQuaternion(q);
    const dq = new Quaternion().setFromUnitVectors(nose, dir);
    targetQ = dq.multiply(q.clone());
  }
  if (!targetQ) return 0;
  const err = targetQ.clone().multiply(q.clone().invert());
  const w = Math.min(1, Math.abs(err.w));
  return 2 * Math.acos(w);
}

/**
 * True when armed SAS would pay in realtime: beyond the 0.5° deadband.
 * Frozen hold that is already on-target is holding (free). Off = never.
 */
export function sasWouldPay(st) {
  if (!st?.sas) return false;
  return sasErrorRad(st) > SAS_EC_DEADBAND_DEG * Math.PI / 180;
}

/**
 * Rails / warp / agent-coast EC tick. Same stepEC as physicsStep, plus SAS
 * pay if it would pay in realtime. Does not move pos/vel.
 *
 * One evaluation per caller substep at the current st.pos / st.t (after
 * propagate). Long night/day crossings use the end-of-chunk eclipse/flux;
 * the existing rails/coast loop is the resolution — no extra integrator.
 * Landed: generate only (realtime also skips stepAttitude on the pad).
 */
export function stepECOnRails(st, simDt) {
  const dt = Math.max(0, Number(simDt) || 0);
  const gen = stepEC(st, dt, st.t);
  if (!st.landed && sasWouldPay(st)) paySAS(st, dt);
  return gen;
}

export function ecTelemetry(st, t) {
  const tt = simT(st, t);
  const stats = panelStats(st, tt);
  return {
    ec: st.ec ?? 0,
    ecCap: ecCap(st),
    ecGen: stats.gen,
    eclipsed: eclipsed(st, tt),
    panelW: stats.illum,
    wheelsLive: wheelsLive(st),
  };
}
