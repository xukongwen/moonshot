// Onboard nadir still. Gates are shared by the human C key and ksp_sat_photo.
// Pixels come from Flight.takePhoto(); headless pays EC and records metadata only.

import { BODIES } from './constants.js';
import { clampEC } from './power.js';

export const PHOTO_EC = 5;

/** Alive part with def.camera === true. */
export function hasCamera(parts) {
  return (parts ?? []).some((p) => p.alive && p.def?.camera === true);
}

/**
 * Photo is onboard: no comm / canCommand. 通视地面 = current SOI is a real
 * world (not kerbol). Not solar eclipse, not Kerbin-center comms.
 *
 * reasons: no-camera | no-ground | no-ec | dead
 */
export function canPhoto(st) {
  if (st?.dead) return { ok: false, reason: 'dead' };
  if (!hasCamera(st?.parts)) return { ok: false, reason: 'no-camera' };
  const body = st?.body;
  if (!body || body === 'kerbol' || !BODIES[body] || body === 'kerbol') {
    return { ok: false, reason: 'no-ground' };
  }
  if ((Number.isFinite(st.ec) ? st.ec : 0) < PHOTO_EC) {
    return { ok: false, reason: 'no-ec' };
  }
  return { ok: true, reason: 'ok' };
}

/** Subtract PHOTO_EC and clamp. Does not create energy. */
export function payPhoto(st) {
  const have = Number.isFinite(st.ec) ? st.ec : 0;
  st.ec = have - PHOTO_EC;
  clampEC(st);
  return PHOTO_EC;
}

export function ensureAlbum(st) {
  if (!st) return [];
  if (!Array.isArray(st.album)) st.album = [];
  return st.album;
}

export function albumN(st) {
  return Array.isArray(st?.album) ? st.album.length : 0;
}

export function photoStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function photoFilePath(d = new Date()) {
  return `logs/shots/sat-${photoStamp(d)}.png`;
}

export function altOf(st) {
  const R = BODIES[st?.body]?.radius;
  if (!R || !st?.pos) return 0;
  const len = typeof st.pos.length === 'function' ? st.pos.length() : 0;
  return len - R;
}

/** Push { t, body, alt, ecSpent, path? }. path only when a real file/dataURL exists. */
export function pushAlbum(st, extra = {}) {
  const album = ensureAlbum(st);
  const entry = {
    t: st.t ?? 0,
    body: st.body,
    alt: extra.alt != null ? extra.alt : altOf(st),
    ecSpent: extra.ecSpent != null ? extra.ecSpent : PHOTO_EC,
  };
  if (extra.path) entry.path = extra.path;
  album.push(entry);
  return entry;
}

export function cloneAlbum(album) {
  if (!Array.isArray(album)) return [];
  return album.map((e) => {
    const out = {
      t: e.t,
      body: e.body,
      alt: e.alt,
      ecSpent: e.ecSpent,
    };
    if (e.path) out.path = e.path;
    return out;
  });
}
