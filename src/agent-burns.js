// Transfer / capture / land / rise / home muscles. No planner, no LLM.
// Attitude is cheated (quat); physics, fuel, and staging stay real.
// Ejection phase is the hyperbolic asymptote, not geometric midnight.

import { Vector3 } from 'three';
import { BODIES, getBodyState, getRelativeState } from './constants.js';
import { computeSections } from './vessel.js';
import {
  elementsFromState, propagate, timeToPeriapsis, timeToApoapsis,
  findMunEncounter, findEncounter, hohmannTransfer, ejectionDeltaV,
  planetPhaseDeg,
} from './orbits.js';
import { physicsStep, checkSOI } from './physics.js';
import { heightAt } from './terrain.js';
import {
  angleDiff, coastRailsOnState, destForNode, dropToLander, fuelLeft,
  lightTransferOnly, orbitCheck, pointState, readFlightCheck, roleEngines,
  sectionFuel, shouldStageDry, targetEjectionAngleDeg, transferFuelKg,
  vesselMidnightAngle, vInfEst,
} from './agent-muscles.js';

const Y = new Vector3(0, 1, 0);

function physStep(st, dt) {
  const evs = [];
  physicsStep(st, dt, evs);
  st.t += dt;
  if (st.met != null) st.met += dt;
  return evs;
}

function maybeStageTransfer(st, plan, stageIdx, stageFn) {
  const dry = shouldStageDry(st, plan, stageIdx, { allowLander: false });
  if (dry.stage && typeof stageFn === 'function') stageFn();
  return dry;
}

function driveBurn(st, pred, {
  aim = 'prograde', maxS = 400, dt = 0.15, plan = null, stageIdx = 0, stageFn = null,
} = {}) {
  const tEnd = st.t + maxS;
  st.throttle = 1;
  const events = [];
  while (st.t < tEnd && !st.dead) {
    if (aim === 'prograde') pointState(st, st.vel);
    else if (aim === 'retrograde') pointState(st, st.vel.clone().negate());
    else if (aim === 'up') pointState(st, st.pos);
    else if (aim && aim.isVector3) pointState(st, aim);
    const evs = physStep(st, dt);
    events.push(...evs);
    maybeStageTransfer(st, plan, stageIdx, stageFn);
    if (pred(st, evs)) break;
    if (transferFuelKg(st) <= 1 && roleEngines(st).transfer) break;
    if (fuelLeft(st) < 8) break;
  }
  st.throttle = 0;
  return events;
}

function els(st, bodyName = st.body) {
  if (bodyName === st.body) {
    return elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
  }
  const frame = getRelativeState(st.body, bodyName, st.t);
  const pos = st.pos.clone().add(frame.pos);
  const vel = st.vel.clone().add(frame.vel);
  return elementsFromState(pos, vel, BODIES[bodyName].mu, st.t);
}

function applyProgradeBurn(st, dV, { maxS = 180, plan, stageIdx, stageFn } = {}) {
  if (Math.abs(dV) < 0.5) return 0;
  const aim = dV < 0 ? 'retrograde' : 'prograde';
  const target = Math.abs(dV);
  const v0 = st.vel.clone();
  driveBurn(st, () => st.vel.clone().sub(v0).length() >= target, {
    aim, maxS, dt: 0.12, plan, stageIdx, stageFn,
  });
  return st.vel.clone().sub(v0).length();
}

function applyVectorBurn(st, dPro, dRad, { maxS = 200, plan, stageIdx, stageFn } = {}) {
  const vHat = st.vel.clone().normalize();
  const rHat = st.pos.clone().normalize();
  const want = vHat.multiplyScalar(dPro).addScaledVector(rHat, dRad);
  const mag = want.length();
  if (mag < 0.8) return 0;
  const v0 = st.vel.clone();
  driveBurn(st, () => st.vel.clone().sub(v0).length() >= mag, {
    aim: want, maxS, dt: 0.12, plan, stageIdx, stageFn,
  });
  return st.vel.clone().sub(v0).length();
}

function closestApproach(st, childName, horizon, el = null) {
  el = el || elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
  const t0 = st.t;
  let best = { d: Infinity, t: t0 };
  const steps = 1600;
  const dt = horizon / steps;
  for (let i = 0; i <= steps; i++) {
    const tt = t0 + i * dt;
    const { pos } = propagate(el, tt);
    const d = pos.distanceTo(getBodyState(childName, tt).pos);
    if (d < best.d) best = { d, t: tt };
  }
  return best;
}

function searchProgradeCA(st, childName, horizon, { wide = false } = {}) {
  const mu = BODIES[st.body].mu;
  const vHat = st.vel.clone().normalize();
  const rHat = st.pos.clone().normalize();
  const child = BODIES[childName];
  const dVMax = wide ? 420 : 90;
  const dVStep = wide ? 20 : 5;
  const rads = wide
    ? [0, -20, 20, -40, 40, -70, 70, -110, 110]
    : [0, -12, 12, -25, 25, -40, 40];
  let best = { d: Infinity, dV: 0, dRad: 0, enc: null };
  for (let dV = -dVMax; dV <= dVMax; dV += dVStep) {
    for (const dRad of rads) {
      const vel = st.vel.clone().addScaledVector(vHat, dV).addScaledVector(rHat, dRad);
      const el = elementsFromState(st.pos.clone(), vel, mu, st.t);
      const enc = findEncounter(el, st.t, horizon, childName);
      const ca = closestApproach(st, childName, horizon, el);
      const d = enc ? Math.min(ca.d, Math.max(0, enc.periapsis + child.radius)) : ca.d;
      if (d < best.d) best = { d, dV, dRad, enc, ca };
    }
  }
  const refine = wide ? 12 : 5;
  if (Number.isFinite(best.dV)) {
    for (let dv = best.dV - refine; dv <= best.dV + refine; dv += wide ? 2 : 1) {
      for (let dr = best.dRad - 8; dr <= best.dRad + 8; dr += 2) {
        const vel = st.vel.clone().addScaledVector(vHat, dv).addScaledVector(rHat, dr);
        const el = elementsFromState(st.pos.clone(), vel, mu, st.t);
        const enc = findEncounter(el, st.t, horizon, childName);
        const ca = closestApproach(st, childName, horizon, el);
        const d = enc ? Math.min(ca.d, Math.max(0, enc.periapsis + child.radius)) : ca.d;
        if (d < best.d) best = { d, dV: dv, dRad: dr, enc, ca };
      }
    }
  }
  return best;
}

function coastToEjectionAngle(st, planet, vInfTarget, { inward = false } = {}) {
  const body = BODIES[planet];
  const rPark = st.pos.length();
  const alpha = targetEjectionAngleDeg(rPark, vInfTarget, body.mu);
  // Outward (Kerbin→Duna): asymptote along planet prograde. Inward
  // (Duna→Kerbin) must flip 180° or the ship climbs to a higher solar orbit.
  const startAng = inward ? alpha - 13 + 180 : alpha - 13;
  let el;
  try {
    el = elementsFromState(st.pos, st.vel, body.mu, st.t);
  } catch {
    return { ok: false, reason: 'no-elements', alpha, startAng };
  }
  const period = el.period ?? 2200;
  let bestT = st.t;
  let bestErr = 1e9;
  for (let dt = 0; dt <= period; dt += 4) {
    const t = st.t + dt;
    const { pos } = propagate(el, t);
    const ang = vesselMidnightAngle(planet, t, pos);
    const err = Math.abs(angleDiff(ang, startAng));
    if (err < bestErr) { bestErr = err; bestT = t; }
  }
  const coastTo = Math.max(0, bestT - st.t - 2);
  if (coastTo > 2) {
    coastRailsOnState(st, {
      maxS: coastTo,
      pred: () => Math.abs(angleDiff(vesselMidnightAngle(planet, st.t, st.pos), startAng)) < 2.5,
      dt: 4,
    });
  }
  return {
    ok: true,
    alpha,
    startAng,
    nowAng: vesselMidnightAngle(planet, st.t, st.pos),
    errDeg: angleDiff(vesselMidnightAngle(planet, st.t, st.pos), startAng),
  };
}

function hooksOf(ctrl) {
  return {
    plan: ctrl?.plan ?? null,
    stageIdx: ctrl?.stageIdx ?? ctrl?.stageIndex ?? 0,
    stageFn: typeof ctrl?.stage === 'function' ? () => ctrl.stage() : null,
  };
}

export function runEscapeMuscle(st, ctrl = null, opts = {}) {
  if (!st || st.dead) return { ok: false, reason: 'dead', check: readFlightCheck(st) };
  if (st.landed) return { ok: false, reason: 'landed', check: readFlightCheck(st) };
  const dest = opts.dest || destForNode(opts.nodeId, opts.missionId);
  const lit = lightTransferOnly(st);
  if (!lit.ok) {
    return {
      ok: false,
      reason: lit.reason,
      transferFuelKg: lit.transferFuelKg,
      check: readFlightCheck(st),
    };
  }
  const hooks = hooksOf(ctrl);

  if (dest === 'mun') {
    st.throttle = 1;
    let enc = null;
    const tEnd = st.t + 420;
    while (st.t < tEnd && !st.dead) {
      pointState(st, st.vel);
      physStep(st, 0.15);
      maybeStageTransfer(st, hooks.plan, hooks.stageIdx, hooks.stageFn);
      try {
        const e = elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
        if (e.ra > BODIES.mun.orbitRadius - BODIES.mun.soi * 0.6) {
          st.throttle = 0;
          enc = findMunEncounter(e, st.t, e.period ?? 90_000);
          break;
        }
      } catch { /* keep burning */ }
      if (fuelLeft(st) < 8) break;
    }
    st.throttle = 0;
    if (!enc) {
      try {
        enc = findMunEncounter(els(st), st.t, 140_000);
      } catch { enc = null; }
    }
    const check = readFlightCheck(st);
    if (!enc) {
      return { ok: false, reason: 'no-mun-transfer', dest, transferFuelKg: lit.transferFuelKg, check };
    }
    return {
      ok: true,
      dest,
      munPeKm: enc.munPeriapsis / 1000,
      transferFuelKg: transferFuelKg(st),
      check,
    };
  }

  const from = st.body === 'duna' ? 'duna' : 'kerbin';
  const to = from === 'duna' ? 'kerbin' : dest;
  const xfer = hohmannTransfer(from, to);
  const vInfTarget = xfer.vInfDep;
  const align = coastToEjectionAngle(st, from, vInfTarget);
  if (!align.ok) {
    return { ok: false, reason: align.reason, check: readFlightCheck(st) };
  }
  const again = lightTransferOnly(st);
  if (!again.ok) {
    return {
      ok: false,
      reason: again.reason,
      transferFuelKg: again.transferFuelKg,
      check: readFlightCheck(st),
    };
  }
  // Burn transfer to the computed Hohmann v∞. Mid-course reserve is whatever
  // is left after a full-ish TDI — do not cut early to hoard ~50 kg.
  // driveBurn already cuts transfer-dry and never stages the lander.
  driveBurn(st, () => {
    if (st.body !== from) return true;
    try {
      const e = elementsFromState(st.pos, st.vel, BODIES[from].mu, st.t);
      if (!(e.a < 0)) return false;
      const vinf = vInfEst(st);
      if (Math.abs(vinf - vInfTarget) < 60) return true;
      if (vinf > vInfTarget + 60) return true;
      return false;
    } catch { return false; }
  }, { aim: 'prograde', maxS: 480, dt: 0.15, ...hooks });

  const check = readFlightCheck(st);
  const vinfNow = st.body === from ? vInfEst(st) : 0;
  const xferNow = transferFuelKg(st);
  let escaped = st.body !== from;
  if (!escaped) {
    try {
      const e = elementsFromState(st.pos, st.vel, BODIES[from].mu, st.t);
      escaped = e.a < 0;
    } catch { escaped = false; }
  }
  if (!escaped) {
    return {
      ok: false,
      reason: 'not-escape',
      dest,
      vInf: vinfNow,
      vInfTarget,
      alpha: align.alpha,
      transferFuelKg: xferNow,
      check,
    };
  }
  // Transfer dry and still well short of the computed target: fail honestly.
  // Do not dip into the lander. Leftover transfer after a close TDI is the
  // mid-course sip.
  if (st.body === from && vinfNow < vInfTarget - 80 && xferNow <= 1) {
    return {
      ok: false,
      reason: 'vinf-low',
      dest,
      vInf: vinfNow,
      vInfTarget,
      alpha: align.alpha,
      transferFuelKg: xferNow,
      check,
    };
  }
  return {
    ok: true,
    dest,
    vInf: vinfNow,
    vInfTarget,
    alpha: align.alpha,
    nowAng: align.nowAng,
    transferFuelKg: xferNow,
    check,
  };
}

function lightHomeBurner(st, { allowLander = false } = {}) {
  const { transfer, lander } = roleEngines(st);
  const xferKg = transfer ? sectionFuel(st, transfer) : 0;
  if (transfer && xferKg > 1) return lightTransferOnly(st);
  if (allowLander && lander && fuelLeft(st) > 1) {
    lander.ignited = true;
    return { ok: true, transferFuelKg: 0, lander: true };
  }
  return { ok: false, reason: transfer ? 'transfer-dry' : 'dry', transferFuelKg: xferKg };
}

function midCourseIfNeeded(st, childName, horizon, hooks, { allowLander = false } = {}) {
  let el;
  try {
    el = elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
  } catch {
    return { enc: null, dV: 0, ca0: { d: Infinity } };
  }
  const ca0 = closestApproach(st, childName, horizon, el);
  let enc = findEncounter(el, st.t, horizon, childName);
  if (enc && enc.periapsis > 8_000_000) enc = null;
  let hit = null;
  const maxIter = allowLander ? 2 : 6;
  for (let iter = 0; iter < maxIter && !enc; iter++) {
    hit = searchProgradeCA(st, childName, horizon, { wide: allowLander });
    if (!hit || (Math.abs(hit.dV) < 0.4 && Math.abs(hit.dRad || 0) < 0.4)) break;
    // Lander home: only burn if this actually makes an encounter. Do not
    // dump the last tonnes on a ±90 edge that still misses by megameters.
    if (allowLander && !hit.enc) break;
    if (allowLander && fuelLeft(st) < 80) break;
    const lit = lightHomeBurner(st, { allowLander });
    if (!lit.ok) break;
    if (Math.abs(hit.dRad || 0) > 0.5) {
      applyVectorBurn(st, hit.dV, hit.dRad || 0, { maxS: 180, ...hooks });
    } else {
      applyProgradeBurn(st, hit.dV, { maxS: 180, ...hooks });
    }
    try {
      enc = findEncounter(els(st), st.t, horizon, childName);
    } catch { enc = null; }
    if (enc && enc.periapsis > 8_000_000) enc = null;
  }
  const roles = roleEngines(st);
  const dry = roles.transfer
    ? transferFuelKg(st) <= 1
    : (allowLander && fuelLeft(st) <= 1);
  return { enc, dV: hit?.dV ?? 0, dRad: hit?.dRad ?? 0, ca0, hit, reason: enc ? null : (dry ? 'transfer-dry' : 'no-encounter') };
}

export function runTransferCoast(st, opts = {}) {
  if (!st || st.dead) return { ok: false, reason: 'dead', check: readFlightCheck(st) };
  if (st.landed) return { ok: false, reason: 'landed', check: readFlightCheck(st) };
  const dest = opts.dest || destForNode(opts.nodeId, opts.missionId);
  const hooks = hooksOf(opts.ctrl);
  const body0 = st.body;

  if (dest === 'mun') {
    if (st.body !== 'mun') {
      coastRailsOnState(st, { maxS: 90_000, pred: (s) => s.body === 'mun', dt: 5 });
    }
    const check = readFlightCheck(st);
    return {
      ok: st.body === 'mun',
      arrived: st.body === 'mun',
      bodyFrom: body0,
      bodyTo: st.body,
      dest,
      check,
    };
  }

  // Duna (or home-from-Duna): rails through parent SOI, small mid-course if needed.
  const fromPlanet = body0 === 'duna' || (body0 === 'kerbol' && dest === 'kerbin') ? 'duna' : 'kerbin';
  const xfer = hohmannTransfer(fromPlanet, dest === 'kerbin' ? 'kerbin' : 'duna');
  const horizon = xfer.tT * 2.2;

  if (st.body === 'kerbin' || st.body === 'mun' || st.body === 'minmus') {
    if (st.body !== 'kerbin') {
      const trapped = st.body;
      try {
        const e = els(st);
        if (!(e.a < 0)) {
          const { transfer } = roleEngines(st);
          if (transfer && sectionFuel(st, transfer) > 1) lightTransferOnly(st);
          driveBurn(st, () => st.body !== trapped || els(st).a < 0, {
            aim: 'prograde', maxS: 200, ...hooks,
          });
        }
      } catch { /* continue */ }
      coastRailsOnState(st, {
        maxS: 80_000,
        pred: (s) => s.body === 'kerbin' || s.body === 'kerbol',
        dt: 30,
      });
    }
    if (st.body === 'kerbin') {
      try {
        const e = els(st);
        if (!(e.a < 0)) {
          const { transfer } = roleEngines(st);
          if (transfer && sectionFuel(st, transfer) > 1) lightTransferOnly(st);
          driveBurn(st, () => els(st).a < 0 || st.body === 'kerbol', {
            aim: 'prograde', maxS: 180, ...hooks,
          });
        }
      } catch { /* continue */ }
      coastRailsOnState(st, { maxS: 400_000, pred: (s) => s.body === 'kerbol', dt: 30 });
    }
  }

  if (st.body === dest) {
    return {
      ok: true,
      arrived: true,
      bodyFrom: body0,
      bodyTo: st.body,
      dest,
      check: readFlightCheck(st),
    };
  }

  if (st.body !== 'kerbol') {
    return {
      ok: false,
      reason: 'no-heliocentric',
      bodyFrom: body0,
      bodyTo: st.body,
      dest,
      check: readFlightCheck(st),
    };
  }

  const mid = midCourseIfNeeded(st, dest, horizon, hooks);
  const reached = coastRailsOnState(st, {
    maxS: horizon,
    pred: (s) => s.body === dest,
    dt: 120,
  });
  const check = readFlightCheck(st);
  return {
    ok: st.body === dest,
    arrived: st.body === dest,
    bodyFrom: body0,
    bodyTo: st.body,
    dest,
    midCourseDv: mid.dV,
    midCourseRad: mid.dRad ?? 0,
    ca0_m: mid.ca0?.d ?? null,
    enc: !!mid.enc || st.body === dest,
    reason: st.body === dest ? null : (mid.reason || (reached.arrived ? null : 'no-encounter')),
    check,
  };
}

function lightCaptureBurner(st, { allowLander = false } = {}) {
  return lightHomeBurner(st, { allowLander });
}

function escapeMunIfNeeded(st, hooks) {
  if (st.body !== 'mun') return;
  try {
    const e = els(st);
    if (!(e.a < 0)) {
      lightLander(st);
      driveBurn(st, () => st.body !== 'mun' || els(st).a < 0, {
        aim: 'prograde', maxS: 80, dt: 0.12, ...hooks,
      });
    }
  } catch { /* leave Mun on rails */ }
  if (st.body === 'mun') {
    coastRailsOnState(st, { maxS: 40_000, pred: (s) => s.body === 'kerbin', dt: 8 });
  }
}

export function runCaptureMuscle(st, ctrl = null, opts = {}) {
  if (!st || st.dead) return { ok: false, reason: 'dead', check: readFlightCheck(st) };
  if (st.landed) return { ok: false, reason: 'landed', check: readFlightCheck(st) };
  const dest = opts.dest || destForNode(opts.nodeId, opts.missionId);
  if (st.body !== dest) {
    return { ok: false, reason: 'wrong-body', dest, body: st.body, check: readFlightCheck(st) };
  }
  const allowLander = !!opts.allowLander;
  const lit = lightCaptureBurner(st, { allowLander });
  if (!lit.ok) {
    return {
      ok: false,
      reason: lit.reason,
      transferFuelKg: lit.transferFuelKg,
      check: readFlightCheck(st),
    };
  }
  const body = BODIES[dest];
  const peFloor = opts.peFloor ?? 50_000;
  const apAim = opts.apAim ?? null;
  const fuelReserve = opts.fuelReserve ?? 8;
  const hooks = hooksOf(ctrl);
  try {
    const el = elementsFromState(st.pos, st.vel, body.mu, st.t);
    const tPe = timeToPeriapsis(el, st.t);
    const peAlt = el.rp - body.radius;
    if (Number.isFinite(tPe) && tPe > 20) {
      const lead = peAlt < 60_000 ? 90 : 12;
      coastRailsOnState(st, {
        maxS: Math.max(0, tPe - lead),
        pred: (s) => s.body !== dest,
        dt: 15,
      });
    }
  } catch {
    return { ok: false, reason: 'no-elements', check: readFlightCheck(st) };
  }
  if (dest === 'kerbin') escapeMunIfNeeded(st, hooks);
  if (st.body !== dest) {
    return { ok: false, reason: 'left-soi', dest, check: readFlightCheck(st) };
  }
  const again = lightCaptureBurner(st, { allowLander });
  if (!again.ok) {
    return {
      ok: false,
      reason: again.reason,
      transferFuelKg: again.transferFuelKg,
      check: readFlightCheck(st),
    };
  }
  driveBurn(st, () => {
    if (st.body !== dest) return true;
    try {
      const e = elementsFromState(st.pos, st.vel, body.mu, st.t);
      if (!(e.a > 0) || !Number.isFinite(e.ra)) return false;
      if (!(e.ra < body.soi && e.rp > body.radius + peFloor)) return false;
      if (apAim && (e.ra - body.radius) > apAim && fuelLeft(st) > fuelReserve) return false;
      return true;
    } catch { return false; }
  }, { aim: 'retrograde', maxS: 280, dt: 0.12, ...hooks });

  if (st.body === dest) {
    try {
      const e = elementsFromState(st.pos, st.vel, body.mu, st.t);
      if (!(e.a > 0 && Number.isFinite(e.ra) && e.ra < body.soi)) {
        driveBurn(st, () => {
          try {
            const ee = elementsFromState(st.pos, st.vel, body.mu, st.t);
            return ee.a > 0 && Number.isFinite(ee.ra) && ee.ra < body.soi;
          } catch { return false; }
        }, { aim: 'retrograde', maxS: 200, dt: 0.12, ...hooks });
      }
    } catch { /* leave */ }
  }
  const check = readFlightCheck(st);
  let bound = false;
  try {
    const e = elementsFromState(st.pos, st.vel, body.mu, st.t);
    bound = e.a > 0 && Number.isFinite(e.ra) && e.ra < body.soi;
  } catch { bound = false; }
  if (!bound) {
    return {
      ok: false,
      reason: 'not-captured',
      dest,
      transferFuelKg: transferFuelKg(st),
      check,
    };
  }
  return { ok: true, dest, transferFuelKg: transferFuelKg(st), check };
}

function landerOnly(st) {
  const { transfer } = roleEngines(st);
  return !transfer;
}

function lightLander(st) {
  const { lander } = roleEngines(st);
  if (!lander) return false;
  lander.ignited = true;
  return true;
}

function lowerToLandingOrbit(st, bodyName, peAim, hooks) {
  const body = BODIES[bodyName];
  const floor = body.radius + Math.max(body.atmoHeight || 0, 8_000) + 2_000;
  try {
    const tPe = timeToPeriapsis(els(st), st.t);
    if (Number.isFinite(tPe) && tPe > 20) {
      coastRailsOnState(st, { maxS: tPe - 12, dt: 8 });
    }
  } catch { /* burn now */ }
  driveBurn(st, () => {
    try {
      const e = els(st);
      if (e.rp < floor) return true;
      return e.a > 0 && e.rp - body.radius < peAim + 4_000 && e.ra - body.radius < peAim * 2.4;
    } catch { return false; }
  }, { aim: 'retrograde', maxS: 360, dt: 0.12, ...hooks });
}

function deorbitToSurface(st, bodyName, peTarget, hooks) {
  const body = BODIES[bodyName];
  driveBurn(st, () => {
    try {
      const e = els(st);
      const alt = st.pos.length() - body.radius;
      return (e.rp - body.radius) < peTarget || alt < Math.max(body.atmoHeight || 0, 8_000);
    } catch { return false; }
  }, { aim: 'retrograde', maxS: 140, dt: 0.12, ...hooks });
  st.throttle = 0;
  for (let i = 0; i < 20_000; i++) {
    const alt = st.pos.length() - body.radius;
    try {
      const e = els(st);
      const tPe = timeToPeriapsis(e, st.t);
      if (alt < Math.max((body.atmoHeight || 0) * 0.55, 6_000)) break;
      if (!Number.isFinite(tPe) || tPe < 8) break;
    } catch { break; }
    physStep(st, 0.25);
    if (st.body !== bodyName) break;
  }
}

function poweredDescent(st, bodyName, { useChutes = false, brakeFrac = 0.45 } = {}) {
  const body = BODIES[bodyName];
  for (const p of st.parts) {
    if (p.def?.legs) p.legsDown = true;
  }
  if (useChutes) {
    for (const p of st.parts) {
      if (p.def?.chute) p.chuteState = 'armed';
    }
  }
  lightLander(st);
  let landedEv = null;
  for (let i = 0; i < 120_000 && !landedEv; i++) {
    const u = st.pos.clone().normalize();
    const r = st.pos.length();
    const aglNow = r - body.radius - heightAt(bodyName, u) - (st.massProps?.comY ?? 0);
    const vUp = st.vel.dot(u);
    const vH = st.vel.clone().addScaledVector(u, -vUp);
    const speed = st.vel.length();
    const mp = st.massProps;
    const g = body.mu / (r * r);
    const maxThrust = st.parts
      .filter((p) => p.alive && p.ignited && p.def.engine)
      .reduce((s, p) => s + p.def.engine.thrustVac * p.sym, 0) || 24_000;
    const maxAcc = maxThrust / Math.max(1, mp?.m ?? 1);
    const brake = Math.max(0.1, brakeFrac * Math.max(0.2, maxAcc - g));
    const vAllow = Math.sqrt(Math.max(0, 2 * brake * Math.max(0, aglNow - 15))) + 3;
    const chuteOut = st.parts.some((p) => p.alive && p.def.chute && p.chuteState === 'deployed');
    if (useChutes && chuteOut && speed < 10 && aglNow < 400) {
      pointState(st, u);
      st.throttle = 0;
    } else if (vH.length() > 4 && aglNow > 2000) {
      pointState(st, vH.clone().negate().addScaledVector(u, vH.length() * 0.25));
      st.throttle = 1;
    } else if (speed > vAllow || (aglNow < 400 && speed > 8)) {
      pointState(st, st.vel.clone().negate());
      st.throttle = 1;
    } else {
      pointState(st, u);
      st.throttle = aglNow < 80 && speed > 3 ? 0.25 : 0;
    }
    const evs = physStep(st, aglNow < 2000 ? 0.04 : 0.08);
    landedEv = evs.find((ev) => ev.type === 'landed');
    if (st.landed) break;
    if (st.dead) break;
  }
  st.throttle = 0;
  return { landed: !!st.landed && st.body === bodyName && !st.dead };
}

export function runLandMuscle(st, ctrl = null, opts = {}) {
  if (!st || st.dead) return { ok: false, reason: 'dead', check: readFlightCheck(st) };
  if (st.landed && st.body === (opts.dest || destForNode(opts.nodeId, opts.missionId))) {
    return { ok: true, already: true, check: readFlightCheck(st) };
  }
  const dest = opts.dest || destForNode(opts.nodeId, opts.missionId);
  if (st.body !== dest) {
    return { ok: false, reason: 'wrong-body', dest, body: st.body, check: readFlightCheck(st) };
  }
  if (!landerOnly(st)) {
    return { ok: false, reason: 'jettison-first', check: readFlightCheck(st) };
  }
  if (!lightLander(st)) {
    return { ok: false, reason: 'no-lander', check: readFlightCheck(st) };
  }
  const hooks = hooksOf(ctrl);
  const peAim = dest === 'duna' ? 52_000 : 26_000;
  lowerToLandingOrbit(st, dest, peAim, hooks);
  deorbitToSurface(st, dest, dest === 'duna' ? 12_000 : 3_000, hooks);
  const brakeFrac = dest === 'duna' ? 0.70 : 0.45;
  const useChutes = dest === 'duna' || dest === 'kerbin';
  const out = poweredDescent(st, dest, { useChutes, brakeFrac });
  const check = readFlightCheck(st);
  if (!out.landed) {
    return { ok: false, reason: 'not-landed', dest, check };
  }
  return { ok: true, dest, check };
}

function coastToApoapsis(st, bodyName) {
  const body = BODIES[bodyName];
  for (let i = 0; i < 80_000; i++) {
    try {
      const e2 = els(st);
      const tAp = timeToApoapsis(e2, st.t);
      const alt = st.pos.length() - body.radius;
      if (!Number.isFinite(tAp) || tAp < 5) break;
      if (e2.period && tAp > e2.period * 0.48) break;
      if (alt < 7_000 && st.pos.dot(st.vel) < 0) break;
    } catch { break; }
    physStep(st, 0.2);
    if (st.body !== bodyName) break;
  }
}

function circularizeAtAp(st, bodyName, apTarget, peClear, hooks) {
  const body = BODIES[bodyName];
  const atmo = body.atmoHeight || 0;
  st.throttle = 1;
  for (let i = 0; i < 40_000; i++) {
    try {
      const e = els(st);
      const apAlt = (e.a > 0 ? e.ra : 1e12) - body.radius;
      const peAlt = e.rp - body.radius;
      if (e.a > 0 && peAlt > peClear && apAlt < apTarget * 4) { st.throttle = 0; break; }
      if (e.a < 0 || (Number.isFinite(apAlt) && apAlt > apTarget * 10 && peAlt > atmo + 2000)) {
        st.throttle = 0;
        break;
      }
      const tAp = timeToApoapsis(e, st.t);
      if (Number.isFinite(tAp) && tAp > 40 && e.period && tAp < e.period * 0.4 && peAlt < peClear) {
        st.throttle = 0;
        coastToApoapsis(st, bodyName);
        st.throttle = 1;
        continue;
      }
      const u = st.pos.clone().normalize();
      const vUp = st.vel.dot(u);
      const hdir = st.vel.clone().addScaledVector(u, -vUp);
      if (hdir.lengthSq() < 1) {
        const east = new Vector3(0, 1, 0).cross(u);
        if (east.lengthSq() < 1e-12) east.set(0, 0, -1);
        hdir.copy(east);
      }
      hdir.normalize();
      let bias = Math.max(-0.08, Math.min(0.35, (18 - (Number.isFinite(tAp) ? tAp : 0)) / 45));
      if (peAlt < atmo + 4000 && apAlt < apTarget * 1.15) bias = Math.max(bias, 0.22);
      pointState(st, hdir.addScaledVector(u, bias));
    } catch { break; }
    st.throttle = 1;
    physStep(st, 0.05);
    maybeStageTransfer(st, hooks.plan, hooks.stageIdx, hooks.stageFn);
    if (fuelLeft(st) < 20) break;
    if (st.body !== bodyName) break;
  }
  st.throttle = 0;
}

export function runRiseMuscle(st, ctrl = null, opts = {}) {
  if (!st || st.dead) return { ok: false, reason: 'dead', check: readFlightCheck(st) };
  if (!st.landed) {
    const orb = orbitCheck(st);
    if (orb.ok) return { ok: true, already: true, check: readFlightCheck(st) };
    return { ok: false, reason: 'not-landed', check: readFlightCheck(st) };
  }
  const bodyName = st.body;
  const body = BODIES[bodyName];
  // Duna atmo is 50 km. Old 55/48 cut left 48×54 in atmo with ~2900 kg left —
  // the shape was the bug, not the fuel. Loft Ap to 80 km, clear Pe at 58 km,
  // and do not pitch over in the first 18 km or cut Ap at 12 km.
  const apTarget = opts.apTarget ?? (bodyName === 'duna' ? 80_000 : 28_000);
  const peClear = opts.peClear ?? (bodyName === 'duna' ? 58_000 : 22_000);
  const hooks = hooksOf(ctrl);
  for (const p of st.parts) {
    if (p.def?.legs) p.legsDown = false;
    if (p.alive && p.def?.chute && p.chuteState && p.chuteState !== 'stowed') {
      p.chuteState = 'stowed';
    }
  }
  if (!st.parts.some((p) => p.alive && p.ignited && p.def?.engine && !p.def.engine.srb)) {
    if (!lightLander(st) && typeof hooks.stageFn === 'function') hooks.stageFn();
  }
  const atmo = body.atmoHeight || 0;
  const turnV = bodyName === 'mun' ? 20 : 25;
  const turnSpan = bodyName === 'mun' ? 200 : 220;
  st.throttle = 1;
  for (let i = 0; i < 80_000; i++) {
    const u = st.pos.clone().normalize();
    const east = new Vector3(0, 1, 0).cross(u);
    if (east.lengthSq() < 1e-12) east.set(0, 0, -1);
    east.normalize();
    const sp = st.vel.length();
    let e;
    try { e = els(st); } catch { break; }
    const apAlt = (e.a > 0 ? e.ra : 1e12) - body.radius;
    const alt = st.pos.length() - body.radius;
    const minCutAlt = bodyName === 'duna' ? 42_000 : atmo + 1500;
    if (e.a > 0 && apAlt >= apTarget && alt > minCutAlt) { st.throttle = 0; break; }
    if (e.a < 0 && alt > Math.max(atmo + 2000, 8_000)) { st.throttle = 0; break; }
    let k = Math.min(0.92, Math.pow(Math.max(0, (sp - turnV) / turnSpan), 0.85));
    if (bodyName === 'duna') {
      if (alt < 18_000) k = Math.min(k, 0.16);
      else if (alt < 32_000) k = Math.min(k, 0.50);
      else k = Math.min(0.90, Math.pow(Math.max(0, (sp - 80) / 360), 0.75));
      if (e.a > 0 && apAlt > apTarget * 1.3) k = Math.max(k, 0.72);
      if (e.a < 0) k = Math.max(k, 0.85);
    }
    pointState(st, u.clone().multiplyScalar(1 - k).addScaledVector(east, k));
    st.throttle = 1;
    physStep(st, 0.05);
    maybeStageTransfer(st, hooks.plan, hooks.stageIdx, hooks.stageFn);
    if (st.dead) break;
  }
  st.throttle = 0;
  coastToApoapsis(st, bodyName);
  circularizeAtAp(st, bodyName, apTarget, peClear, hooks);
  const first = orbitCheck(st);
  if (!(first.ok && first.peKm != null && first.peKm * 1000 > peClear) && fuelLeft(st) > 40) {
    coastToApoapsis(st, bodyName);
    circularizeAtAp(st, bodyName, apTarget, peClear, hooks);
  }
  const check = readFlightCheck(st);
  const orb = orbitCheck(st);
  const atmoClear = Math.max(peClear * 0.7, atmo + 2000);
  const ok = !!(orb.ok && orb.peKm != null && (orb.peKm * 1000) > atmoClear);
  if (!ok) {
    return {
      ok: false,
      reason: 'not-orbit',
      dest: bodyName,
      peKm: orb.peKm,
      apKm: orb.apKm,
      fuelKg: check.fuelKg,
      check,
    };
  }
  return { ok: true, dest: bodyName, check };
}



function circularizePark(st, bodyName, peAim, apAim, hooks) {
  const body = BODIES[bodyName];
  if (!lightLander(st) && !roleEngines(st).lander) return;
  try {
    const e0 = els(st);
    const apAlt = (e0.a > 0 ? e0.ra : 0) - body.radius;
    const peAlt = e0.rp - body.radius;
    if (!(e0.a > 0) || (peAlt >= peAim - 2000 && apAlt <= apAim + 8000)) return;
    if (peAlt < peAim && apAlt > peAim) {
      const tAp = timeToApoapsis(e0, st.t);
      if (Number.isFinite(tAp) && tAp > 8) coastToApoapsis(st, bodyName);
      driveBurn(st, () => {
        try {
          const e = els(st);
          return e.a > 0 && e.rp - body.radius >= peAim;
        } catch { return false; }
      }, { aim: 'prograde', maxS: 80, dt: 0.1, ...hooks });
    }
    const e1 = els(st);
    const ap1 = (e1.a > 0 ? e1.ra : 0) - body.radius;
    if (e1.a > 0 && ap1 > apAim + 8000) {
      const tPe = timeToPeriapsis(e1, st.t);
      if (Number.isFinite(tPe) && tPe > 8) {
        coastRailsOnState(st, { maxS: Math.max(0, tPe - 6), dt: 4 });
      }
      driveBurn(st, () => {
        try {
          const e = els(st);
          return e.a > 0 && e.ra - body.radius <= apAim;
        } catch { return false; }
      }, { aim: 'retrograde', maxS: 80, dt: 0.1, ...hooks });
    }
  } catch { /* leave the rise orbit */ }
  st.throttle = 0;
}

function waitHomeWindow(st, from, to) {
  const xfer = hohmannTransfer(from, to);
  const fromB = BODIES[from];
  const toB = BODIES[to];
  const nRel = fromB.omega - toB.omega;
  const phaseNow0 = planetPhaseDeg(from, to, st.t);
  let d = ((phaseNow0 - xfer.phaseDeg) % 360 + 360) % 360;
  if (d < 0.05 || d > 359.95) d = 0;
  const waitS = Math.abs(nRel) > 1e-14 ? d * (Math.PI / 180) / nRel : 0;
  const wait = waitS < 0 ? waitS + Math.abs(2 * Math.PI / nRel) : waitS;
  const orb = orbitCheck(st);
  const period = orb.e?.period ?? 2200;
  const jump = Math.max(0, wait - period - 80);
  if (jump > 30) coastRailsOnState(st, { maxS: jump, dt: 200 });
  coastRailsOnState(st, {
    maxS: period + 400,
    pred: () => Math.abs(angleDiff(planetPhaseDeg(from, to, st.t), xfer.phaseDeg)) < 0.15,
    dt: 8,
  });
  return xfer;
}


function dropPeIntoAtmo(st, bodyName, peTarget, hooks, { fuelReserve = 40 } = {}) {
  const body = BODIES[bodyName];
  try {
    const e0 = els(st);
    const peAlt = e0.rp - body.radius;
    if (peAlt <= peTarget + 2_000) return { ok: true, already: true };
    const tAp = timeToApoapsis(e0, st.t);
    if (Number.isFinite(tAp) && tAp > 8) {
      coastRailsOnState(st, {
        maxS: Math.max(0, tAp - 6),
        pred: (s) => s.body !== bodyName,
        dt: 8,
      });
    }
  } catch { /* burn now */ }
  if (st.body !== bodyName) return { ok: false, reason: 'left-soi' };
  if (!lightLander(st) && !roleEngines(st).lander) return { ok: false, reason: 'no-lander' };
  driveBurn(st, () => {
    try {
      const e = els(st);
      return (e.rp - body.radius) <= peTarget || fuelLeft(st) <= fuelReserve;
    } catch { return false; }
  }, { aim: 'retrograde', maxS: 180, dt: 0.12, ...hooks });
  try {
    const e = els(st);
    return { ok: (e.rp - body.radius) <= peTarget + 8_000, peKm: (e.rp - body.radius) / 1000 };
  } catch {
    return { ok: false, reason: 'no-elements' };
  }
}

function kerbinChuteLand(st) {
  const body = BODIES.kerbin;
  for (const p of st.parts) {
    if (p.def?.legs) p.legsDown = true;
  }
  let chutesArmed = false;
  let landedEv = null;
  let lastSpeed = st.vel.length();
  for (let pass = 1; pass <= 14 && !landedEv && !st.dead; pass++) {
    if (st.body !== 'kerbin') break;
    const outbound0 = st.pos.dot(st.vel) > 0;
    const alt0 = st.pos.length() - body.radius;
    if (alt0 > 80_000 || outbound0) {
      try {
        const e = els(st);
        const tPe = timeToPeriapsis(e, st.t);
        const peAlt = e.rp - body.radius;
        if (peAlt > 68_000 && fuelLeft(st) > 40) {
          dropPeIntoAtmo(st, 'kerbin', 52_000, {}, { fuelReserve: 30 });
        }
        if (Number.isFinite(tPe) && tPe > 12 && st.body === 'kerbin') {
          coastRailsOnState(st, {
            maxS: Math.max(0, tPe - 10),
            pred: (s) => s.body !== 'kerbin' || (s.pos.length() - body.radius) < 90_000,
            dt: 8,
          });
        }
      } catch { /* fall into physics */ }
    }
    let dipped = false;
    for (let i = 0; i < 40_000 && !st.dead && st.body === 'kerbin'; i++) {
      const u = st.pos.clone().normalize();
      const alt = st.pos.length() - body.radius;
      const speed = st.vel.length();
      lastSpeed = speed;
      const outbound = st.pos.dot(st.vel) > 0;
      if (alt < body.atmoHeight) dipped = true;
      if (dipped && outbound && alt > body.atmoHeight + 2_000) {
        if (fuelLeft(st) > 40) {
          try {
            const e2 = els(st);
            if (e2.a > 0 && e2.ra - body.radius < 160_000) {
              driveBurn(st, () => {
                try {
                  const ee = els(st);
                  return ee.a > 0 && ee.ra - body.radius < 68_000;
                } catch { return false; }
              }, { aim: 'retrograde', maxS: 50, dt: 0.1 });
            }
          } catch { /* next pass */ }
        }
        break;
      }
      if (!chutesArmed && alt < 12_000 && speed < 260) {
        for (const p of st.parts) {
          if (p.def?.chute) p.chuteState = 'armed';
        }
        chutesArmed = true;
      }
      const chuteOut = st.parts.some((p) => p.alive && p.def.chute && p.chuteState === 'deployed');
      const chuteAlive = st.parts.some((p) => p.alive && p.def.chute);
      if (chuteOut) {
        pointState(st, u);
        st.throttle = 0;
      } else if (!chuteAlive && alt < 15_000 && fuelLeft(st) > 8) {
        lightLander(st);
        const r = st.pos.length();
        const g = body.mu / (r * r);
        const maxThrust = st.parts
          .filter((p) => p.alive && p.ignited && p.def.engine)
          .reduce((sum, p) => sum + p.def.engine.thrustVac * p.sym, 0) || 0;
        const maxAcc = maxThrust / Math.max(1, st.massProps?.m ?? 1);
        const brake = Math.max(0.2, 0.35 * Math.max(0, maxAcc - g));
        const vAllow = Math.sqrt(Math.max(0, 2 * brake * Math.max(0, alt - 12))) + 5;
        if (speed > vAllow) {
          pointState(st, speed > 60 ? st.vel.clone().negate() : u);
          st.throttle = 1;
        } else {
          st.throttle = 0;
          if (alt < 800) pointState(st, u);
        }
      } else {
        pointState(st, st.vel.clone().negate());
        st.throttle = 0;
      }
      const evs = physStep(st, alt < 20_000 ? 0.12 : 0.35);
      landedEv = evs.find((ev) => ev.type === 'landed');
      if (st.landed || landedEv) break;
    }
    st.throttle = 0;
  }
  st.throttle = 0;
  const chute = st.parts.some((p) => p.alive && p.def?.chute && p.chuteState === 'deployed');
  return {
    landed: !!st.landed && st.body === 'kerbin' && !st.dead,
    speed: landedEv?.speed ?? lastSpeed,
    chute,
  };
}

function finishHomeAtKerbin(st, ctrl, opts = {}) {
  const hooks = hooksOf(ctrl);
  if (st.landed && st.body === 'kerbin') {
    return { ok: true, landed: true, dest: 'kerbin', check: readFlightCheck(st) };
  }
  escapeMunIfNeeded(st, hooks);
  if (st.body !== 'kerbin') {
    return { ok: false, reason: 'left-soi', dest: 'kerbin', check: readFlightCheck(st) };
  }
  let captured = false;
  try {
    const e = els(st);
    captured = e.a > 0 && e.e < 1 && Number.isFinite(e.ra) && e.ra < BODIES.kerbin.soi;
  } catch { captured = false; }
  let captureCheck = null;
  if (!captured) {
    const cap = runCaptureMuscle(st, ctrl, {
      dest: 'kerbin',
      allowLander: true,
      peFloor: 45_000,
      apAim: 2_000_000,
      fuelReserve: 160,
      nodeId: 'home',
      missionId: opts.missionId,
    });
    captureCheck = cap.check ?? readFlightCheck(st);
    if (!cap.ok) {
      return {
        ok: false,
        reason: cap.reason || 'not-captured',
        dest: 'kerbin',
        encounter: true,
        captured: false,
        landed: false,
        captureCheck,
        check: captureCheck,
      };
    }
    captured = true;
  } else {
    captureCheck = readFlightCheck(st);
  }

  escapeMunIfNeeded(st, hooks);
  if (st.body === 'kerbin' && !st.landed) {
    try {
      const e = els(st);
      const peAlt = e.rp - BODIES.kerbin.radius;
      if (peAlt > 68_000 && fuelLeft(st) > 40) {
        dropPeIntoAtmo(st, 'kerbin', 52_000, hooks, { fuelReserve: 40 });
      }
    } catch { /* try reentry anyway */ }
  }

  let land = { landed: false, speed: null, chute: false };
  if (st.body === 'kerbin' && !st.landed && !st.dead) {
    land = kerbinChuteLand(st);
  }
  const check = readFlightCheck(st);
  return {
    ok: captured || !!st.landed,
    dest: 'kerbin',
    encounter: true,
    captured,
    landed: !!st.landed && st.body === 'kerbin' && !st.dead,
    captureCheck,
    touchdownSpeed: land.speed,
    chute: land.chute,
    check,
    reason: (captured && !st.landed) ? 'not-landed' : null,
  };
}

export function runHomeMuscle(st, ctrl = null, opts = {}) {
  if (!st || st.dead) return { ok: false, reason: 'dead', check: readFlightCheck(st) };
  const hooks = hooksOf(ctrl);
  if (st.landed && st.body === 'kerbin') {
    return { ok: true, landed: true, dest: 'kerbin', check: readFlightCheck(st) };
  }
  if (st.body === 'kerbin') {
    return finishHomeAtKerbin(st, ctrl, opts);
  }

  if (st.body === 'mun' || st.body === 'duna') {
    const from = st.body;
    const to = 'kerbin';
    const xfer = hohmannTransfer(from, to);
    if (from === 'duna') {
      circularizePark(st, from, 65_000, 90_000, hooks);
      waitHomeWindow(st, from, to);
    }
    const lit = from === 'duna' && roleEngines(st).transfer
      ? lightTransferOnly(st)
      : { ok: lightLander(st) || !!roleEngines(st).lander, transferFuelKg: fuelLeft(st) };
    if (!lit.ok && fuelLeft(st) <= 1) {
      return { ok: false, reason: 'dry', check: readFlightCheck(st) };
    }
    const align = coastToEjectionAngle(st, from, xfer.vInfDep, { inward: from === 'duna' });
    if (align.ok) {
      if (roleEngines(st).transfer) lightTransferOnly(st);
      else lightLander(st);
      driveBurn(st, () => {
        if (st.body !== from) return true;
        try {
          const e = els(st);
          if (!(e.a < 0)) return false;
          const vinf = vInfEst(st);
          if (vinf >= xfer.vInfDep - 25) return true;
          if (vinf > xfer.vInfDep + 40) return true;
          return false;
        } catch { return false; }
      }, { aim: 'prograde', maxS: 320, dt: 0.12, ...hooks });
    }
    if (st.body !== 'kerbol' && st.body !== 'kerbin') {
      coastRailsOnState(st, {
        maxS: 200_000,
        pred: (s) => s.body === 'kerbol' || s.body === 'kerbin',
        dt: 30,
      });
    }
  }

  if (st.body === 'kerbol') {
    const xfer = hohmannTransfer('duna', 'kerbin');
    const horizon = (xfer.tT || 6.5e6) * 2.2;
    midCourseIfNeeded(st, 'kerbin', horizon, hooks, { allowLander: true });
    coastRailsOnState(st, { maxS: horizon, pred: (s) => s.body === 'kerbin', dt: 120 });
  }

  if (st.body === 'mun') {
    coastRailsOnState(st, { maxS: 40_000, pred: (s) => s.body === 'kerbin', dt: 8 });
  }

  if (st.body === 'kerbin') {
    return finishHomeAtKerbin(st, ctrl, opts);
  }
  const check = readFlightCheck(st);
  return {
    ok: false,
    reason: 'no-kerbin',
    body: st.body,
    landed: false,
    check,
  };
}

export { Y };
