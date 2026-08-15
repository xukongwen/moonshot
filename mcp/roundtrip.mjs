#!/usr/bin/env node
// Full Mun Express round-trip: Kerbin pad → LKO → TLI → Mun orbit
// (3 revs, no landing) → TKI → Kerbin reentry → chute landing.
// Reuses SimSession; ascent/TLI/MOI guidance copied from tests/mission.test.mjs.

import { Vector3 } from 'three';
import { SimSession } from './session.mjs';
import { FlightLog } from './flightlog.mjs';
import { BODIES, getBodyState, fmtTime, fmtDist } from '../src/constants.js';
import { computeSections } from '../src/vessel.js';
import {
  elementsFromState, timeToPeriapsis, timeToApoapsis, findMunEncounter, munTransferPhase,
} from '../src/orbits.js';

const Y = new Vector3(0, 1, 0);
const LOG_PATH = '/workspace/moonshot/ROUNDTRIP_LOG.md';
const KERBIN = BODIES.kerbin;
const MUN = BODIES.mun;

const session = new SimSession();
const flog = new FlightLog(session);
const YUP = Y;

function phase(title) {
  console.log(`\n== ${title} ==`);
}

function els() {
  const st = session.st;
  return elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
}

function pointVec(dir) {
  const st = session.st;
  const v = dir.clone();
  if (v.lengthSq() < 1e-12) v.copy(session.up());
  st.quat.setFromUnitVectors(YUP, v.normalize());
  st.angVel.set(0, 0, 0);
}

function handleEvents(tlm, { allowLand = false } = {}) {
  const evs = tlm?.events || [];
  for (const ev of evs) {
    if (ev.type === 'liftoff') flog.evt('LIFTOFF', 'Vehicle has cleared the pad');
    if (ev.type === 'overheat') {
      const name = ev.part || 'part';
      flog.evt('OVERHEAT', `${name} destroyed by heating`);
    }
    if (ev.type === 'soi') {
      const name = BODIES[ev.body]?.name ?? ev.body;
      flog.evt('SOI', `Entered ${name} sphere of influence`);
    }
    if (ev.type === 'landed') {
      flog.evt('TOUCHDOWN', `Contact at ${Number(ev.speed).toFixed(2)} m/s — ${BODIES[session.st.body].name}`);
    }
    if (ev.type === 'chute') flog.evt('CHUTES', 'Parachute deployed');
    if (ev.type === 'chute-torn') flog.evt('CHUTE TORN', 'Parachute ripped (too fast)');
    if (ev.type === 'crashed') {
      const msg = `CRASHED at ${Number(ev.speed).toFixed(1)} m/s, t=${session.st.t.toFixed(0)}s, alt=${session.alt().toFixed(0)}`;
      flog.evt('CRASH', msg);
      throw new Error(msg);
    }
  }
  if (session.st.dead && !allowLand) {
    throw new Error(`Vessel dead at t=${session.st.t.toFixed(0)}s alt=${session.alt().toFixed(0)}`);
  }
  flog.sample();
  return evs;
}

function doStage(reason = '') {
  const before = session.stageIdx;
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

/** session.coast is capped at 120 s — loop it. */
function coastLoop(maxSeconds, until = null) {
  const t0 = session.st.t;
  while (session.st.t - t0 < maxSeconds) {
    if (until && until()) return true;
    const remain = Math.min(120, maxSeconds - (session.st.t - t0));
    if (remain <= 1e-6) break;
    const tlm = session.coast(remain);
    handleEvents(tlm);
    if (session.st.dead) break;
  }
  return until ? !!until() : true;
}

function checkpoint(label) {
  flog.write(LOG_PATH);
  const t = session.telemetry();
  console.log(`  [checkpoint ${label}] MET ${fmtTime(t.t)}  ${t.body}  alt ${fmtDist(t.alt_m)}  v ${t.speed_ms.toFixed(0)} m/s  fuel ${t.fuel_kg.toFixed(0)} kg`);
}

function kerbinFrame() {
  const st = session.st;
  if (st.body === 'kerbin') {
    return { pos: st.pos.clone(), vel: st.vel.clone(), e: els() };
  }
  const mun = getBodyState('mun', st.t);
  const pos = st.pos.clone().add(mun.pos);
  const vel = st.vel.clone().add(mun.vel);
  return { pos, vel, e: elementsFromState(pos, vel, KERBIN.mu, st.t) };
}

function kerbinPeAlt() {
  return kerbinFrame().e.rp - KERBIN.radius;
}

function kerbinOutbound() {
  const { pos, vel } = kerbinFrame();
  return pos.dot(vel) > 0;
}

function facingKerbin() {
  const st = session.st;
  const mun = getBodyState('mun', st.t);
  // position relative to Mun dotted with Kerbin→Mun: negative = near / inside
  return st.pos.dot(mun.pos) < 0;
}

const PE_LO = 40_000;
const PE_HI = 45_000;
const PE_AIM = 43_000;

/** Bind around Kerbin and put Pe in 30–45 km. Outbound is fine — we coast to Pe after. */
function shapeKerbinPe() {
  for (let pass = 0; pass < 4; pass++) {
    if (session.st.body !== 'kerbin') return;
    const kf = kerbinFrame();
    const pe = kf.e.rp - KERBIN.radius;
    const bound = kf.e.a > 0;
    const escaping = !bound || !(kf.e.e < 1) || !Number.isFinite(kf.e.ra);
    if (bound && !escaping && pe >= PE_LO && pe <= PE_HI) return;

    const aim = (escaping || pe > PE_HI) ? 'retrograde' : (pe < PE_LO ? 'prograde' : null);
    if (!aim) return;
    const verb = aim === 'retrograde' ? 'lowering/recapturing' : 'raising';
    console.log(`  Pe-correct pass ${pass + 1}: ${verb} from ${(pe / 1000).toFixed(1)} km (bound=${bound})`);
    flog.evt('PE CORRECT', `${verb} Kerbin Pe from ${(pe / 1000).toFixed(1)} km`);

    session.setThrottle(1);
    for (let i = 0; i < 8_000; i++) {
      session.point(aim);
      const now0 = kerbinFrame();
      const close = Math.abs((now0.e.rp - KERBIN.radius) - PE_AIM) < 20_000;
      handleEvents(session.step(close ? 0.05 : 0.2));
      // Do not stage-jettison the transfer engine during this tweak.
      const now = kerbinFrame();
      const p = now.e.rp - KERBIN.radius;
      const b = now.e.a > 0;
      if (b && p >= PE_LO && p <= PE_HI) break;
      if (aim === 'retrograde' && b && p < PE_LO) break;
      if (aim === 'prograde' && b && p > PE_HI) break;
      if (session.fuelLeft() < 15) break;
    }
    session.setThrottle(0);
  }
}

/** Coast on rails to Kerbin periapsis. Handles a Mun SOI graze; never "wait for 70 km" while outbound. */
function coastToKerbinPeriapsis() {
  for (let attempt = 0; attempt < 8; attempt++) {
    if (session.st.body === 'mun') {
      const eMun = els();
      console.log(`  Mun SOI during return (a=${eMun.a.toFixed(0)}) — ${eMun.a > 0 ? 'recaptured, burning out' : 'flyby, coasting out'}`);
      if (eMun.a > 0) {
        session.setThrottle(1);
        for (let i = 0; i < 4_000; i++) {
          session.point('prograde');
          handleEvents(session.step(0.25));
          maybeStageDry();
          if (session.st.body === 'kerbin') break;
          if (els().a < 0) break;
        }
        session.setThrottle(0);
      }
      const left = coastLoop(25_000, () => session.st.body === 'kerbin');
      if (!left) throw new Error('Stuck in Mun SOI on the way home');
      shapeKerbinPe();
      continue;
    }

    const e = els();
    const pe = e.rp - KERBIN.radius;
    const bound = e.a > 0 && e.e < 1;
    if (!bound || pe > 68_000) {
      shapeKerbinPe();
      continue;
    }

    const inbound = session.st.pos.dot(session.st.vel) < 0;
    // Inbound with an atmospheric Pe: start reentry, even from 150 km.
    if (inbound && pe < 70_000 && session.alt() < 160_000) return;
    if (inbound && session.alt() < 90_000) return;

    const tPe = timeToPeriapsis(e, session.st.t);
    if (!Number.isFinite(tPe) || tPe > 1e8) {
      throw new Error('No upcoming Kerbin periapsis — cannot reenter');
    }
    console.log(`  coast to periapsis in ${(tPe / 60).toFixed(1)} min (orbit ${orbitText(e, 'kerbin')})`);

    // Stop ~2 min before Pe (still inbound, near the 70–90 km interface).
    // Fine steps in the last minutes so rails cannot jump past the atmosphere.
    const tGoal = session.st.t + Math.max(0, tPe - 120);
    while (session.st.t < tGoal) {
      if (session.st.body === 'mun') break;
      const inn = session.st.pos.dot(session.st.vel) < 0;
      if (inn && session.alt() < 90_000) return;
      const left = tGoal - session.st.t;
      const remain = Math.min(left > 400 ? 120 : left > 60 ? 15 : 4, left);
      if (remain <= 1e-6) break;
      handleEvents(session.coast(remain));
    }
    if (session.st.body === 'mun') continue;
    const inbound2 = session.st.pos.dot(session.st.vel) < 0;
    const pe2 = els().rp - KERBIN.radius;
    if (inbound2 && pe2 < 70_000 && session.alt() < 200_000) return;
    if (session.alt() < 100_000) return;

    // Near predicted Pe but still high — Mun (or a bad tPe) threw us. Retry.
    console.log(`  after Pe coast: alt ${fmtDist(session.alt())} v=${session.st.vel.length().toFixed(0)} — retry ${attempt + 1}`);
    if (pe2 > 68_000 || !(els().a > 0)) shapeKerbinPe();
  }
}

function burnSeconds(seconds, aim = 'prograde', afterStep = null) {
  const tEnd = session.st.t + seconds;
  session.setThrottle(1);
  while (session.st.t < tEnd && !session.st.dead) {
    if (aim === 'prograde') session.point('prograde');
    else if (aim === 'retrograde') session.point('retrograde');
    const dt = Math.min(0.25, tEnd - session.st.t);
    const tlm = session.step(dt);
    handleEvents(tlm);
    maybeStageDry();
    if (afterStep && afterStep()) break;
  }
  session.setThrottle(0);
}

// ---------------------------------------------------------------------------
// Mission
// ---------------------------------------------------------------------------
let impactSpeed = null;
let success = false;

try {
  phase('PRELAUNCH');
  session.newFlight('Mun Express');
  const t0 = session.telemetry();
  flog.evt('PRELAUNCH', `Mun Express on the pad — liftoff mass ${t0.mass_t.toFixed(2)} t, ${t0.stages.length} stages`);
  flog.snapshot('PRELAUNCH');
  flog.sample(true, 'pad');
  checkpoint('prelaunch');

  // -------------------------------------------------------------------------
  // 1. ASCENT (guidance from tests/mission.test.mjs)
  // -------------------------------------------------------------------------
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
    const tlm = session.step(0.25);
    handleEvents(tlm);
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
    flog.snapshot('MECO_ORBIT');
    console.log(`  orbit ${txt} at t=${session.st.t.toFixed(0)}s, fuel ${session.fuelLeft().toFixed(0)} kg`);
    flog.sample(true, 'LKO');
    checkpoint('orbit');
  }

  // drop the launch stage if it's dry, light the sparrow for the trip
  {
    const st = session.st;
    const spentTanks = !st.parts.some((p) => p.def.fuel && !p.def.engine && p.fuel > 0.5 &&
      computeSections(st.parts).get(p.stackIndex) === 0);
    const falcon = st.parts.find((p) => p.def.name.includes('Falcon'));
    if (falcon && spentTanks) doStage('drop launch stage');
  }

  // -------------------------------------------------------------------------
  // 2. Wait for transfer window, TLI
  // -------------------------------------------------------------------------
  phase('TRANSFER WINDOW');
  {
    const target = munTransferPhase(session.st.pos.length());
    const phaseNow = () => session.munPhaseDeg();
    const ok = coastLoop(4 * 32_000, () => Math.abs(phaseNow() - target) < 0.8);
    if (!ok) throw new Error(`Missed transfer window (phase=${phaseNow().toFixed(1)} target=${target.toFixed(1)})`);
    flog.evt('XFER WINDOW', `Mun phase angle ${phaseNow().toFixed(1)}° (target ${target.toFixed(1)}°) — TLI burn start`);
    console.log(`  transfer burn at phase ${phaseNow().toFixed(1)}° (target ${target.toFixed(1)}°), t=${(session.st.t / 3600).toFixed(2)} h`);
    checkpoint('xfer-window');
  }

  phase('TLI');
  {
    session.setThrottle(1);
    let enc = null;
    for (let i = 0; i < 12_000; i++) {
      session.point('prograde');
      const tlm = session.step(0.25);
      handleEvents(tlm);
      maybeStageDry();
      const e = els();
      if (e.ra > MUN.orbitRadius - MUN.soi * 0.6) {
        session.setThrottle(0);
        enc = findMunEncounter(e, session.st.t, e.period ?? 90_000);
        if (enc) break;
        session.setThrottle(1);
        for (let j = 0; j < 15; j++) {
          session.point('prograde');
          handleEvents(session.step(0.2));
        }
        session.setThrottle(0);
        enc = findMunEncounter(els(), session.st.t, els().period ?? 90_000);
        break;
      }
    }
    session.setThrottle(0);
    if (!enc) throw new Error('No Mun encounter after TLI');
    flog.evt('TLI CUTOFF', `Trans-Munar injection complete — predicted Mun periapsis ${(enc.munPeriapsis / 1000).toFixed(0)} km`);
    flog.snapshot('TLI_CUTOFF');
    console.log(`  predicted Mun periapsis ${(enc.munPeriapsis / 1000).toFixed(0)} km, fuel ${session.fuelLeft().toFixed(0)} kg`);
    flog.sample(true, 'TLI cutoff');
    checkpoint('tli');
  }

  // -------------------------------------------------------------------------
  // 3. Coast to Mun SOI, capture (no landing)
  // -------------------------------------------------------------------------
  phase('COAST TO MUN');
  {
    const got = coastLoop(90_000, () => session.st.body === 'mun');
    if (!got) throw new Error('Did not reach Mun SOI');
    console.log(`  entered Mun SOI at t=${(session.st.t / 3600).toFixed(2)} h`);
    flog.snapshot('MUN_SOI');
    flog.sample(true, 'Mun SOI');
    checkpoint('mun-soi');
  }

  phase('MOI');
  {
    const el = els();
    const tPe = timeToPeriapsis(el, session.st.t);
    console.log(`  Mun periapsis in ${(tPe / 60).toFixed(1)} min, alt ${((el.rp - MUN.radius) / 1000).toFixed(0)} km`);
    coastLoop(Math.max(0, tPe - 20));

    // Capture burn at periapsis — same cutoff as the mission test:
    // bound (a>0) and the low point under ~32 km (far side dropped).
    session.setThrottle(1);
    for (let i = 0; i < 16_000; i++) {
      session.point('retrograde');
      const tlm = session.step(0.25);
      handleEvents(tlm);
      maybeStageDry();
      const e = els();
      if (e.a > 0 && e.rp - MUN.radius < 32_000) break;
      if (session.alt() < 25_000) break;
    }
    session.setThrottle(0);

    const e = els();
    if (!(e.a > 0 && e.ra < MUN.soi)) {
      throw new Error(`MOI failed: a=${e.a.toFixed(0)} ra=${e.ra.toFixed(0)}`);
    }
    const txt = orbitText(e, 'mun');
    flog.evt('MOI', `Mun orbit insertion — ${txt}`);
    flog.snapshot('MOI');
    console.log(`  captured ${txt}, fuel ${session.fuelLeft().toFixed(0)} kg, period ${((e.period || 0) / 60).toFixed(1)} min`);
    flog.sample(true, `Mun orbit ${txt}`);
    checkpoint('moi');
  }

  // -------------------------------------------------------------------------
  // 4. Coast 3 full Mun orbits
  // -------------------------------------------------------------------------
  phase('THREE MUN ORBITS');
  {
    const e0 = els();
    let period = e0.period;
    if (!period || !Number.isFinite(period) || period <= 0) {
      // fall back: time between successive periapses
      const tPe = timeToPeriapsis(e0, session.st.t);
      coastLoop(Math.max(30, tPe + 5));
      const tPe2 = timeToPeriapsis(els(), session.st.t);
      period = tPe2 > 10 ? tPe2 : 6_000;
      console.log(`  period estimated from periapses: ${(period / 60).toFixed(1)} min`);
    }
    const peAp = orbitText(e0, 'mun');
    flog.evt('MUN ORBIT', `Bound Mun orbit ${peAp}, period ${(period / 60).toFixed(1)} min — beginning 3 revs`);
    const tStart = session.st.t;
    for (let n = 1; n <= 3; n++) {
      const tTarget = tStart + n * period;
      coastLoop(Math.max(0, tTarget - session.st.t + 2), () => session.st.t >= tTarget);
      const e = els();
      flog.evt(`MUN ORBIT ${n}`, `Completed orbit ${n}/3 — ${orbitText(e, 'mun')}`);
      if (n === 3) flog.snapshot('MUN_ORBIT_3');
      console.log(`  orbit ${n}/3 complete at MET ${fmtTime(session.st.t)}`);
      flog.sample(true, `Mun rev ${n}`);
      checkpoint(`mun-orbit-${n}`);
    }
  }

  // -------------------------------------------------------------------------
  // 5. Home burn (TKI) — prograde on the Kerbin-facing side
  // -------------------------------------------------------------------------
  phase('TKI / HOME BURN');
  {
    // Wait until the vessel is on the near / Kerbin-facing side of Mun orbit
    const gotInside = coastLoop(els().period ? els().period * 1.2 : 20_000, () => facingKerbin());
    if (!gotInside) console.log('  warning: starting TKI without a clean inside-side alignment');
    const mun0 = getBodyState('mun', session.st.t);
    const side = session.st.pos.dot(mun0.pos);
    flog.evt('TKI START', `Prograde burn on Kerbin-facing side (r·R_mun=${side.toExponential(2)})`);
    flog.sample(true, 'TKI start');

    // Burn only until the Mun orbit is hyperbolic — do NOT keep burning
    // against a patched-conic Kerbin Pe while still deep in the SOI.
    const tBurn0 = session.st.t;
    session.setThrottle(1);
    for (let i = 0; i < 4_000; i++) {
      session.point('prograde');
      handleEvents(session.step(0.25));
      maybeStageDry();
      if (session.st.body === 'kerbin') break;
      const eMun = els();
      if (eMun.a < 0) break; // just barely escaped Mun
      if (session.fuelLeft() < 40) break;
      if (session.st.t - tBurn0 > 45) break;
    }
    session.setThrottle(0);

    if (session.st.body === 'mun') {
      console.log(`  Mun orbit now ${orbitText(els(), 'mun')} — coasting out of SOI`);
      const left = coastLoop(25_000, () => session.st.body === 'kerbin');
      if (!left) throw new Error('Failed to leave Mun SOI after TKI');
    }

    {
      const kf = kerbinFrame();
      const pe = kf.e.rp - KERBIN.radius;
      const outb = kf.pos.dot(kf.vel) > 0;
      console.log(`  left Mun SOI, Kerbin ${orbitText(kf.e, 'kerbin')}  outbound=${outb}  v=${kf.vel.length().toFixed(0)}  fuel ${session.fuelLeft().toFixed(0)} kg`);
      flog.evt('TKI CUTOFF', `Escaped Mun SOI — Kerbin ${orbitText(kf.e, 'kerbin')}${outb ? ' (outbound)' : ' (inbound)'}`);
      flog.snapshot('TKI_CUTOFF');
      flog.sample(true, 'TKI cutoff');
      checkpoint('tki');
    }

    // Bind + put Pe in 30–45 km. Do NOT keep burning just because we are outbound.
    shapeKerbinPe();

    const kf = kerbinFrame();
    const pe = kf.e.rp - KERBIN.radius;
    const outbound = kf.pos.dot(kf.vel) > 0;
    flog.evt('RETURN COAST', `Kerbin return ${orbitText(kf.e, 'kerbin')} (Pe ${(pe / 1000).toFixed(1)} km${outbound ? ', outbound — will coast to periapsis' : ''})`);
    console.log(`  return orbit ${orbitText(kf.e, 'kerbin')}, fuel ${session.fuelLeft().toFixed(0)} kg, outbound=${outbound}`);
    if (!(kf.e.a > 0) || kf.e.e >= 1) {
      throw new Error(`Kerbin trajectory still escaping after Pe correction (Pe ${(pe / 1000).toFixed(1)} km)`);
    }
    if (pe > 68_000) {
      throw new Error(`Kerbin Pe ${(pe / 1000).toFixed(1)} km is above the atmosphere — will not reenter`);
    }
    if (pe < 12_000) {
      console.log('  warning: very steep Pe, heating will be harsh');
    }
    flog.sample(true, 'return coast');
    checkpoint('return-pe');
  }

  // -------------------------------------------------------------------------
  // 6. Coast to atmosphere, arm chutes, land
  // -------------------------------------------------------------------------
  phase('COAST TO KERBIN');
  {
    // Keep the Sparrow: we need its TWR if the chute cooks on the first pass.
    coastToKerbinPeriapsis();
    if (session.alt() > 120_000) {
      throw new Error(`Still at ${fmtDist(session.alt())} — missed the atmosphere`);
    }
    console.log(`  approaching atmosphere: alt ${(session.alt() / 1000).toFixed(1)} km, v ${session.st.vel.length().toFixed(0)} m/s`);
    flog.sample(true, 'atmo approach');
    checkpoint('atmo-approach');
  }

  phase('REENTRY');
  {
    session.setThrottle(0);
    session.point('retrograde'); // engine-first; keep the chute in the lee
    const armed = session.armChutes();
    flog.evt('CHUTES ARMED', `Armed ${armed.parts} parachute(s) — retrograde reentry`);
    session.setLegs(true);

    let landed = false;
    for (let pass = 1; pass <= 20 && !landed && !session.st.dead; pass++) {
      const outbound0 = session.st.pos.dot(session.st.vel) > 0;
      if (session.alt() > 80_000 || outbound0) coastToKerbinPeriapsis();
      flog.evt('REENTRY', `Atmospheric pass ${pass} — alt ${fmtDist(session.alt())}, v ${session.st.vel.length().toFixed(0)} m/s`);
      console.log(`  atmo pass ${pass}: alt ${(session.alt() / 1000).toFixed(1)} km  v ${session.st.vel.length().toFixed(0)} m/s`);

      let dipped = false;
      for (let i = 0; i < 20_000 && !session.st.dead; i++) {
        const alt = session.alt();
        const speed = session.st.vel.length();
        const outbound = session.st.pos.dot(session.st.vel) > 0;
        if (alt < KERBIN.atmoHeight) dipped = true;
        if (dipped && outbound && alt > KERBIN.atmoHeight + 2_000) {
          const e = els();
          flog.evt('SKIP OUT', `Pass ${pass} skipped out at ${fmtDist(alt)}, ${speed.toFixed(0)} m/s — ${orbitText(e, 'kerbin')}`);
          console.log(`  skip-out: alt ${fmtDist(alt)} v=${speed.toFixed(0)} now ${orbitText(e, 'kerbin')}`);
          const chuteOk = session.st.parts.some((p) => p.alive && p.def.chute);
          if (chuteOk && e.a > 0 && e.ra - KERBIN.radius < 150_000) {
            // Trap the orbit inside the atmosphere (Ap < 68 km) and let drag spiral us down.
            session.setThrottle(1);
            for (let j = 0; j < 4_000; j++) {
              session.point('retrograde');
              handleEvents(session.step(0.1));
              const e2 = els();
              if (!(e2.a > 0)) break;
              if (e2.ra - KERBIN.radius < 68_000) break;
              if (e2.rp - KERBIN.radius < 35_000) break;
              if (session.fuelLeft() < 40) break;
            }
            session.setThrottle(0);
            console.log(`  trapped in atmo: ${orbitText(els(), 'kerbin')}, fuel ${session.fuelLeft().toFixed(0)} kg`);
          } else if (chuteOk && e.a > 0) {
            if (e.rp - KERBIN.radius < 50_000) {
              const tAp = timeToApoapsis(els(), session.st.t);
              if (Number.isFinite(tAp) && tAp > 20 && tAp < 1e7) {
                console.log(`  coast to Ap in ${(tAp / 60).toFixed(1)} min to raise Pe`);
                coastLoop(Math.max(0, tAp - 8));
              }
              session.setThrottle(1);
              for (let j = 0; j < 3_000; j++) {
                session.point('prograde');
                handleEvents(session.step(0.1));
                if (els().rp - KERBIN.radius >= 50_000) break;
                if (session.fuelLeft() < 80) break;
              }
              session.setThrottle(0);
              console.log(`  raised Pe: ${orbitText(els(), 'kerbin')}`);
            } else if (e.ra - KERBIN.radius > 400_000) {
              session.setThrottle(1);
              for (let j = 0; j < 4_000; j++) {
                session.point('retrograde');
                handleEvents(session.step(0.15));
                const e2 = els();
                if (!(e2.a > 0)) break;
                if (e2.ra - KERBIN.radius < 400_000) break;
                if (e2.rp - KERBIN.radius < 48_000) break;
                if (session.fuelLeft() < 80) break;
              }
              session.setThrottle(0);
              console.log(`  dumped Ap: ${orbitText(els(), 'kerbin')}`);
            }
          }
          break;
        }

        const chuteAlive = session.st.parts.some((p) => p.alive && p.def.chute);
        if (!chuteAlive && alt < 15_000 && session.fuelLeft() > 5) {
          // Suicide-burn law (same idea as the Mun landing test): only burn
          // if we could not still stop before the ground.
          const st = session.st;
          const r = st.pos.length();
          const g = KERBIN.mu / (r * r);
          const mp = st.massProps;
          const maxThrust = st.parts
            .filter((p) => p.alive && p.ignited && p.def.engine)
            .reduce((s, p) => s + (p.def.engine.thrustVac * p.sym), 0) || 0;
          const maxAcc = maxThrust / Math.max(1, mp.m);
          // SL thrust is far below vac — be conservative so we don't dump fuel at 7 km.
          const brake = Math.max(0.2, 0.35 * Math.max(0, maxAcc - g));
          const vAllow = Math.sqrt(Math.max(0, 2 * brake * Math.max(0, alt - 12))) + 5;
          if (speed > vAllow) {
            session.point(speed > 60 ? 'retrograde' : 'up');
            session.setThrottle(1);
          } else {
            session.setThrottle(0);
            if (alt < 800) session.point('up');
          }
        } else if (speed > 300) {
          session.point('retrograde');
          session.setThrottle(0);
        } else if (alt < 8_000) {
          session.point('up');
          session.setThrottle(0);
        } else {
          session.setThrottle(0);
        }

        const tlm = session.step(alt < 15_000 ? 0.2 : 0.5);
        const evs = handleEvents(tlm, { allowLand: true });
        if (evs.some((e) => e.type === 'landed') || session.st.landed) {
          landed = true;
          impactSpeed = evs.find((e) => e.type === 'landed')?.speed ?? 0;
          break;
        }
        if (session.st.body !== 'kerbin') {
          throw new Error(`Left Kerbin during reentry (body=${session.st.body})`);
        }
        if (i % 40 === 0) {
          console.log(`  reentry t=${session.st.t.toFixed(0)}s alt=${(alt / 1000).toFixed(1)}km v=${speed.toFixed(0)} fuel=${session.fuelLeft().toFixed(0)}`);
        }
      }
      session.setThrottle(0);
    }

    if (!landed) throw new Error('Did not reach the surface');
    const podAlive = session.st.parts.some((p) => p.alive && p.def.pod);
    if (!podAlive) throw new Error('Pod destroyed');
    if (session.st.body !== 'kerbin') throw new Error(`Landed on ${session.st.body}, not Kerbin`);

    const fuel = session.fuelLeft();
    const met = session.st.t;
    const imp = Number(impactSpeed ?? 0);
    const soft = imp < 12;
    success = true;
    const result = `landed on Kerbin at ${imp.toFixed(2)} m/s, fuel ${fuel.toFixed(0)} kg, MET ${fmtTime(met)}${soft ? '' : ' (hard)'}`;
    flog.evt('MISSION END', `Kerbin. Pod intact, impact ${imp.toFixed(2)} m/s, ${fuel.toFixed(0)} kg fuel remaining.`);
    flog.snapshot('LANDING');
    flog.setResult(`🌍 mission complete — ${result}`);
    flog.sample(true, 'landed');
    checkpoint('landed');
    console.log(`\n🌍 LANDED ON KERBIN  impact ${imp.toFixed(2)} m/s  fuel ${fuel.toFixed(0)} kg  MET ${fmtTime(met)}`);
  }
} catch (err) {
  success = false;
  flog.setResult(`failed — ${err.message}`);
  try { flog.evt('ABORT', err.message); flog.snapshot('ABORT'); } catch { /* telemetry may be dead */ }
  console.error(`\nMISSION FAILED: ${err.message}`);
  if (err.stack) console.error(err.stack);
} finally {
  const path = flog.write(LOG_PATH);
  const nEvt = flog.entries.filter((e) => e.kind === 'evt').length;
  const nTlm = flog.entries.filter((e) => e.kind === 'tlm').length;
  console.log(`\nflight log written: ${path} (${nEvt} events, ${nTlm} telemetry rows)`);
  console.log(`jsonl: ${flog.jsonlPath}`);
}

process.exit(success ? 0 : 1);
