// Short no-judgment muscles shared by the in-game step runner and tests.
// No planner, no LLM. Attitude is cheated (quat); physics/fuel/staging stay real.

import { Vector3 } from 'three';
import { BODIES, getBodyState } from './constants.js';
import { computeSections, stackGeometry, massProps } from './vessel.js';
import {
  elementsFromState, propagate, timeToApoapsis,
  munTransferPhase, planetPhaseDeg, hohmannTransfer,
} from './orbits.js';
import { checkSOI } from './physics.js';
import { snapshotFromState } from './save.js';
import { paySAS, stepECOnRails, ecTelemetry } from './power.js';
import { canCommand } from './comms.js';

const Y = new Vector3(0, 1, 0);

export function angleDiff(a, b) {
  return ((a - b + 180) % 360 + 360) % 360 - 180;
}

export function fuelLeft(st) {
  return (st?.parts ?? [])
    .filter((p) => p.fuel > 0 && !p.def?.engine?.srb)
    .reduce((s, p) => s + p.fuel, 0);
}

export function orbitCheck(st) {
  const body = BODIES[st?.body];
  if (!body || !st?.pos || st.landed) {
    return { ok: false, peKm: null, apKm: null, text: '—', e: null };
  }
  try {
    const e = elementsFromState(st.pos, st.vel, body.mu, st.t);
    const peKm = (e.rp - body.radius) / 1000;
    const apKm = Number.isFinite(e.ra) ? (e.ra - body.radius) / 1000 : Infinity;
    const atmoKm = (body.atmoHeight || 0) / 1000;
    const ok = e.a > 0 && peKm > atmoKm;
    const apTxt = Number.isFinite(apKm) ? apKm.toFixed(0) : '∞';
    return { ok, peKm, apKm, e, text: `${peKm.toFixed(0)} × ${apTxt} km` };
  } catch {
    return { ok: false, peKm: null, apKm: null, text: '—', e: null };
  }
}

export function readFlightCheck(st, { stageIdx = 0 } = {}) {
  const orb = orbitCheck(st);
  const body = BODIES[st?.body];
  const altKm = (st?.pos && body)
    ? (st.pos.length() - body.radius) / 1000
    : null;
  const names = (st?.parts ?? []).filter((p) => p.alive !== false).map((p) => p.def?.name).filter(Boolean);
  return {
    fuelKg: fuelLeft(st),
    body: st?.body ?? null,
    altKm,
    peKm: orb.peKm,
    apKm: orb.apKm,
    bound: orb.ok,
    stageIdx,
    landed: !!st?.landed,
    dead: !!st?.dead,
    parts: names,
    orbitText: orb.text,
    ...ecTelemetry(st),
  };
}

export function captureFlightSnapshot(st, { tag = 'agent', craft = null } = {}) {
  return snapshotFromState(st, { tag, craft });
}

export function pointState(st, dir, dt = 0) {
  if (!canCommand(st).ok) return;
  const v = dir.clone();
  if (v.lengthSq() < 1e-12) v.copy(st.pos).normalize();
  st.quat.setFromUnitVectors(Y, v.normalize());
  if (st.angVel?.set) st.angVel.set(0, 0, 0);
  if (st.sasTarget?.copy) st.sasTarget.copy(st.quat);
  if (dt > 0) paySAS(st, dt);
}

/**
 * Titan leftover when we drop the lifter. Not a full extra XL (16000 kg).
 * Measured 2026-08-16: 3-XL Mun Express can spare 8.5 t and still circularize
 * (72×138); 8 t left the booster 30 km short of a survivable pad-aim.
 * 8-XL Duna Hauler misses LKO at 8 t (−293×21) and can only spare 5 t.
 */
export const LIFTER_RESERVE_KG = 8500;
export const LIFTER_RESERVE_HEAVY_KG = 5000;

export function sectionLiquidFuel(st, stackIndex) {
  const secs = computeSections(st.parts);
  const sec = secs.get(stackIndex);
  return (st.parts ?? [])
    .filter((p) => p.alive !== false && p.def?.fuel && !p.def.engine
      && secs.get(p.stackIndex) === sec)
    .reduce((s, p) => s + (p.fuel || 0), 0);
}

export function lifterFuelKg(st) {
  const titan = (st.parts ?? []).find((p) => p.alive !== false && /Titan/.test(p.def?.name || ''));
  if (!titan) return 0;
  return sectionLiquidFuel(st, titan.stackIndex);
}

export function lifterReserveKg(st) {
  const titan = (st.parts ?? []).find((p) => p.alive !== false && /Titan/.test(p.def?.name || ''));
  if (!titan) return LIFTER_RESERVE_KG;
  const secs = computeSections(st.parts);
  const sec = secs.get(titan.stackIndex);
  const nXl = (st.parts ?? []).filter((p) => p.alive !== false && p.def?.name === 'FT-3200 Tank'
    && secs.get(p.stackIndex) === sec).length;
  return nXl >= 6 ? LIFTER_RESERVE_HEAVY_KG : LIFTER_RESERVE_KG;
}

export function shouldStageDry(st, plan, stageIdx, { allowLander = true } = {}) {
  const srb = (st.parts ?? []).find((p) => p.def?.engine?.srb);
  if (srb && srb.fuel <= 1) return { stage: true, reason: 'SRBs dry' };
  const lit = (st.parts ?? []).find((p) => p.ignited && p.alive && p.def?.engine && !p.def.engine.srb);
  if (!lit) return { stage: false };
  const feedKg = sectionLiquidFuel(st, lit.stackIndex);
  const titanLit = /Titan/.test(lit.def?.name || '');
  const keep = titanLit ? lifterReserveKg(st) : 0.5;
  if (feedKg > keep) return { stage: false };
  const nxt = plan?.[stageIdx];
  if (!nxt?.ignite?.length) return { stage: false };
  if (!allowLander) {
    const engines = st.parts
      .filter((p) => p.alive && p.kind === 'stack' && p.def.engine)
      .sort((a, b) => a.stackIndex - b.stackIndex);
    const landerEng = engines[0];
    if (landerEng && nxt.ignite.includes(landerEng.key)) return { stage: false };
    // 4-stage: Kestrel + Sparrow/Raven + Falcon. Circularize on Falcon;
    // do not steal the vacuum TLI/escape stage if Falcon goes dry first.
    // 3-stage Express (Kestrel + Sparrow) still lights Sparrow after Titan.
    if (engines.length >= 4) {
      const nextPart = st.parts.find((p) => p.alive && nxt.ignite.includes(p.key));
      if (/Sparrow|Raven/.test(nextPart?.def?.name || '')) {
        return { stage: false, reason: 'keep vacuum stage' };
      }
    }
  }
  return { stage: true, reason: titanLit ? 'lifter reserve' : 'stage dry' };
}

/**
 * Apollo-style: keep only the uppermost engine section (the lander).
 * Mutates st.parts. Does not touch the VAB design.
 */
export function dropToLander(st, { refreshMass, resyncPlan } = {}) {
  const engines = (st.parts ?? [])
    .filter((p) => p.alive && p.kind === 'stack' && p.def.engine)
    .sort((a, b) => a.stackIndex - b.stackIndex);
  const landerEng = engines[0];
  if (!landerEng) return { ok: false, dropped: [] };
  const dec = st.parts
    .filter((p) => p.alive && p.kind === 'stack' && p.def.decoupler && p.stackIndex > landerEng.stackIndex)
    .sort((a, b) => a.stackIndex - b.stackIndex)[0];
  if (!dec) {
    if (!landerEng.ignited) landerEng.ignited = true;
    return { ok: false, dropped: [], already: true };
  }
  const cut = dec.stackIndex;
  const dropped = st.parts.filter((p) => p.stackIndex >= cut).map((p) => p.def.name);
  st.parts = st.parts.filter((p) => p.stackIndex < cut);
  landerEng.ignited = true;
  if (typeof refreshMass === 'function') refreshMass();
  else {
    st.geom = stackGeometry(st.parts);
    st.sections = computeSections(st.parts);
    st.massProps = massProps(st.parts, st.geom);
  }
  if (typeof resyncPlan === 'function') resyncPlan();
  return { ok: true, dropped };
}

export function ascentParams(st) {
  const srbs = (st.parts ?? [])
    .filter((p) => p.def?.engine?.srb)
    .reduce((s, p) => s + (p.sym || 1), 0);
  const wet = st.massProps?.m ?? 0;
  // Working 4-tank Falcon Hauler (8 XL + 6 SRB) circularized 72×90 on
  // 83 km / turnStart 180. The 115 km / later-turn XL branch was a
  // 5-tank experiment and left Pe in atmo (62×4188). Do not use that profile.
  // Extra XL/SRB on Raven burned in a 2 km turn. Keep this loft.
  if (srbs >= 6 || wet > 40_000) {
    return { apTarget: 83_000, peClear: 71_500, turnStart: 180, turnSpan: 2600 };
  }
  return { apTarget: 83_000, peClear: 71_500, turnStart: 80, turnSpan: 2200 };
}

/** One gravity-turn / circularize tick. No judgment beyond the cut's stop. */
export function ascentTick(st, opts = {}) {
  const params = { ...ascentParams(st), ...opts };
  const { apTarget, peClear, turnStart, turnSpan } = params;
  const body = BODIES[st.body] || BODIES.kerbin;
  const up = st.pos.clone().normalize();
  const east = new Vector3(0, 1, 0).cross(up);
  if (east.lengthSq() < 1e-12) east.set(0, 0, -1);
  east.normalize();

  let e;
  try {
    e = elementsFromState(st.pos, st.vel, body.mu, st.t);
  } catch {
    return { done: false, dir: up, throttle: 1, stage: false, e: null };
  }

  const apAlt = (e.a > 0 ? e.ra : 1e12) - body.radius;
  const peAlt = e.rp - body.radius;
  if (e.a > 0 && peAlt > peClear) {
    return { done: true, dir: st.vel.lengthSq() > 1 ? st.vel.clone().normalize() : east, throttle: 0, stage: false, e };
  }

  const sp = st.vel.length();
  let dir;
  if (apAlt < apTarget) {
    const k = Math.min(0.92, Math.pow(Math.max(0, (sp - turnStart) / turnSpan), 0.8));
    dir = up.clone().multiplyScalar(1 - k).addScaledVector(east, k);
  } else {
    // Horizontal + time-to-Ap bias (same as tests/lib/autopilot ascentToOrbit).
    // Prograde-only after Ap-target left Pe in atmo and ballooned Ap (4-tank
    // -275 x 113344, Falcon dry). Do not use a late / prograde-only turn.
    const tAp = timeToApoapsis(e, st.t);
    const vUp = st.vel.dot(up);
    const hdir = st.vel.clone().addScaledVector(up, -vUp);
    if (hdir.lengthSq() < 1) hdir.copy(east);
    hdir.normalize();
    let bias = Math.max(-0.15, Math.min(0.55, (35 - tAp) / 50));
    // Raven 120 kN cannot raise Pe from a −560×83 handoff before atmo.
    // Loft Ap toward 140 km for more time; cap ~155 km so this is not the
    // 115 km / prograde-only balloon to 4188.
    const { transfer } = roleEngines(st);
    const xferThrust = transfer?.def?.engine?.thrustVac ?? Infinity;
    if (xferThrust < 180_000) {
      if (apAlt < 140_000) bias = Math.max(bias, 0.48);
      else if (apAlt > 155_000) bias = Math.min(bias, 0.05);
    }
    dir = hdir.addScaledVector(up, bias);
    if (dir.lengthSq() < 1e-12) dir = up.clone();
    dir.normalize();
    const dry = shouldStageDry(st, opts.plan, opts.stageIdx, { allowLander: false });
    return { done: false, dir, throttle: 1, stage: dry.stage, stageReason: dry.reason, e };
  }
  if (dir.lengthSq() < 1e-12) dir = up.clone();
  dir.normalize();
  const dry = shouldStageDry(st, opts.plan, opts.stageIdx, { allowLander: false });
  return { done: false, dir, throttle: 1, stage: dry.stage, stageReason: dry.reason, e };
}

export function maybeDropLaunchStage(st) {
  const booster = (st.parts ?? []).find((p) => p.alive !== false && /Titan/.test(p.def?.name || ''));
  if (!booster) return false;
  return lifterFuelKg(st) <= lifterReserveKg(st);
}

export function vesselMunPhaseDeg(st) {
  const mun = getBodyState('mun', st.t).pos;
  const rv = st.pos.clone().normalize();
  const rm = mun.clone().normalize();
  const cr = new Vector3().crossVectors(rv, rm);
  let a = Math.atan2(cr.y, rv.dot(rm)) * 180 / Math.PI;
  if (a < 0) a += 360;
  return a;
}

/** On-rails coast. Mutates st. Do not use 120s physics steps. */
export function coastRailsOnState(st, { maxS, pred = null, dt = 60 } = {}) {
  const tEnd = st.t + Math.max(0, maxS);
  let el;
  try {
    el = elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
  } catch {
    return { ok: false, arrived: false, reason: 'no-elements' };
  }
  while (st.t < tEnd && !st.dead) {
    if (pred && pred(st)) return { ok: true, arrived: true };
    const step = Math.min(dt, tEnd - st.t);
    if (step <= 1e-9) break;
    st.t += step;
    if (st.met != null) st.met += step;
    const { pos, vel } = propagate(el, st.t);
    const b = BODIES[st.body];
    const floor = b.radius + Math.max(b.atmoHeight || 0, 2_500) + 400;
    if (pos.length() < floor) {
      st.t -= step;
      if (st.met != null) st.met -= step;
      break;
    }
    st.pos.copy(pos);
    st.vel.copy(vel);
    const soiEvents = [];
    checkSOI(st, soiEvents);
    if (soiEvents.length) {
      try {
        el = elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
      } catch {
        stepECOnRails(st, step);
        break;
      }
    }
    stepECOnRails(st, step);
  }
  return { ok: true, arrived: pred ? !!pred(st) : true };
}

export function runWindowMuscle(st, missionId) {
  if (!st || st.dead) return { ok: false, reason: 'dead' };
  if (st.landed) return { ok: false, reason: 'landed' };
  const orb = orbitCheck(st);
  if (!orb.ok || (st.body === 'kerbin' && (orb.peKm == null || orb.peKm < 70))) {
    return { ok: false, reason: 'not-orbit', check: readFlightCheck(st) };
  }
  if (missionId === 'duna-roundtrip') {
    const xfer = hohmannTransfer('kerbin', 'duna');
    const from = BODIES.kerbin;
    const to = BODIES.duna;
    const nRel = from.omega - to.omega;
    const phaseNow0 = planetPhaseDeg('kerbin', 'duna', st.t);
    let d = ((phaseNow0 - xfer.phaseDeg) % 360 + 360) % 360;
    if (d < 0.05 || d > 359.95) d = 0;
    const waitS = Math.abs(nRel) > 1e-14 ? d * (Math.PI / 180) / nRel : 0;
    const wait = waitS < 0 ? waitS + Math.abs(2 * Math.PI / nRel) : waitS;
    const period = orb.e?.period ?? 2200;
    const jump = Math.max(0, wait - period - 80);
    if (jump > 30) coastRailsOnState(st, { maxS: jump, dt: 200 });
    const coast = coastRailsOnState(st, {
      maxS: period + 400,
      pred: () => Math.abs(angleDiff(planetPhaseDeg('kerbin', 'duna', st.t), xfer.phaseDeg)) < 0.15,
      dt: 8,
    });
    const now = planetPhaseDeg('kerbin', 'duna', st.t);
    return {
      ok: coast.ok,
      arrived: coast.arrived,
      targetDeg: xfer.phaseDeg,
      nowDeg: now,
      errDeg: angleDiff(now, xfer.phaseDeg),
      check: readFlightCheck(st),
    };
  }
  const target = munTransferPhase(st.pos.length());
  const coast = coastRailsOnState(st, {
    maxS: 3 * 140_000,
    pred: () => Math.abs(angleDiff(vesselMunPhaseDeg(st), target)) < 1.2,
    dt: 5,
  });
  const now = vesselMunPhaseDeg(st);
  return {
    ok: coast.ok,
    arrived: coast.arrived,
    targetDeg: target,
    nowDeg: now,
    errDeg: angleDiff(now, target),
    check: readFlightCheck(st),
  };
}

export function runCoastMuscle(st) {
  if (!st || st.dead) return { ok: false, reason: 'dead' };
  if (st.landed) return { ok: false, reason: 'landed' };
  const body = BODIES[st.body];
  const alt = st.pos.length() - body.radius;
  if (body.atmoHeight && alt < body.atmoHeight + 2000) {
    return { ok: false, reason: 'in-atmo', check: readFlightCheck(st) };
  }
  const body0 = st.body;
  const orb = orbitCheck(st);
  const period = orb.e?.period;
  const maxS = Number.isFinite(period) ? Math.min(period, 90_000) : 90_000;
  const coast = coastRailsOnState(st, {
    maxS,
    pred: (s) => s.body !== body0,
    dt: 60,
  });
  return {
    ok: coast.ok,
    arrived: coast.arrived,
    bodyFrom: body0,
    bodyTo: st.body,
    check: readFlightCheck(st),
  };
}

export function runJettisonMuscle(st, hooks = {}) {
  if (!st || st.dead) return { ok: false, reason: 'dead' };
  const out = dropToLander(st, hooks);
  const check = readFlightCheck(st);
  if (out.ok) return { ok: true, dropped: out.dropped, check };
  if (out.already) return { ok: true, already: true, dropped: [], check };
  return { ok: false, reason: 'no-lander', check };
}

export function lkoAlready(st) {
  if (!st || st.landed || st.dead || st.body !== 'kerbin') return false;
  const orb = orbitCheck(st);
  return !!(orb.ok && orb.peKm != null && orb.peKm > 70);
}


/** Hyperbolic-asymptote ejection angle (deg from midnight). Not geometric midnight. */
export function targetEjectionAngleDeg(rPark, vInf, mu) {
  const e = 1 + rPark * vInf * vInf / mu;
  const nuInf = Math.acos(Math.min(1, Math.max(-1, -1 / e))) * 180 / Math.PI;
  return 90 - nuInf;
}

/** Vessel angle from the planet's midnight (sun-line) in the orbit plane. */
export function vesselMidnightAngle(planet, t, pos) {
  const k = getBodyState(planet, t);
  const kHat = k.pos.clone().normalize();
  const pHat = k.vel.clone().normalize();
  const r = pos.clone().normalize();
  return Math.atan2(r.dot(pHat), r.dot(kHat)) * 180 / Math.PI;
}

export function vInfEst(st) {
  const r = st.pos.length();
  const v = st.vel.length();
  const mu = BODIES[st.body].mu;
  const disc = v * v - 2 * mu / r;
  return disc > 0 ? Math.sqrt(disc) : 0;
}

/** Uppermost live stack engine = lander; bottommost remaining = transfer. */
export function roleEngines(st) {
  const engines = (st.parts ?? [])
    .filter((p) => p.alive !== false && p.kind === 'stack' && p.def?.engine && !p.def.engine.srb)
    .sort((a, b) => a.stackIndex - b.stackIndex);
  if (!engines.length) return { lander: null, transfer: null, engines };
  if (engines.length === 1) return { lander: engines[0], transfer: null, engines };
  if (engines.length === 2) return { lander: engines[0], transfer: engines[1], engines };
  return { lander: engines[0], transfer: engines[engines.length - 2], engines };
}

export function sectionFuel(st, engine) {
  if (!engine) return 0;
  const secs = computeSections(st.parts);
  const sec = secs.get(engine.stackIndex);
  return (st.parts ?? [])
    .filter((p) => p.alive !== false && p.fuel > 0 && !p.def?.engine?.srb
      && secs.get(p.stackIndex) === sec)
    .reduce((s, p) => s + p.fuel, 0);
}

export function transferFuelKg(st) {
  const { transfer } = roleEngines(st);
  if (!transfer) return 0;
  return sectionFuel(st, transfer);
}

/**
 * Light the transfer engine only. Unignite the lander. Refuse if transfer
 * fuel ≤ 1 kg. Never lights the lander.
 */
export function lightTransferOnly(st) {
  const { lander, transfer } = roleEngines(st);
  if (lander) lander.ignited = false;
  const kg = transfer ? sectionFuel(st, transfer) : 0;
  if (!transfer || kg <= 1) {
    return { ok: false, reason: 'transfer-dry', transferFuelKg: kg };
  }
  transfer.ignited = true;
  return { ok: true, transferFuelKg: kg };
}

export function destForNode(nodeId, missionId) {
  if (nodeId === 'tli' || missionId === 'mun-roundtrip') return 'mun';
  return 'duna';
}

export function coastAfterEscape(state) {
  const nodes = state?.nodes ?? [];
  const i = nodes.findIndex((n) => n.id === 'coast');
  const prev = i > 0 ? nodes[i - 1] : null;
  if (prev && (prev.id === 'escape' || prev.id === 'tli')) return true;
  return nodes.some((n) => (n.id === 'escape' || n.id === 'tli') && n.status === 'done');
}
