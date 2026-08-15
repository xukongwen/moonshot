#!/usr/bin/env node
// Kerbin → Duna / 火星 interplanetary Hohmann (patched conics).
// Stock Mun Express, SimSession + FlightLog. Does not touch SYSTEM_LOG / ROUNDTRIP_LOG.

import { readdirSync, unlinkSync, existsSync } from 'node:fs';
import { Vector3 } from 'three';
import { SimSession } from './session.mjs';
import { FlightLog } from './flightlog.mjs';
import { BODIES, getBodyState, getRelativeState, fmtTime, fmtDist } from '../src/constants.js';
import { computeSections } from '../src/vessel.js';
import { checkSOI } from '../src/physics.js';
import {
  elementsFromState, propagate, timeToPeriapsis, timeToApoapsis,
  findEncounter, planetPhaseDeg, hohmannTransfer, ejectionDeltaV,
} from '../src/orbits.js';

const Y = new Vector3(0, 1, 0);
const LOG_PATH = '/workspace/moonshot/DUNA_LOG.md';
const SNAP_DIR = '/workspace/moonshot/logs/snapshots';
const KERBIN = BODIES.kerbin;
const DUNA = BODIES.duna;

const CAPTIONS = {
  '01-pad': 'Pad / 发射台 — Mun Express on Kerbin',
  '02-lko': 'LKO after MECO — 近地轨道',
  '02-lko-map': 'LKO map — Kerbin / Mun / Minmus',
  '03-window': 'Duna window — 霍曼窗口 (phase matched)',
  '03-window-map': 'Duna window map — 即将点火',
  '04-tdi': 'TDI cutoff — 逃逸点火结束 (Kerbin SOI)',
  '04-tdi-map': 'TDI map — 双曲线逃逸',
  '05-solar': '霍曼转移 — Kerbol 图，Kerbin 蓝圈 / Duna 橙圈',
  '05-solar-map': 'Solar Hohmann — Kerbin (blue) / Duna (orange) / transfer ellipse',
  '06-duna-soi': 'Duna SOI — 进入火星（Duna）引力球',
  '06-duna-soi-map': 'Duna SOI map',
  '07-duna-orbit': 'Duna orbit — 捕获环绕 Duna / 火星',
  '07-duna-orbit-map': 'Duna orbit map — bound, Ap < SOI',
};

const FLOG_OPTS = {
  craft: 'Mun Express',
  pilot: 'autopilot (`mcp/duna-hohmann.mjs`)',
  title: 'MOONSHOT — Kerbin → Duna / 火星 Hohmann',
  mdPath: LOG_PATH,
  captions: CAPTIONS,
};

function makeLog(session, wipeJsonl = true) {
  return new FlightLog(session, { ...FLOG_OPTS, wipeJsonl });
}

if (process.argv.includes('--relink')) {
  const flog = makeLog(null, false);
  flog.loadJsonl();
  const path = flog.write(LOG_PATH);
  console.log(`relinked ${path}`);
  process.exit(0);
}

const session = new SimSession();
const flog = makeLog(session, true);

if (existsSync(SNAP_DIR)) {
  for (const f of readdirSync(SNAP_DIR)) {
    if (f.endsWith('.json')) unlinkSync(`${SNAP_DIR}/${f}`);
  }
}

const summary = {
  lko: null,
  window: null,
  tdi: null,
  kerbol: false,
  dunaSoi: false,
  dunaOrbit: null,
  fuelEnd: null,
  snapshots: [],
  retries: [],
};

const xfer = hohmannTransfer('kerbin', 'duna');

function phase(title) {
  console.log(`\n== ${title} ==`);
}

function els(bodyName = session.st.body) {
  const st = session.st;
  if (bodyName === st.body) {
    return elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
  }
  const frame = getRelativeState(st.body, bodyName, st.t);
  const pos = st.pos.clone().add(frame.pos);
  const vel = st.vel.clone().add(frame.vel);
  return elementsFromState(pos, vel, BODIES[bodyName].mu, st.t);
}

function pointVec(dir) {
  const st = session.st;
  const v = dir.clone();
  if (v.lengthSq() < 1e-12) v.copy(session.up());
  st.quat.setFromUnitVectors(Y, v.normalize());
  st.angVel.set(0, 0, 0);
}

function handleEvents(tlm) {
  const evs = tlm?.events || [];
  for (const ev of evs) {
    if (ev.type === 'liftoff') flog.evt('LIFTOFF', 'Vehicle has cleared the pad');
    if (ev.type === 'overheat') {
      flog.evt('OVERHEAT', `${ev.part || 'part'} destroyed by heating`);
    }
    if (ev.type === 'soi') {
      const b = BODIES[ev.body];
      const name = b?.aka ? `${b.name} / ${b.aka}` : (b?.name ?? ev.body);
      flog.evt('SOI', `Entered ${name} sphere of influence`);
    }
    if (ev.type === 'landed') {
      flog.evt('TOUCHDOWN', `Contact at ${Number(ev.speed).toFixed(2)} m/s — ${BODIES[session.st.body].name}`);
    }
    if (ev.type === 'crashed') {
      const msg = `CRASHED at ${Number(ev.speed).toFixed(1)} m/s, t=${session.st.t.toFixed(0)}s`;
      flog.evt('CRASH', msg);
      throw new Error(msg);
    }
  }
  if (session.st.dead) {
    throw new Error(`Vessel dead at t=${session.st.t.toFixed(0)}s alt=${session.alt().toFixed(0)}`);
  }
  flog.sample();
  return evs;
}

function doStage(reason = '') {
  const out = session.stage();
  if (out.staged) {
    const extra = [];
    if (out.ignite) extra.push(`ignite ${out.ignite}`);
    if (out.decouple != null) extra.push('lower stack jettisoned');
    if (out.dropRadials) extra.push('boosters away');
    flog.evt(`STAGE ${session.stageIdx}`, `${out.staged}${extra.length ? ' — ' + extra.join(', ') : ''}${reason ? ` (${reason})` : ''}`);
  }
  return out;
}

function maybeStageDry() {
  const st = session.st;
  const srb = st.parts.find((p) => p.def.engine?.srb);
  if (srb && srb.fuel <= 1) {
    doStage('SRBs dry');
    return;
  }
  const lit = st.parts.find((p) => p.ignited && p.alive && p.def.engine && !p.def.engine.srb);
  if (lit) {
    const secs = computeSections(st.parts);
    const feed = st.parts.some((p) => p.def.fuel && !p.def.engine && p.fuel > 0.5 &&
      secs.get(p.stackIndex) === secs.get(lit.stackIndex));
    if (!feed) doStage('stage dry');
  }
}

function orbitText(e, bodyName) {
  const b = BODIES[bodyName];
  const pe = (e.rp - b.radius) / 1000;
  const ap = Number.isFinite(e.ra) ? (e.ra - b.radius) / 1000 : Infinity;
  return `${pe.toFixed(0)} × ${Number.isFinite(ap) ? ap.toFixed(0) : '∞'} km`;
}

function angleDiff(a, b) {
  return ((a - b + 180) % 360 + 360) % 360 - 180;
}

function vInfEst() {
  const r = session.st.pos.length();
  const v = session.st.vel.length();
  const mu = BODIES[session.st.body].mu;
  const disc = v * v - 2 * mu / r;
  return disc > 0 ? Math.sqrt(disc) : 0;
}

function snap(tag) {
  flog.snapshot(tag);
  summary.snapshots.push(tag);
}

function checkpoint(label) {
  flog.write(LOG_PATH);
  const t = session.telemetry();
  console.log(`  [checkpoint ${label}] MET ${fmtTime(t.t)}  ${t.body}  alt ${fmtDist(t.alt_m)}  v ${t.speed_ms.toFixed(0)} m/s  fuel ${t.fuel_kg.toFixed(0)} kg`);
}

/**
 * On-rails coast with large dt. Advances st.t via propagate + checkSOI.
 * 200 days at dt=120s is fine in node — do NOT use 120s physics steps.
 */
function coastRails(maxS, pred = null, dt = 60) {
  const st = session.st;
  const t0 = st.t;
  const tEnd = t0 + Math.max(0, maxS);
  let el;
  try {
    el = elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
  } catch {
    return false;
  }
  let lastSample = st.t;
  while (st.t < tEnd && !st.dead) {
    if (pred && pred()) {
      flog.sample();
      return true;
    }
    const step = Math.min(dt, tEnd - st.t);
    if (step <= 1e-9) break;
    const bodyBefore = st.body;
    st.t += step;
    const { pos, vel } = propagate(el, st.t);
    const floor = BODIES[st.body].radius + Math.max(22_000, (BODIES[st.body].atmoHeight || 0) + 2000);
    if (pos.length() < floor) {
      st.t -= step;
      break;
    }
    st.pos.copy(pos);
    st.vel.copy(vel);
    const soiEvents = [];
    checkSOI(st, soiEvents);
    if (soiEvents.length) {
      handleEvents({ events: soiEvents.map((ev) => ({ type: ev.type, body: ev.body })) });
      try {
        el = elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
      } catch {
        break;
      }
    }
    if (st.t - lastSample >= 900) {
      flog.sample();
      lastSample = st.t;
    }
    if (bodyBefore !== st.body && pred && pred()) {
      flog.sample();
      return true;
    }
  }
  flog.sample();
  return pred ? !!pred() : true;
}

function burnUntil(pred, { aim = 'prograde', maxS = 400, dt = 0.2 } = {}) {
  const tEnd = session.st.t + maxS;
  session.setThrottle(1);
  while (session.st.t < tEnd && !session.st.dead) {
    if (aim === 'prograde') session.point('prograde');
    else if (aim === 'retrograde') session.point('retrograde');
    const stepDt = Math.min(dt, tEnd - session.st.t);
    handleEvents(session.step(stepDt));
    maybeStageDry();
    if (pred()) break;
    if (session.fuelLeft() < 8) break;
  }
  session.setThrottle(0);
}

function burnDeltaV(dV, { aim = 'prograde', maxS = 180 } = {}) {
  if (Math.abs(dV) < 0.5) return 0;
  const useAim = dV < 0 ? (aim === 'prograde' ? 'retrograde' : 'prograde') : aim;
  const target = Math.abs(dV);
  const v0 = session.st.vel.clone();
  const t0 = session.st.t;
  session.setThrottle(1);
  const tEnd = session.st.t + maxS;
  while (session.st.t < tEnd && !session.st.dead && session.fuelLeft() > 8) {
    session.point(useAim);
    handleEvents(session.step(0.12));
    maybeStageDry();
    if (session.st.vel.clone().sub(v0).length() >= target) break;
  }
  session.setThrottle(0);
  return session.st.vel.clone().sub(v0).length();
}

function closestApproach(childName, horizon, el = null) {
  el = el || els();
  const t0 = session.st.t;
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

function targetEjectionAngleDeg(rPark, vInf) {
  const e = 1 + rPark * vInf * vInf / KERBIN.mu;
  const nuInf = Math.acos(Math.min(1, Math.max(-1, -1 / e))) * 180 / Math.PI;
  // α from midnight (kHat) toward prograde (pHat). Negative = trailing / dusk.
  return 90 - nuInf;
}

function vesselMidnightAngle(t = session.st.t, pos = session.st.pos) {
  const k = getBodyState('kerbin', t);
  const kHat = k.pos.clone().normalize();
  const pHat = k.vel.clone().normalize();
  const r = pos.clone().normalize();
  return Math.atan2(r.dot(pHat), r.dot(kHat)) * 180 / Math.PI;
}

function velAlignDot() {
  const kv = getBodyState('kerbin', session.st.t).vel.clone().normalize();
  const vv = session.st.vel.clone().normalize();
  return kv.dot(vv);
}

function leaveMoonIfNeeded() {
  if (session.st.body !== 'mun' && session.st.body !== 'minmus') return;
  const moon = session.st.body;
  const b = BODIES[moon];
  flog.evt('MOON ESCAPE', `Leaving ${b.name} SOI (on Duna coast)`);
  const e0 = els();
  if (!(e0.a < 0)) {
    burnUntil(() => session.st.body !== moon || els().a < 0, { aim: 'prograde', maxS: 240, dt: 0.15 });
  }
  if (session.st.body !== moon) return;
  coastRails(80_000, () => session.st.body === 'kerbin' || session.st.body === 'kerbol', 30);
  if (session.st.body === moon) throw new Error(`Stuck in ${moon} SOI`);
}

function writeSummaryMd() {
  const rows = [];
  rows.push('## Key orbits');
  rows.push('');
  rows.push(`- **Hohmann (Kerbin→Duna):** tT=${(xfer.tT / 86400).toFixed(2)} d  phase=${xfer.phaseDeg.toFixed(2)}°  v∞dep=${xfer.vInfDep.toFixed(0)} m/s  v∞arr=${xfer.vInfArr.toFixed(0)} m/s`);
  if (summary.lko) rows.push(`- **LKO:** ${summary.lko}`);
  if (summary.window) rows.push(`- **Duna window:** ${summary.window}`);
  if (summary.tdi) rows.push(`- **TDI:** ${summary.tdi}`);
  rows.push(`- **Kerbol SOI:** ${summary.kerbol ? 'reached' : 'NOT reached'}`);
  rows.push(`- **Duna / 火星 SOI:** ${summary.dunaSoi ? 'reached' : 'NOT reached'}`);
  if (summary.dunaOrbit) rows.push(`- **Duna orbit:** ${summary.dunaOrbit}`);
  if (summary.fuelEnd != null) rows.push(`- **Fuel remaining:** ${summary.fuelEnd.toFixed(0)} kg`);
  rows.push(`- **Snapshots:** ${summary.snapshots.join(', ') || '(none)'}`);
  if (summary.retries.length) rows.push(`- **Retries / mid-course:** ${summary.retries.join('; ')}`);
  rows.push('');
  flog.setExtraMarkdown(rows.join('\n'));
}


function searchProgradeCA(horizon) {
  const st = session.st;
  const mu = BODIES.kerbol.mu;
  const vHat = st.vel.clone().normalize();
  const rHat = st.pos.clone().normalize();
  let best = { d: Infinity, dV: 0, enc: null, dPro: 0, dRad: 0 };
  const dVs = [];
  for (let v = -90; v <= 90; v += 3) dVs.push(v);
  for (const extra of [-2, -1, 1, 2, 4, -4, 7, -7, 12, -12, 18, -18, 25, -25, 35, -35, 50, -50, 70, -70]) {
    if (!dVs.includes(extra)) dVs.push(extra);
  }
  for (const dV of dVs) {
    const vel = st.vel.clone().addScaledVector(vHat, dV);
    const el = elementsFromState(st.pos.clone(), vel, mu, st.t);
    const enc = findEncounter(el, st.t, horizon, 'duna');
    const ca = closestApproach('duna', horizon, el);
    const d = enc ? Math.min(ca.d, Math.max(0, enc.periapsis + DUNA.radius)) : ca.d;
    if (d < best.d) best = { d, dV, enc, dPro: dV, dRad: 0, ca };
  }
  // refine ±3 m/s around the best
  if (Number.isFinite(best.dV)) {
    for (let dv = best.dV - 3; dv <= best.dV + 3; dv += 0.5) {
      const vel = st.vel.clone().addScaledVector(vHat, dv);
      const el = elementsFromState(st.pos.clone(), vel, mu, st.t);
      const enc = findEncounter(el, st.t, horizon, 'duna');
      const ca = closestApproach('duna', horizon, el);
      const d = enc ? Math.min(ca.d, Math.max(0, enc.periapsis + DUNA.radius)) : ca.d;
      if (d < best.d) best = { d, dV: dv, enc, dPro: dv, dRad: 0, ca };
    }
  }
  // small radial around the best prograde
  for (const dRad of [0, 6, -6, 12, -12, 20, -20]) {
    const vel = st.vel.clone().addScaledVector(vHat, best.dV).addScaledVector(rHat, dRad);
    const el = elementsFromState(st.pos.clone(), vel, mu, st.t);
    const enc = findEncounter(el, st.t, horizon, 'duna');
    const ca = closestApproach('duna', horizon, el);
    const d = enc ? Math.min(ca.d, Math.max(0, enc.periapsis + DUNA.radius)) : ca.d;
    if (d < best.d) best = { d, dV: best.dV, enc, dPro: best.dV, dRad, ca };
  }
  return best;
}

function searchEncounterDV(horizon) {
  const st = session.st;
  const mu = BODIES.kerbol.mu;
  const vHat = st.vel.clone().normalize();
  const rHat = st.pos.clone().normalize();
  const nHat = new Vector3().crossVectors(st.pos, st.vel).normalize();
  const candidates = [];
  const progs = [0, 8, -8, 15, -15, 25, -25, 40, -40, 60, -60, 90, -90, 130, -130, 180, 250, 350, 480];
  const rads = [0, 12, -12, 25, -25, 40];
  for (const dPro of progs) {
    for (const dRad of rads) {
      if (Math.abs(dPro) + Math.abs(dRad) > 520) continue;
      const vel = st.vel.clone().addScaledVector(vHat, dPro).addScaledVector(rHat, dRad);
      const el = elementsFromState(st.pos.clone(), vel, mu, st.t);
      const enc = findEncounter(el, st.t, horizon, 'duna');
      if (enc && enc.periapsis > -50_000) {
        candidates.push({
          dPro, dRad, enc,
          score: Math.abs(dPro) + Math.abs(dRad) * 1.2
            + (enc.periapsis < 50_000 ? 80 : 0)
            + Math.abs(enc.periapsis - 120_000) / 50_000,
        });
      }
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] || null;
}

function applyVectorBurn(dPro, dRad, maxS = 200) {
  const vHat = session.st.vel.clone().normalize();
  const rHat = session.st.pos.clone().normalize();
  const want = vHat.multiplyScalar(dPro).addScaledVector(rHat, dRad);
  const mag = want.length();
  if (mag < 0.8) return 0;
  const v0 = session.st.vel.clone();
  pointVec(want);
  session.setThrottle(1);
  const tEnd = session.st.t + maxS;
  while (session.st.t < tEnd && !session.st.dead && session.fuelLeft() > 8) {
    const got = session.st.vel.clone().sub(v0);
    if (got.length() >= mag) break;
    const remain = want.clone().sub(got);
    if (remain.lengthSq() > 1) pointVec(remain);
    handleEvents(session.step(0.12));
    maybeStageDry();
  }
  session.setThrottle(0);
  return session.st.vel.clone().sub(v0).length();
}

function closingBurn(horizon) {
  const el = els();
  const ca = closestApproach('duna', horizon, el);
  const dt = ca.t - session.st.t;
  if (!(dt > 2000) || ca.d < DUNA.soi * 0.9) return null;
  const { pos } = propagate(el, ca.t);
  const miss = getBodyState('duna', ca.t).pos.clone().sub(pos);
  const dVvec = miss.divideScalar(dt);
  const mag = dVvec.length();
  if (mag < 1 || mag > 420) return { mag, ca, applied: false };
  const v0 = session.st.vel.clone();
  pointVec(dVvec);
  session.setThrottle(1);
  const tEnd = session.st.t + 160;
  while (session.st.t < tEnd && session.fuelLeft() > 8) {
    const got = session.st.vel.clone().sub(v0);
    if (got.length() >= mag) break;
    const remain = dVvec.clone().sub(got);
    if (remain.lengthSq() > 1) pointVec(remain);
    handleEvents(session.step(0.12));
    maybeStageDry();
  }
  session.setThrottle(0);
  return { mag, ca, applied: true, used: session.st.vel.clone().sub(v0).length() };
}

// ---------------------------------------------------------------------------
// Mission
// ---------------------------------------------------------------------------
try {
  phase('PRELAUNCH');
  session.newFlight('Mun Express');
  const t0 = session.telemetry();
  flog.evt('PRELAUNCH', `Mun Express on the pad — liftoff mass ${t0.mass_t.toFixed(2)} t, ${t0.stages.length} stages`);
  snap('PRELAUNCH');
  flog.sample(true, 'pad');
  checkpoint('prelaunch');

  // -----------------------------------------------------------------------
  // 1. ASCENT → LKO (proven gravity-turn from mission.test / systemtour)
  // -----------------------------------------------------------------------
  phase('ASCENT');
  session.setThrottle(1);
  doStage('ignition');

  let orbitDone = false;
  for (let i = 0; i < 80_000; i++) {
    const st = session.st;
    const sp = st.vel.length();
    const u = session.up();
    const vUp = st.vel.dot(u);
    const e = els();
    const apAlt = (e.a > 0 ? e.ra : 1e12) - KERBIN.radius;
    const peAlt = e.rp - KERBIN.radius;

    if (e.a > 0 && peAlt > 71_500) {
      session.setThrottle(0);
      orbitDone = true;
      break;
    }

    if (apAlt < 83_000) {
      const k = Math.min(0.92, Math.pow(Math.max(0, (sp - 80) / 2200), 0.8));
      pointVec(u.clone().multiplyScalar(1 - k).addScaledVector(session.east(), k));
    } else {
      const tAp = timeToApoapsis(e, st.t);
      const hdir = st.vel.clone().addScaledVector(u, -vUp).normalize();
      const bias = Math.max(-0.15, Math.min(0.55, (35 - tAp) / 50));
      pointVec(hdir.addScaledVector(u, bias));
    }
    session.setThrottle(1);
    handleEvents(session.step(0.25));
    maybeStageDry();

    if (i % 80 === 0 && i > 0) {
      console.log(`  ascent t=${st.t.toFixed(0)}s alt=${(session.alt() / 1000).toFixed(1)}km v=${sp.toFixed(0)} Ap=${(apAlt / 1000).toFixed(0)}km Pe=${(peAlt / 1000).toFixed(0)}km`);
    }
  }

  {
    const e = els();
    const txt = orbitText(e, 'kerbin');
    if (!orbitDone || e.rp <= KERBIN.radius + 70_000) {
      throw new Error(`Failed to reach stable orbit (${txt})`);
    }
    flog.evt('MECO / ORBIT', `Stable orbit ${txt}`);
    snap('MECO_ORBIT');
    summary.lko = txt;
    console.log(`  orbit ${txt} at t=${session.st.t.toFixed(0)}s, fuel ${session.fuelLeft().toFixed(0)} kg`);
    flog.sample(true, 'LKO');
    checkpoint('orbit');
  }

  {
    const st = session.st;
    const spentTanks = !st.parts.some((p) => p.def.fuel && !p.def.engine && p.fuel > 0.5 &&
      computeSections(st.parts).get(p.stackIndex) === 0);
    const falcon = st.parts.find((p) => p.def.name.includes('Falcon'));
    if (falcon && spentTanks) doStage('drop launch stage');
  }

  // -----------------------------------------------------------------------
  // 2. Wait for Hohmann window (analytic rails, not 120s physics)
  // -----------------------------------------------------------------------
  phase('DUNA WINDOW');
  {
    const nRel = KERBIN.omega - DUNA.omega;
    const phaseNow0 = planetPhaseDeg('kerbin', 'duna', session.st.t);
    let d = ((phaseNow0 - xfer.phaseDeg) % 360 + 360) % 360;
    if (d < 0.05 || d > 359.95) d = 0;
    const waitS = d * (Math.PI / 180) / nRel;
    const lkoP = els().period ?? 2200;
    console.log(`  Hohmann tT=${(xfer.tT / 86400).toFixed(2)} d  target phase=${xfer.phaseDeg.toFixed(2)}°  now=${phaseNow0.toFixed(2)}°  wait=${(waitS / 86400).toFixed(2)} d`);
    flog.evt('DUNA WINDOW', `Target phase ${xfer.phaseDeg.toFixed(2)}°  now ${phaseNow0.toFixed(2)}°  wait ${(waitS / 86400).toFixed(2)} d  (tT ${(xfer.tT / 86400).toFixed(2)} d, v∞ ${xfer.vInfDep.toFixed(0)}/${xfer.vInfArr.toFixed(0)} m/s)`);

    // Arrive ~1 LKO orbit before the exact window so we can pick the
    // ejection-angle opportunity closest to the phase match.
    const jump = Math.max(0, waitS - lkoP - 80);
    if (jump > 30) coastRails(jump, null, 200);
    coastRails(lkoP + 400, () => {
      const p = planetPhaseDeg('kerbin', 'duna', session.st.t);
      return Math.abs(angleDiff(p, xfer.phaseDeg)) < 0.12;
    }, 8);

    const phaseNow = planetPhaseDeg('kerbin', 'duna', session.st.t);
    const err = angleDiff(phaseNow, xfer.phaseDeg);
    summary.window = `now ${phaseNow.toFixed(2)}°  target ${xfer.phaseDeg.toFixed(2)}°  err ${err.toFixed(2)}°  waited ${(session.st.t / 86400).toFixed(2)} d`;
    flog.evt('DUNA WINDOW', `Phase matched — now ${phaseNow.toFixed(2)}° vs target ${xfer.phaseDeg.toFixed(2)}° (err ${err.toFixed(2)}°)`);
    snap('DUNA_WINDOW');
    flog.sample(true, 'Duna window');
    checkpoint('window');
  }

  // -----------------------------------------------------------------------
  // 3. Ejection burn
  //    Geometric midnight (vel · v_kerbin > 0.97) puts the hyperbola Pe on
  //    the anti-sun line; hyperbolic turning then leaves v∞ ~59° off prograde
  //    and the transfer misses Duna by millions of km. Burn instead at the
  //    asymptote-aligned true anomaly so leftover v∞ is prograde-to-Kerbin.
  //    Finite-burn (~160 s) is centred on that point.
  // -----------------------------------------------------------------------
  phase('TDI / EJECTION');
  {
    const rPark = session.st.pos.length();
    const ej = ejectionDeltaV(rPark, KERBIN.mu, xfer.vInfDep);
    const alpha = targetEjectionAngleDeg(rPark, xfer.vInfDep);
    // ~13° lead so a ~160 s burn is centred on α (LKO ~0.17 °/s)
    const startAng = alpha - 13;
    console.log(`  ejection α=${alpha.toFixed(1)}° from midnight, start at ${startAng.toFixed(1)}°, dV=${ej.dV.toFixed(0)} m/s, v∞=${xfer.vInfDep.toFixed(0)}`);

    const el = els();
    const period = el.period ?? 2200;
    let bestT = session.st.t;
    let bestErr = 1e9;
    for (let dt = 0; dt <= period; dt += 4) {
      const t = session.st.t + dt;
      const { pos } = propagate(el, t);
      const ang = vesselMidnightAngle(t, pos);
      const err = Math.abs(angleDiff(ang, startAng));
      if (err < bestErr) {
        bestErr = err;
        bestT = t;
      }
    }
    const coastTo = Math.max(0, bestT - session.st.t - 2);
    if (coastTo > 2) coastRails(coastTo, () => Math.abs(angleDiff(vesselMidnightAngle(), startAng)) < 2.5, 4);

    const ang = vesselMidnightAngle();
    const align = velAlignDot();
    console.log(`  burn start: midnight-angle ${ang.toFixed(1)}° (start ${startAng.toFixed(1)}°, α ${alpha.toFixed(1)}°)  vel·vK=${align.toFixed(3)}  fuel ${session.fuelLeft().toFixed(0)} kg`);

    const fuel0 = session.fuelLeft();
    const tBurn0 = session.st.t;
    burnUntil(() => {
      if (session.st.body !== 'kerbin') return true;
      const e = els();
      if (!(e.a < 0)) return false;
      const vinf = vInfEst();
      return Math.abs(vinf - xfer.vInfDep) < 50;
    }, { aim: 'prograde', maxS: 420, dt: 0.15 });

    // If still elliptic, keep burning to hyperbola + v∞
    if (session.st.body === 'kerbin' && !(els().a < 0)) {
      burnUntil(() => {
        if (session.st.body !== 'kerbin') return true;
        const e = els();
        return e.a < 0 && Math.abs(vInfEst() - xfer.vInfDep) < 80;
      }, { aim: 'prograde', maxS: 200, dt: 0.15 });
    }

    const vinf = session.st.body === 'kerbin' ? vInfEst() : 0;
    const e = session.st.body === 'kerbin' ? els() : els('kerbin');
    const dVused = ej.dV; // nominal; fuel drop is the real cost
    const fuel1 = session.fuelLeft();
    const txt = `${orbitText(e, 'kerbin')}  v∞=${vinf.toFixed(0)} m/s (tgt ${xfer.vInfDep.toFixed(0)})  Δfuel ${(fuel0 - fuel1).toFixed(0)} kg  burn ${(session.st.t - tBurn0).toFixed(0)} s`;
    summary.tdi = txt;
    flog.evt('TDI', `Trans-Duna injection — ${txt}`);
    snap('TDI_CUTOFF');
    flog.sample(true, 'TDI cutoff');
    checkpoint('tdi');
  }

  // -----------------------------------------------------------------------
  // 4. Leave Kerbin SOI → solar Hohmann
  // -----------------------------------------------------------------------
  phase('LEAVE KERBIN SOI');
  {
    if (session.st.body !== 'kerbol') {
      coastRails(400_000, () => {
        if (session.st.body === 'mun' || session.st.body === 'minmus') return true;
        return session.st.body === 'kerbol';
      }, 30);
    }
    if (session.st.body === 'mun' || session.st.body === 'minmus') {
      leaveMoonIfNeeded();
      if (session.st.body === 'kerbin') {
        coastRails(400_000, () => session.st.body === 'kerbol', 30);
      }
    }
    if (session.st.body !== 'kerbol') {
      // still inside Kerbin: maybe not quite hyperbolic enough
      if (session.st.body === 'kerbin' && !(els().a < 0)) {
        flog.evt('TDI', 'Still elliptic — extra prograde to escape');
        burnUntil(() => els().a < 0 || session.st.body === 'kerbol', { maxS: 180 });
        coastRails(400_000, () => session.st.body === 'kerbol', 30);
      }
    }
    if (session.st.body !== 'kerbol') {
      throw new Error(`Failed to leave Kerbin SOI (body=${session.st.body}, r=${session.st.pos.length().toFixed(0)})`);
    }
    summary.kerbol = true;
    flog.evt('KERBOL SOI', `Left Kerbin SOI — solar Hohmann  ${orbitText(els(), 'kerbol')}`);
    snap('KERBOL_COAST');
    flog.sample(true, 'Kerbol coast');
    checkpoint('kerbol');
  }

  // -----------------------------------------------------------------------
  // Mid-course: find Duna encounter; do not give up after one miss
  // -----------------------------------------------------------------------
  phase('MID-COURSE / ENCOUNTER');
  {
    const horizon = xfer.tT * 1.45;
    const e0 = els();
    const ca0 = closestApproach('duna', horizon, e0);
    console.log(`  solar ${orbitText(e0, 'kerbol')}  CA ${fmtDist(ca0.d)} in ${((ca0.t - session.st.t) / 86400).toFixed(2)} d  SOI ${fmtDist(DUNA.soi)}`);

    let enc = findEncounter(e0, session.st.t, horizon, 'duna');

    // Fine 1-D search over small prograde Δv (timing), then a light radial mix.
    // Iterate: the linear miss-vector burn overcorrects on this scale.
    for (let iter = 0; iter < 5 && !enc; iter++) {
      const hit = searchProgradeCA(horizon);
      console.log(`  iter ${iter}: best Δv ${hit.dV.toFixed(1)} m/s  CA ${fmtDist(hit.d)}${hit.enc ? ' ENCOUNTER' : ''}`);
      if (hit.enc) {
        const msg = `prograde ${hit.dV.toFixed(1)} m/s → Duna Pe ${(hit.enc.periapsis / 1000).toFixed(0)} km`;
        flog.evt('MID-COURSE', msg);
        summary.retries.push(msg);
        if (Math.abs(hit.dPro) > 0.5 || Math.abs(hit.dRad) > 0.5) {
          applyVectorBurn(hit.dPro, hit.dRad);
        }
        enc = findEncounter(els(), session.st.t, horizon, 'duna');
        break;
      }
      if (Math.abs(hit.dV) < 0.6 || hit.d >= ca0.d * 0.995 && iter > 0) {
        // try 2-D grid / closing as backup
        break;
      }
      const msg = `iter ${iter} prograde ${hit.dV.toFixed(1)} m/s  CA ${fmtDist(hit.d)}`;
      flog.evt('MID-COURSE', msg);
      summary.retries.push(msg);
      burnDeltaV(hit.dV);
      enc = findEncounter(els(), session.st.t, horizon, 'duna');
    }

    if (!enc) {
      const hit = searchEncounterDV(horizon);
      if (hit) {
        const msg = `grid Δv pro ${hit.dPro} / rad ${hit.dRad} m/s → Duna Pe ${(hit.enc.periapsis / 1000).toFixed(0)} km`;
        console.log(`  ${msg}`);
        flog.evt('MID-COURSE', msg);
        summary.retries.push(msg);
        applyVectorBurn(hit.dPro, hit.dRad);
        enc = findEncounter(els(), session.st.t, horizon, 'duna');
      }
    }

    if (!enc) {
      const cb = closingBurn(horizon);
      if (cb?.applied) {
        const msg = `closing burn ${cb.used.toFixed(0)} m/s (miss was ${fmtDist(cb.ca.d)})`;
        console.log(`  ${msg}`);
        flog.evt('MID-COURSE', msg);
        summary.retries.push(msg);
        enc = findEncounter(els(), session.st.t, horizon, 'duna');
      }
    }

    if (enc) {
      flog.evt('ENCOUNTER', `Duna Pe ${(enc.periapsis / 1000).toFixed(0)} km  SOI in ${fmtTime(enc.tEnter - session.st.t)} (${((enc.tEnter - session.st.t) / 86400).toFixed(2)} d)`);
      console.log(`  predicted Duna Pe ${(enc.periapsis / 1000).toFixed(0)} km  tEnter T+${fmtTime(enc.tEnter)}`);
    } else {
      const miss = closestApproach('duna', xfer.tT * 1.8);
      flog.evt('ENCOUNTER', `No SOI predicted — closest ${fmtDist(miss.d)} at T+${fmtTime(miss.t)} (SOI ${fmtDist(DUNA.soi)})`);
      console.log(`  still no encounter; closest ${fmtDist(miss.d)} at t=${miss.t.toFixed(0)}`);
    }
  }

  // -----------------------------------------------------------------------
  // 5. Coast to Duna SOI + capture
  // -----------------------------------------------------------------------
  phase('COAST TO DUNA');
  {
    if (session.st.body !== 'duna') {
      const got = coastRails(xfer.tT * 2.2, () => session.st.body === 'duna', 120);
      if (!got && session.st.body !== 'duna') {
        // maybe we clipped Kerbin again
        if (session.st.body === 'kerbin' || session.st.body === 'mun' || session.st.body === 'minmus') {
          leaveMoonIfNeeded();
          if (session.st.body === 'kerbin') {
            burnUntil(() => els().a < 0 || session.st.body === 'kerbol', { maxS: 200 });
            coastRails(200_000, () => session.st.body === 'kerbol', 30);
          }
          if (session.st.body === 'kerbol') {
            const hit = searchEncounterDV(xfer.tT * 1.5);
            if (hit) applyVectorBurn(hit.dPro, hit.dRad);
            coastRails(xfer.tT * 2, () => session.st.body === 'duna', 120);
          }
        }
      }
    }

    if (session.st.body !== 'duna') {
      const miss = session.st.body === 'kerbol' ? closestApproach('duna', xfer.tT) : { d: NaN, t: session.st.t };
      throw new Error(`Failed to reach Duna SOI (body=${session.st.body}, closest ${fmtDist(miss.d)})`);
    }

    summary.dunaSoi = true;
    flog.evt('DUNA SOI', `Entered Duna / 火星 SOI — ${orbitText(els(), 'duna')}  fuel ${session.fuelLeft().toFixed(0)} kg`);
    snap('DUNA_SOI');
    flog.sample(true, 'Duna SOI');
    checkpoint('duna-soi');

    const el = els();
    const tPe = timeToPeriapsis(el, session.st.t);
    const peAlt = el.rp - DUNA.radius;
    console.log(`  Duna Pe in ${(tPe / 60).toFixed(1)} min, alt ${(peAlt / 1000).toFixed(0)} km  ${orbitText(el, 'duna')}`);
    if (Number.isFinite(tPe) && tPe > 20) {
      const lead = peAlt < 60_000 ? 90 : 12;
      coastRails(Math.max(0, tPe - lead), () => session.st.body !== 'duna', 15);
    }

    if (session.st.body !== 'duna') {
      throw new Error('Left Duna SOI before capture');
    }

    phase('DUNA CAPTURE');
    const fuelC0 = session.fuelLeft();
    burnUntil(() => {
      if (session.st.body !== 'duna') return true;
      const e = els();
      if (!(e.a > 0) || !Number.isFinite(e.ra)) return false;
      const peOk = e.rp > DUNA.radius + 50_000;
      return e.ra < DUNA.soi && peOk;
    }, { aim: 'retrograde', maxS: 280, dt: 0.12 });

    // if still hyperbolic / Ap outside SOI, keep burning
    if (session.st.body === 'duna') {
      const e = els();
      if (!(e.a > 0 && Number.isFinite(e.ra) && e.ra < DUNA.soi)) {
        burnUntil(() => {
          const ee = els();
          return ee.a > 0 && Number.isFinite(ee.ra) && ee.ra < DUNA.soi;
        }, { aim: 'retrograde', maxS: 200, dt: 0.12 });
      }
    }

    const e = els();
    const bound = e.a > 0 && Number.isFinite(e.ra) && e.ra < DUNA.soi;
    const txt = orbitText(e, 'duna');
    summary.dunaOrbit = bound ? txt : `NOT BOUND ${txt}`;
    summary.fuelEnd = session.fuelLeft();
    flog.evt('DOI / MOI', `Duna capture — ${txt}  Δfuel ${(fuelC0 - summary.fuelEnd).toFixed(0)} kg  fuel ${summary.fuelEnd.toFixed(0)} kg`);
    if (!bound) throw new Error(`Capture failed: ${txt}`);
    snap('DUNA_ORBIT');
    flog.sample(true, `Duna orbit ${txt}`);
    checkpoint('duna-orbit');
  }

  writeSummaryMd();
  const result = [
    summary.dunaSoi && summary.dunaOrbit ? `captured at Duna / 火星  ${summary.dunaOrbit}` : 'FAILED',
    summary.lko ? `LKO ${summary.lko}` : null,
    `fuel ${summary.fuelEnd?.toFixed(0) ?? '?'} kg`,
  ].filter(Boolean).join(' · ');
  flog.setResult(result);
  flog.write(LOG_PATH);
  console.log(`\nDUNA HOHMANN DONE — ${result}`);
  console.log(`  snapshots: ${summary.snapshots.join(', ')}`);
  console.log(`  retries: ${summary.retries.join(' | ') || '(none)'}`);
  console.log(`  log: ${LOG_PATH}`);
  process.exit(summary.dunaSoi && summary.dunaOrbit ? 0 : 1);
} catch (err) {
  console.error('\nDUNA HOHMANN FAILED:', err.message);
  console.error(err.stack);
  try {
    summary.fuelEnd = session.st ? session.fuelLeft() : summary.fuelEnd;
    writeSummaryMd();
    flog.setResult(`failed — ${err.message}`);
    flog.write(LOG_PATH);
  } catch { /* still exit */ }
  process.exit(1);
}
