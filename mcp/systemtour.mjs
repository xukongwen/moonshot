#!/usr/bin/env node
// Kerbol system tour: pad → LKO (Mun + Minmus on the map) → Minmus try
// → escape Kerbin SOI → solar orbit around Kerbol (Duna in the tree).
// Reuses SimSession + the proven ascent from tests/mission.test.mjs / mcp/roundtrip.mjs.

import { readdirSync, unlinkSync, existsSync } from 'node:fs';
import { Vector3 } from 'three';
import { SimSession } from './session.mjs';
import { FlightLog } from './flightlog.mjs';
import { BODIES, getBodyState, getRelativeState, fmtTime, fmtDist } from '../src/constants.js';
import { computeSections } from '../src/vessel.js';
import {
  elementsFromState, propagate, timeToPeriapsis, timeToApoapsis,
  findEncounter, transferPhase,
} from '../src/orbits.js';

const Y = new Vector3(0, 1, 0);
const LOG_PATH = '/workspace/moonshot/SYSTEM_LOG.md';
const SNAP_DIR = '/workspace/moonshot/logs/snapshots';
const KERBIN = BODIES.kerbin;
const MINMUS = BODIES.minmus;
const MUN = BODIES.mun;

const SYSTEM_CAPTIONS = {
  '01-pad': 'Pad / prelaunch — Mun Express on the Kerbin pad',
  '02-lko': 'LKO after MECO — stable Kerbin orbit',
  '02-lko-map': 'LKO map — Kerbin with Mun and Minmus',
  '03-minmus-soi': 'Minmus SOI / approaching Minmus',
  '03-minmus-soi-map': 'Minmus SOI map',
  '04-minmus-orbit': 'Minmus orbit after MOI',
  '04-minmus-orbit-map': 'Minmus orbit map',
  '05-escape': 'Escape burn — leaving Kerbin SOI',
  '05-escape-map': 'Escape burn map — Kerbin system (Mun + Minmus)',
  '06-soi-exit': 'Kerbin SOI exit — now orbiting Kerbol',
  '06-soi-exit-map': 'Kerbin SOI exit map — solar frame',
  '07-solar': 'Solar orbit around Kerbol',
  '07-solar-map': 'Solar map — Kerbol, Kerbin, Duna',
};

const FLOG_OPTS = {
  craft: 'Mun Express',
  pilot: 'autopilot (`mcp/systemtour.mjs`)',
  title: 'MOONSHOT — Kerbol System Tour',
  mdPath: LOG_PATH,
  captions: SYSTEM_CAPTIONS,
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

// Fresh snapshots for this tour (old Mun tags remain optional skips in shots.mjs).
if (existsSync(SNAP_DIR)) {
  for (const f of readdirSync(SNAP_DIR)) {
    if (f.endsWith('.json')) unlinkSync(`${SNAP_DIR}/${f}`);
  }
}

const summary = {
  lko: null,
  minmusSoi: false,
  minmusOrbit: null,
  kerbolSoi: false,
  solar: null,
  fuelEnd: null,
  snapshots: [],
};

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
      const name = BODIES[ev.body]?.name ?? ev.body;
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

function snap(tag) {
  flog.snapshot(tag);
  summary.snapshots.push(tag);
}

function checkpoint(label) {
  flog.write(LOG_PATH);
  const t = session.telemetry();
  console.log(`  [checkpoint ${label}] MET ${fmtTime(t.t)}  ${t.body}  alt ${fmtDist(t.alt_m)}  v ${t.speed_ms.toFixed(0)} m/s  fuel ${t.fuel_kg.toFixed(0)} kg`);
}

function childPhaseDeg(childName) {
  const st = session.st;
  const child = getBodyState(childName, st.t).pos;
  const frame = getRelativeState(st.body, 'kerbin', st.t);
  const vessel = st.pos.clone().add(frame.pos);
  const rv = vessel.normalize();
  const rm = child.clone().normalize();
  const cr = new Vector3().crossVectors(rv, rm);
  let a = Math.atan2(cr.y, rv.dot(rm)) * 180 / Math.PI;
  if (a < 0) a += 360;
  return a;
}

function hohmannTT(r1, r2, mu = KERBIN.mu) {
  const aT = (r1 + r2) / 2;
  return Math.PI * Math.sqrt(aT ** 3 / mu);
}

/** Next Minmus equatorial crossing (y≈0) at or after tMin. LAN is the X axis. */
function nextMinmusNode(tMin) {
  const w = MINMUS.omega;
  const p0 = MINMUS.phase0;
  const n = Math.ceil((p0 + w * tMin) / Math.PI - 1e-12);
  const t = (n * Math.PI - p0) / w;
  const th = p0 + w * t;
  const sign = Math.cos(th) >= 0 ? 1 : -1;
  return { t, sign, th, n };
}

/** Angle (deg) from the point opposite the upcoming Minmus node (±X). */
function angleFromOpposite(sign) {
  const r = session.st.pos.clone().normalize();
  const target = new Vector3(-sign, 0, 0); // opposite the node
  return Math.acos(Math.min(1, Math.max(-1, r.dot(target)))) * 180 / Math.PI;
}

function vesselOppositeNode(sign) {
  // Start ~7° early so the ~12° TLI burn is centered on the node.
  return angleFromOpposite(sign) < 7;
}

function closestApproach(childName, horizon) {
  const el = els();
  const t0 = session.st.t;
  let best = { d: Infinity, t: t0 };
  const steps = 800;
  const dt = horizon / steps;
  for (let i = 0; i <= steps; i++) {
    const tt = t0 + i * dt;
    const { pos } = propagate(el, tt);
    const d = pos.distanceTo(getBodyState(childName, tt).pos);
    if (d < best.d) best = { d, t: tt };
  }
  return best;
}

function burnUntil(pred, { aim = 'prograde', maxS = 400, dt = 0.25 } = {}) {
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

function leaveMoonIfNeeded() {
  if (session.st.body !== 'mun' && session.st.body !== 'minmus') return;
  const moon = session.st.body;
  const b = BODIES[moon];
  flog.evt('MOON ESCAPE', `Leaving ${b.name} SOI`);
  const e0 = els();
  if (!(e0.a < 0) || e0.rp < b.radius + 15_000) {
    burnUntil(() => {
      if (session.st.body !== moon) return true;
      const e = els();
      return e.a < 0;
    }, { aim: 'prograde', maxS: 240, dt: 0.15 });
  }
  if (session.st.body !== moon) return;
  // Prefer physics steps if periapsis is low — rails refuse near terrain.
  const e1 = els();
  if (e1.rp < b.radius + 25_000) {
    const tEnd = session.st.t + 40_000;
    while (session.st.t < tEnd && session.st.body === moon && !session.st.dead) {
      handleEvents(session.step(1));
    }
  } else {
    coastLoop(80_000, () => session.st.body === 'kerbin' || session.st.body === 'kerbol');
  }
  if (session.st.body === moon) throw new Error(`Stuck in ${moon} SOI`);
}

function writeSummaryMd() {
  const rows = [];
  rows.push('## Key orbits');
  rows.push('');
  if (summary.lko) rows.push(`- **LKO:** ${summary.lko}`);
  rows.push(`- **Minmus SOI:** ${summary.minmusSoi ? 'reached' : 'not reached (logged miss, continued)'}`);
  if (summary.minmusOrbit) rows.push(`- **Minmus orbit:** ${summary.minmusOrbit}`);
  rows.push(`- **Kerbol SOI:** ${summary.kerbolSoi ? 'reached' : 'NOT reached'}`);
  if (summary.solar) rows.push(`- **Solar orbit (Kerbol-centric):** ${summary.solar}`);
  if (summary.fuelEnd != null) rows.push(`- **Fuel remaining:** ${summary.fuelEnd.toFixed(0)} kg`);
  rows.push(`- **Snapshots:** ${summary.snapshots.join(', ') || '(none)'}`);
  rows.push('');
  flog.setExtraMarkdown(rows.join('\n'));
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
  // 1. ASCENT (guidance from tests/mission.test.mjs / mcp/roundtrip.mjs)
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
  // 2. Minmus intercept (try hard, don't die on it)
  // -----------------------------------------------------------------------
  phase('MINMUS TRANSFER');
  {
    const r = session.st.pos.length();
    const tT = hohmannTT(r, MINMUS.orbitRadius);
    const targetPhase = transferPhase(r, 'minmus');
    const searchDeadline = session.st.t + 2e5;
    let attempts = 0;
    let got = false;

    console.log(`  Hohmann tT=${(tT / 3600).toFixed(2)} h  target phase=${targetPhase.toFixed(1)}°  Minmus P=${((2 * Math.PI / MINMUS.omega) / 3600).toFixed(1)} h`);

    while (attempts < 3 && session.st.t < searchDeadline && !got && session.st.body === 'kerbin') {
      attempts++;
      const node = nextMinmusNode(session.st.t + 0.85 * tT);
      const burnAt = node.t - tT;
      const wait = Math.max(0, burnAt - session.st.t - 200);
      flog.evt('MINMUS XFER', `Attempt ${attempts}: node T_arr=${fmtTime(node.t)} (sign=${node.sign > 0 ? '+X' : '−X'}), burn in ${(Math.max(0, burnAt - session.st.t) / 3600).toFixed(2)} h`);
      console.log(`  attempt ${attempts}: T_arr=${node.t.toFixed(0)}s burnAt=${burnAt.toFixed(0)}s wait=${(wait / 3600).toFixed(2)}h`);

      if (wait > 0) coastLoop(wait, () => session.st.body !== 'kerbin');
      if (session.st.body !== 'kerbin') {
        if (session.st.body === 'minmus') { got = true; break; }
        leaveMoonIfNeeded();
        continue;
      }

      // Arrive a bit before the Hohmann epoch so the burn is centered on the node.
      coastLoop(Math.max(0, burnAt - session.st.t - 70), () => session.st.t >= burnAt - 90);
      coastLoop(2_400, () => vesselOppositeNode(node.sign) || session.st.body !== 'kerbin');

      const phaseNow = childPhaseDeg('minmus');
      const ttn = node.t - session.st.t;
      console.log(`  burn start: phase=${phaseNow.toFixed(1)}° (tgt ${targetPhase.toFixed(1)}°)  ttn=${(ttn / 60).toFixed(1)} min  angOpp=${angleFromOpposite(node.sign).toFixed(1)}°`);

      let enc = null;
      const apTarget = MINMUS.orbitRadius + 800_000; // ~47.8 Mm radius
      session.setThrottle(1);
      for (let i = 0; i < 16_000; i++) {
        session.point('prograde');
        handleEvents(session.step(0.2));
        maybeStageDry();
        if (session.st.body !== 'kerbin') break;
        const e = els();
        const ra = Number.isFinite(e.ra) ? e.ra : Infinity;
        if (ra > 12_000_000 || e.a < 0) {
          enc = findEncounter(e, session.st.t, Math.min(e.period ?? 400_000, 400_000), 'minmus');
          if (enc) break;
        }
        if (ra > apTarget) break;
        if (session.fuelLeft() < 80) break;
      }
      session.setThrottle(0);

      if (session.st.body === 'minmus') { got = true; break; }

      if (!enc) {
        const eBurn = els();
        const miss = closestApproach('minmus', Math.min(eBurn.period ?? 400_000, 400_000));
        console.log(`  after Hohmann ${orbitText(eBurn, 'kerbin')}: closest ${fmtDist(miss.d)} at T+${fmtTime(miss.t)}`);
        // Mid-course: coast most of the way to CA, then burn toward Minmus to close the miss.
        if (miss.d < 15e6 && miss.t - session.st.t > 600) {
          const lead = Math.min(8_000, (miss.t - session.st.t) * 0.15);
          coastLoop(Math.max(0, miss.t - session.st.t - lead), () => session.st.body !== 'kerbin');
          if (session.st.body === 'kerbin') {
            const tgt = getBodyState('minmus', session.st.t).pos;
            const rel = tgt.clone().sub(session.st.pos);
            flog.evt('MINMUS XFER', `Mid-course toward Minmus (miss ${fmtDist(miss.d)})`);
            session.setThrottle(1);
            for (let i = 0; i < 2_000; i++) {
              const now = getBodyState('minmus', session.st.t).pos.clone().sub(session.st.pos);
              pointVec(now);
              handleEvents(session.step(0.2));
              maybeStageDry();
              enc = findEncounter(els(), session.st.t, 400_000, 'minmus');
              if (enc || session.st.body === 'minmus') break;
              if (now.length() < MINMUS.soi * 1.05) break;
              if (session.fuelLeft() < 80) break;
            }
            session.setThrottle(0);
          }
        }
      }

      if (session.st.body === 'minmus') { got = true; break; }

      const eBurn = els();
      if (enc) {
        flog.evt('MINMUS XFER', `Encounter predicted — Minmus Pe ${(enc.periapsis / 1000).toFixed(0)} km, enter T+${fmtTime(enc.tEnter)}`);
        console.log(`  predicted Minmus Pe ${(enc.periapsis / 1000).toFixed(0)} km`);
      } else {
        const miss = closestApproach('minmus', Math.min(eBurn.period ?? 400_000, 400_000));
        flog.evt('MINMUS MISS', `No encounter after burn (Ap ${orbitText(eBurn, 'kerbin')}); closest ${fmtDist(miss.d)} at T+${fmtTime(miss.t)} (SOI ${fmtDist(MINMUS.soi)})`);
        console.log(`  no encounter; closest ${fmtDist(miss.d)} at t=${miss.t.toFixed(0)} (SOI ${fmtDist(MINMUS.soi)})`);
      }

      const hit = coastLoop(3 * 86_400, () => session.st.body === 'minmus' || session.st.body === 'kerbol');
      if (session.st.body === 'minmus') { got = true; break; }
      if (session.st.body === 'mun') {
        flog.evt('MUN GRAZE', 'Entered Mun SOI on the Minmus coast — burning out');
        leaveMoonIfNeeded();
      }
      if (session.st.body === 'kerbol') break;
      if (!hit) {
        const miss = closestApproach('minmus', 200_000);
        flog.evt('MINMUS MISS', `Coast timeout; closest ${fmtDist(miss.d)} at T+${fmtTime(miss.t)}`);
      }
    }

    if (session.st.body === 'minmus') {
      summary.minmusSoi = true;
      flog.evt('MINMUS SOI', `Entered Minmus SOI at T+${fmtTime(session.st.t)}`);
      snap('MINMUS_SOI');
      flog.sample(true, 'Minmus SOI');
      checkpoint('minmus-soi');

      const el = els();
      const tPe = timeToPeriapsis(el, session.st.t);
      console.log(`  Minmus Pe in ${(tPe / 60).toFixed(1)} min, alt ${((el.rp - MINMUS.radius) / 1000).toFixed(0)} km`);
      if (Number.isFinite(tPe) && tPe > 15) coastLoop(Math.max(0, tPe - 12));

      if (session.st.body === 'minmus' && session.fuelLeft() > 80) {
        const ePe = els();
        const peAlt = ePe.rp - MINMUS.radius;
        // High-Pe flyby: only a gentle capture (stop at first bound orbit).
        if (peAlt > 12_000) {
          session.setThrottle(1);
          for (let i = 0; i < 8_000; i++) {
            session.point('retrograde');
            handleEvents(session.step(0.15));
            maybeStageDry();
            const e = els();
            if (e.a > 0 && Number.isFinite(e.ra) && e.ra < MINMUS.soi) break;
            if (session.alt() < 10_000) break;
            if (session.fuelLeft() < 40) break;
          }
          session.setThrottle(0);
        }
        const e = els();
        if (e.a > 0 && Number.isFinite(e.ra) && e.ra < MINMUS.soi) {
          const txt = orbitText(e, 'minmus');
          flog.evt('MOI', `Minmus orbit insertion — ${txt}`);
          snap('MINMUS_ORBIT');
          summary.minmusOrbit = txt;
          flog.sample(true, `Minmus orbit ${txt}`);
          checkpoint('minmus-orbit');
        } else {
          flog.evt('MOI', `Minmus flyby ${orbitText(e, 'minmus')} — leaving SOI`);
          snap('MINMUS_ORBIT');
          summary.minmusOrbit = `flyby ${orbitText(e, 'minmus')}`;
        }
      }

      leaveMoonIfNeeded();
    } else if (!summary.minmusSoi) {
      flog.evt('MINMUS MISS', 'Giving up Minmus intercept — continuing to Kerbin escape');
    }
  }

  // -----------------------------------------------------------------------
  // 3. Escape Kerbin SOI → solar orbit (must succeed)
  // -----------------------------------------------------------------------
  phase('ESCAPE KERBIN');
  leaveMoonIfNeeded();

  if (session.st.body === 'kerbin') {
    const e0 = els();
    if (!(e0.a < 0)) {
      // High already (post-Minmus): burn here. Low LKO: coast to Pe first.
      const r = session.st.pos.length();
      if (r < 8e6 && e0.a > 0 && Number.isFinite(e0.period)) {
        const tPe = timeToPeriapsis(e0, session.st.t);
        if (Number.isFinite(tPe) && tPe > 20 && tPe < e0.period * 0.85) {
          console.log(`  coast to Pe in ${(tPe / 60).toFixed(1)} min before escape burn`);
          coastLoop(Math.max(0, tPe - 8), () => session.st.body !== 'kerbin');
        }
      }
      flog.evt('ESCAPE', 'Prograde burn to hyperbolic Kerbin escape');
      burnUntil(() => {
        if (session.st.body !== 'kerbin') return true;
        return els().a < 0;
      }, { aim: 'prograde', maxS: 500 });
    } else {
      flog.evt('ESCAPE', `Already escaping Kerbin (${orbitText(e0, 'kerbin')})`);
    }

    const e = session.st.body === 'kerbin' ? els() : els('kerbin');
    flog.evt('ESCAPE', `Cutoff ${orbitText(e, 'kerbin')}  a=${e.a.toFixed(0)}  body=${session.st.body}  fuel ${session.fuelLeft().toFixed(0)} kg`);
    flog.sample(true, 'escape cutoff');
  }

  phase('COAST TO KERBOL');
  {
    if ((session.st.body === 'minmus' || session.st.body === 'mun') && !summary.snapshots.includes('ESCAPE_BURN')) {
      leaveMoonIfNeeded();
    }
    if (session.st.body === 'kerbin' && !summary.snapshots.includes('ESCAPE_BURN')) {
      snap('ESCAPE_BURN');
      checkpoint('escape');
    }
    if (session.st.body !== 'kerbol') {
      const got = coastLoop(1_200_000, () => session.st.body === 'kerbol');
      if (!got && session.st.body === 'mun') {
        leaveMoonIfNeeded();
        coastLoop(200_000, () => session.st.body === 'kerbol');
      }
      if (session.st.body === 'minmus') {
        summary.minmusSoi = true;
        if (!summary.snapshots.includes('MINMUS_SOI')) snap('MINMUS_SOI');
        leaveMoonIfNeeded();
        if (session.st.body === 'kerbin') {
          burnUntil(() => {
            const e = els();
            return e.a < 0 || (Number.isFinite(e.ra) && e.ra > KERBIN.soi) || session.st.body === 'kerbol';
          }, { maxS: 200 });
          coastLoop(200_000, () => session.st.body === 'kerbol');
        }
      }
    }

    if (session.st.body !== 'kerbol') {
      throw new Error(`Failed to leave Kerbin SOI (body=${session.st.body}, r=${session.st.pos.length().toFixed(0)})`);
    }

    summary.kerbolSoi = true;
    flog.evt('KERBOL SOI', `Left Kerbin SOI — now orbiting Kerbol`);
    snap('KERBIN_SOI_EXIT');
    flog.sample(true, 'Kerbin SOI exit');
    checkpoint('kerbol-soi');

    // Coast until Kerbin has separated a bit on the solar map.
    const tSep = session.st.t;
    coastLoop(80_000, () => {
      const k = getBodyState('kerbin', session.st.t).pos;
      return session.st.pos.distanceTo(k) > 4e8 && session.st.t - tSep > 3_600;
    });

    const e = els();
    const txt = orbitText(e, 'kerbol');
    summary.solar = txt;
    summary.fuelEnd = session.fuelLeft();
    flog.evt('SOLAR ORBIT', `Kerbol-centric ${txt}  body=${session.st.body}  fuel ${summary.fuelEnd.toFixed(0)} kg`);
    snap('SOLAR_ORBIT');
    flog.sample(true, 'solar orbit');
    checkpoint('solar');
  }

  writeSummaryMd();
  const result = [
    summary.kerbolSoi ? 'solar orbit around Kerbol' : 'FAILED — did not reach Kerbol',
    summary.minmusSoi ? 'Minmus SOI yes' : 'Minmus SOI no',
    summary.lko ? `LKO ${summary.lko}` : null,
    summary.solar ? `solar ${summary.solar}` : null,
    `fuel ${summary.fuelEnd?.toFixed(0) ?? '?'} kg`,
  ].filter(Boolean).join(' · ');
  flog.setResult(result);
  flog.write(LOG_PATH);
  console.log(`\nSYSTEM TOUR DONE — ${result}`);
  console.log(`  snapshots: ${summary.snapshots.join(', ')}`);
  console.log(`  log: ${LOG_PATH}`);
  process.exit(summary.kerbolSoi ? 0 : 1);
} catch (err) {
  console.error('\nSYSTEM TOUR FAILED:', err.message);
  try {
    summary.fuelEnd = session.st ? session.fuelLeft() : summary.fuelEnd;
    writeSummaryMd();
    flog.setResult(`failed — ${err.message}`);
    flog.write(LOG_PATH);
  } catch { /* still exit */ }
  process.exit(1);
}
