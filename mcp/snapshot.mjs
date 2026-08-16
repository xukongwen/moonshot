// Serialize / deserialize a SimSession (or raw st) for in-game screenshot replay.
// Format matches FlightLog.snapshot() / logs/snapshots/*.json.

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Vector3, Quaternion } from 'three';
import { fillEC } from '../src/power.js';

export const SNAP_DIR = '/workspace/moonshot/logs/snapshots';

function vecToArr(v) {
  if (!v) return [0, 0, 0];
  if (Array.isArray(v)) return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
  return [v.x ?? 0, v.y ?? 0, v.z ?? 0];
}

function quatToArr(q) {
  if (!q) return [0, 0, 0, 1];
  if (Array.isArray(q)) return [Number(q[0]) || 0, Number(q[1]) || 0, Number(q[2]) || 0, Number(q[3]) ?? 1];
  return [q.x ?? 0, q.y ?? 0, q.z ?? 0, q.w ?? 1];
}

function safeTag(tag) {
  return String(tag ?? 'snap').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_|_$/g, '') || 'snap';
}

/** Build the on-disk snapshot object from a live st (SimSession.st or Flight.st). */
export function serializeSnapshot(st, { tag = 'snap', craft = null } = {}) {
  if (!st) throw new Error('serializeSnapshot: missing state');
  return {
    tag,
    t: st.t,
    body: st.body,
    pos: vecToArr(st.pos),
    vel: vecToArr(st.vel),
    quat: quatToArr(st.quat),
    throttle: st.throttle ?? 0,
    landed: !!st.landed,
    dead: !!st.dead,
    ec: st.ec ?? null,
    craft: craft ?? null,
    parts: (st.parts ?? []).map((p) => ({
      key: p.key,
      fuel: p.fuel,
      ignited: !!p.ignited,
      chuteState: p.chuteState ?? null,
      legsDown: p.legsDown ?? null,
      alive: p.alive !== false,
      stackIndex: p.stackIndex,
    })),
  };
}

export function serializeSession(session, tag = 'snap') {
  return serializeSnapshot(session.st, { tag, craft: session.craftName });
}

/** Match a snapshot part onto a live parts list (keys differ after VAB rebuilds). */
export function matchSnapPart(parts, snapPart, used) {
  const radial = String(snapPart.key || '').startsWith('r');
  const cands = parts.filter((p) =>
    !used.has(p) &&
    p.stackIndex === snapPart.stackIndex &&
    (radial ? p.kind === 'radial' : p.kind !== 'radial'));
  return cands.find((p) => p.key === snapPart.key) || cands[0] || null;
}

/** Apply snapshot part fuel/ignition/chutes onto st.parts; drop jettisoned pieces. */
export function applyParts(st, snapParts) {
  const used = new Set();
  const keep = [];
  for (const sp of snapParts ?? []) {
    const p = matchSnapPart(st.parts, sp, used);
    if (!p) continue;
    used.add(p);
    if (sp.fuel != null) p.fuel = sp.fuel;
    p.ignited = !!sp.ignited;
    if (sp.chuteState != null) p.chuteState = sp.chuteState;
    if (sp.legsDown != null) p.legsDown = sp.legsDown;
    p.alive = sp.alive !== false;
    keep.push(p);
  }
  st.parts = keep;
  return keep;
}

/** Mutate a live st (SimSession or Flight) from a snapshot JSON object. */
export function applySnapshotToState(st, snap) {
  if (!st || !snap) throw new Error('applySnapshotToState: missing st or snap');
  st.t = Number(snap.t) || 0;
  if (st.met != null) st.met = st.t;
  st.body = snap.body || st.body || 'kerbin';
  const pos = vecToArr(snap.pos);
  const vel = vecToArr(snap.vel);
  const quat = quatToArr(snap.quat);
  if (st.pos?.set) st.pos.set(pos[0], pos[1], pos[2]);
  else st.pos = new Vector3(pos[0], pos[1], pos[2]);
  if (st.vel?.set) st.vel.set(vel[0], vel[1], vel[2]);
  else st.vel = new Vector3(vel[0], vel[1], vel[2]);
  if (st.quat?.set) st.quat.set(quat[0], quat[1], quat[2], quat[3]);
  else st.quat = new Quaternion(quat[0], quat[1], quat[2], quat[3]);
  if (st.angVel?.set) st.angVel.set(0, 0, 0);
  st.throttle = snap.throttle ?? 0;
  st.landed = !!snap.landed;
  st.dead = !!snap.dead;
  applyParts(st, snap.parts);
  st.ec = snap.ec != null ? Number(snap.ec) : undefined;
  fillEC(st);
  return st;
}

/** Apply onto a SimSession, creating a stock flight if needed. */
export function applySnapshotToSession(session, snap) {
  if (!session.st) session.newFlight(snap.craft || 'Mun Express');
  applySnapshotToState(session.st, snap);
  if (snap.craft) session.craftName = snap.craft;
  session.liftedOff = !snap.landed || snap.t > 0;
  if (typeof session.refreshMass === 'function') session.refreshMass();
  return session.telemetry?.() ?? null;
}

export function writeSnapshot(snap, dir = SNAP_DIR) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${safeTag(snap.tag)}.json`);
  writeFileSync(path, JSON.stringify(snap, null, 2));
  return path;
}

export function dumpSession(session, tag, dir = SNAP_DIR) {
  const snap = serializeSession(session, tag);
  return writeSnapshot(snap, dir);
}

export function readSnapshot(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function listSnapshots(dir = SNAP_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const path = join(dir, f);
      const snap = readSnapshot(path);
      return { path, file: f, tag: snap.tag ?? f.replace(/\.json$/, ''), snap };
    });
}

export function ensureDir(dir = SNAP_DIR) {
  mkdirSync(dir, { recursive: true });
  mkdirSync(dirname(dir) + '/shots', { recursive: true });
}
