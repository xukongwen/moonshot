// RF link to Kerbin center. Same geometric occult as solar eclipse
// (body disk covers a far point as seen from the vessel). Kerbin is the
// target — it does not occult the link. Night-side LKO still has LOS.

import { BODIES, getInertialState } from './constants.js';
import { vesselInertialPos } from './power.js';
import { hasBrain } from './vessel.js';

function simT(st, t) {
  if (Number.isFinite(t)) return t;
  if (Number.isFinite(st?.t)) return st.t;
  return 0;
}

/** Alive crewed pod: has pod torque/cap AND is not a probe bus. */
export function hasCrew(parts) {
  return (parts ?? []).some((p) => p.alive && p.def?.pod && p.def?.probe !== true);
}

/** Alive part marked antenna: true. */
export function hasAntenna(parts) {
  return (parts ?? []).some((p) => p.alive && p.def?.antenna === true);
}

/**
 * Same cylinder/disk math as bodyOccultsSun, but the far point is Kerbin's
 * inertial center, not Kerbol. Kerbin never occults itself.
 */
function bodyOccultsKerbin(vesselInertial, bodyName, t) {
  if (bodyName === 'kerbin' || bodyName === 'kerbol') return false;
  const body = BODIES[bodyName];
  if (!body) return false;
  const kerbinPos = getInertialState('kerbin', t).pos;
  const bodyPos = getInertialState(bodyName, t).pos;
  const toKerbin = kerbinPos.sub(vesselInertial);
  const distKerbin = toKerbin.length();
  if (distKerbin < 1e-6) return false;
  const kerbinDir = toKerbin.divideScalar(distKerbin);
  const toBody = bodyPos.sub(vesselInertial);
  const along = toBody.dot(kerbinDir);
  if (along <= 0 || along >= distKerbin) return false;
  const perpSq = toBody.lengthSq() - along * along;
  const R = body.radius;
  return perpSq < R * R;
}

/**
 * Occulting body id, or null. Current SOI if it is not kerbin; always also
 * test Mun when SOI is kerbin or mun.
 */
export function occultingBody(st, t) {
  const tt = simT(st, t);
  const vin = vesselInertialPos(st, tt);
  const soi = st?.body;
  if (soi && soi !== 'kerbin' && bodyOccultsKerbin(vin, soi, tt)) return soi;
  if ((soi === 'kerbin' || soi === 'mun') && bodyOccultsKerbin(vin, 'mun', tt)) return 'mun';
  return null;
}

/**
 * RF state. Crewed ships always talk (no dish required). Probe-only needs
 * an antenna and LOS to Kerbin center.
 *
 * commReason: 'crew' | 'ok' | 'no-antenna' | 'occulted:<body>'
 */
export function commState(st, t) {
  const parts = st?.parts ?? [];
  const crew = hasCrew(parts);
  const antenna = hasAntenna(parts);
  const occulted = occultingBody(st, t);
  const los = !occulted;
  if (crew) {
    return {
      hasCrew: true, hasAntenna: antenna, los, occulted,
      comm: true, commReason: 'crew',
    };
  }
  if (!antenna) {
    return {
      hasCrew: false, hasAntenna: false, los, occulted,
      comm: false, commReason: 'no-antenna',
    };
  }
  if (occulted) {
    return {
      hasCrew: false, hasAntenna: true, los: false, occulted,
      comm: false, commReason: `occulted:${occulted}`,
    };
  }
  return {
    hasCrew: false, hasAntenna: true, los: true, occulted: null,
    comm: true, commReason: 'ok',
  };
}

/**
 * Command mute: brain first, then comm. Same set as S2
 * (throttle / SAS / stage / point / controls / driveBurn / pointState).
 */
export function canCommand(st) {
  if (!hasBrain(st?.parts)) return { ok: false, reason: 'no-brain' };
  const cs = commState(st);
  if (!cs.comm) return { ok: false, reason: 'no-comm' };
  return { ok: true, reason: cs.commReason };
}
