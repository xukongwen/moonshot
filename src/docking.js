// Docking ports, capture thresholds, and weld lock.
// Port sits at the top of the first alive dock-port along +Y (stack nose).

import { Vector3, Quaternion } from 'three';
import { stackGeometry, massProps, partY } from './vessel.js';

export const DOCK_DIST_M = 1.5;
export const DOCK_AXIS_DEG = 15;
export const DOCK_CLOSING_MS = 1.0;

export function findDockPort(st) {
  return (st.parts ?? []).find((p) => p.alive && p.def?.dock) ?? null;
}

/** World-space port position + outward axis (+Y of the vessel). */
export function portWorld(st) {
  const port = findDockPort(st);
  if (!port || !st.pos || !st.quat) return null;
  const geom = st.geom ?? stackGeometry(st.parts);
  const mp = st.massProps ?? massProps(st.parts, geom);
  const yTop = partY(geom, port) + port.def.length / 2;
  const local = new Vector3(0, yTop - (mp.comY ?? 0), 0);
  const pos = local.applyQuaternion(st.quat).add(st.pos);
  const axis = new Vector3(0, 1, 0).applyQuaternion(st.quat);
  return { pos, axis, size: port.def.dock.size, part: port };
}

/**
 * Capture test. closing < 0 means approaching (range decreasing).
 * Approach speed must be under 1 m/s; ports face each other (anti-parallel).
 */
export function evaluateCapture(stA, stB) {
  const pa = portWorld(stA);
  const pb = portWorld(stB);
  if (!pa || !pb) {
    return { ok: false, reason: 'no-port', dist: Infinity, axisAng: 180, closing: 0 };
  }
  const dist = pa.pos.distanceTo(pb.pos);
  if (pa.size !== pb.size) {
    return { ok: false, reason: 'size', dist, axisAng: 180, closing: 0, pa, pb };
  }
  const anti = Math.acos(Math.min(1, Math.max(-1, pa.axis.dot(pb.axis.clone().negate()))));
  const axisAng = anti * 180 / Math.PI;
  const relVel = stB.vel.clone().sub(stA.vel);
  const sep = pb.pos.clone().sub(pa.pos);
  const closing = sep.lengthSq() > 1e-12 ? relVel.dot(sep.normalize()) : relVel.length();
  const approaching = closing <= 0.25;
  const slow = Math.abs(closing) < DOCK_CLOSING_MS;
  const ok = dist < DOCK_DIST_M && axisAng < DOCK_AXIS_DEG && slow && approaching;
  return {
    ok,
    reason: ok ? 'ok' : 'threshold',
    dist,
    axisAng,
    closing,
    pa,
    pb,
  };
}

export function weldFromStates(idA, stA, idB, stB) {
  const inv = stA.quat.clone().invert();
  const relPos = stB.pos.clone().sub(stA.pos).applyQuaternion(inv);
  const relQuat = inv.clone().multiply(stB.quat);
  return { a: idA, b: idB, relPos, relQuat };
}

function asVec3(v) {
  if (!v) return new Vector3();
  if (v.isVector3) return v.clone();
  if (Array.isArray(v)) return new Vector3(v[0] || 0, v[1] || 0, v[2] || 0);
  return new Vector3(v.x ?? 0, v.y ?? 0, v.z ?? 0);
}

function asQuat(q) {
  if (!q) return new Quaternion();
  if (q.isQuaternion) return q.clone();
  if (Array.isArray(q)) return new Quaternion(q[0] || 0, q[1] || 0, q[2] || 0, q[3] ?? 1);
  return new Quaternion(q.x ?? 0, q.y ?? 0, q.z ?? 0, q.w ?? 1);
}

export function applyWeld(stA, stB, weld) {
  if (!stA || !stB || !weld) return;
  const relPos = asVec3(weld.relPos);
  const relQuat = asQuat(weld.relQuat);
  stB.pos.copy(relPos).applyQuaternion(stA.quat).add(stA.pos);
  stB.quat.copy(stA.quat).multiply(relQuat);
  stB.vel.copy(stA.vel);
  if (stB.angVel && stA.angVel) stB.angVel.copy(stA.angVel);
  stB.body = stA.body;
  stB.t = stA.t;
  stB.landed = stA.landed;
}

/** Place B so its port faces A's port with a small gap along A's +Y. */
export function placeFacingPorts(stA, stB, gap = 0.8) {
  const pa = portWorld(stA);
  if (!pa) throw new Error('placeFacingPorts: A has no dock port');
  stA.landed = false;
  stB.landed = false;
  stB.body = stA.body;
  stB.t = stA.t;
  stB.quat.setFromUnitVectors(new Vector3(0, 1, 0), pa.axis.clone().negate());
  const pb = portWorld(stB);
  const want = pa.pos.clone().addScaledVector(pa.axis, gap);
  stB.pos.add(want.sub(pb.pos));
  stB.vel.copy(stA.vel);
  if (stB.angVel) stB.angVel.set(0, 0, 0);
  return evaluateCapture(stA, stB);
}

export function serializeWeld(weld) {
  if (!weld) return null;
  const rp = asVec3(weld.relPos);
  const rq = asQuat(weld.relQuat);
  return {
    a: weld.a,
    b: weld.b,
    relPos: [rp.x, rp.y, rp.z],
    relQuat: [rq.x, rq.y, rq.z, rq.w],
  };
}

export function hydrateWeld(raw) {
  if (!raw || !raw.a || !raw.b) return null;
  return {
    a: raw.a,
    b: raw.b,
    relPos: asVec3(raw.relPos),
    relQuat: asQuat(raw.relQuat),
  };
}
