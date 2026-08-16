// Shared headless autopilot for Mun / Duna land-and-return tests.
// Attitude is cheated (quat); physics, fuel, staging, SOI, ground are real.

import { Vector3 } from 'three';
import { BODIES, getBodyState, getRelativeState, fmtTime, fmtDist } from '../../src/constants.js';
import { computeSections } from '../../src/vessel.js';
import { checkSOI } from '../../src/physics.js';
import { heightAt } from '../../src/terrain.js';
import {
  elementsFromState, propagate, timeToPeriapsis, timeToApoapsis,
  findMunEncounter, munTransferPhase, findEncounter,
  planetPhaseDeg, hohmannTransfer, ejectionDeltaV,
} from '../../src/orbits.js';
import { serializeSnapshot, writeSnapshot } from '../../mcp/snapshot.mjs';

const Y = new Vector3(0, 1, 0);

export function orbitText(e, bodyName) {
  const b = BODIES[bodyName];
  const pe = (e.rp - b.radius) / 1000;
  const ap = Number.isFinite(e.ra) ? (e.ra - b.radius) / 1000 : Infinity;
  return `${pe.toFixed(0)} × ${Number.isFinite(ap) ? ap.toFixed(0) : '∞'} km`;
}

export function angleDiff(a, b) {
  return ((a - b + 180) % 360 + 360) % 360 - 180;
}

export class Autopilot {
  constructor(session, { log = console.log, onEvent = null } = {}) {
    this.session = session;
    this.log = log;
    this.onEvent = onEvent;
    this.events = [];
    this.touchdowns = [];
    this.snaps = [];
  }

  get st() { return this.session.st; }

  els(bodyName = this.st.body) {
    const st = this.st;
    if (bodyName === st.body) {
      return elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
    }
    const frame = getRelativeState(st.body, bodyName, st.t);
    const pos = st.pos.clone().add(frame.pos);
    const vel = st.vel.clone().add(frame.vel);
    return elementsFromState(pos, vel, BODIES[bodyName].mu, st.t);
  }

  pointVec(dir) {
    const v = dir.clone();
    if (v.lengthSq() < 1e-12) v.copy(this.session.up());
    this.st.quat.setFromUnitVectors(Y, v.normalize());
    this.st.angVel.set(0, 0, 0);
  }

  handleEvents(tlm, { allowLand = false } = {}) {
    const evs = tlm?.events || [];
    for (const ev of evs) {
      this.events.push({ ...ev, t: this.st.t, body: this.st.body });
      if (ev.type === 'landed') {
        this.touchdowns.push({
          body: this.st.body,
          speed: Number(ev.speed) || 0,
          t: this.st.t,
          fuel: this.session.fuelLeft(),
          water: !!ev.water,
        });
        this.log(`  TOUCHDOWN ${this.st.body} at ${Number(ev.speed).toFixed(2)} m/s  fuel ${this.session.fuelLeft().toFixed(0)} kg`);
      }
      if (ev.type === 'crashed') {
        throw new Error(`CRASHED at ${Number(ev.speed).toFixed(1)} m/s, t=${this.st.t.toFixed(0)}s, body=${this.st.body} alt=${this.session.alt().toFixed(0)}`);
      }
      if (ev.type === 'soi') {
        const b = BODIES[ev.body];
        this.log(`  SOI → ${b?.name ?? ev.body}  t=${fmtTime(this.st.t)}`);
      }
      if (ev.type === 'chute') this.log('  CHUTE deployed');
      if (ev.type === 'chute-torn') this.log('  CHUTE torn');
      if (ev.type === 'overheat') this.log(`  OVERHEAT ${ev.part?.def?.name || ev.part || ''}`);
    }
    if (this.st.dead && !allowLand) {
      throw new Error(`Vessel dead at t=${this.st.t.toFixed(0)}s alt=${this.session.alt().toFixed(0)}`);
    }
    if (this.onEvent) this.onEvent(evs);
    return evs;
  }

  doStage(reason = '') {
    const out = this.session.stage();
    if (out.staged) this.log(`  STAGE ${this.session.stageIdx}: ${out.staged}${reason ? ` (${reason})` : ''}`);
    return out;
  }

  maybeStageDry({ allowLander = true } = {}) {
    const st = this.st;
    const srb = st.parts.find((p) => p.def.engine?.srb);
    if (srb && srb.fuel <= 1) {
      this.doStage('SRBs dry');
      return;
    }
    const lit = st.parts.find((p) => p.ignited && p.alive && p.def.engine && !p.def.engine.srb);
    if (lit) {
      const secs = computeSections(st.parts);
      const feed = st.parts.some((p) => p.def.fuel && !p.def.engine && p.fuel > 0.5 &&
        secs.get(p.stackIndex) === secs.get(lit.stackIndex));
      if (!feed) {
        const nxt = this.session.plan[this.session.stageIdx];
        if (nxt && nxt.ignite && nxt.ignite.length) {
          if (!allowLander) {
            const engines = st.parts
              .filter((p) => p.alive && p.kind === 'stack' && p.def.engine)
              .sort((a, b) => a.stackIndex - b.stackIndex);
            const landerEng = engines[0];
            const wouldIgniteLander = landerEng && nxt.ignite.includes(landerEng.key);
            if (wouldIgniteLander) return; // keep lander for the surface
          }
          this.doStage('stage dry');
        }
      }
    }
  }

  /** Drop the propulsion section under the heat shield so the shield is windward. */
  jettisonService() {
    const st = this.st;
    const shield = st.parts.find((p) => p.alive && p.def.shield);
    if (!shield) return false;
    const cut = shield.stackIndex;
    const before = st.parts.length;
    st.parts = st.parts.filter((p) => p.stackIndex <= cut);
    if (st.parts.length === before) return false;
    if (typeof this.session.refreshMass === 'function') this.session.refreshMass();
    if (typeof this.session.resyncPlan === 'function') this.session.resyncPlan();
    this.log('  jettison service / lander — heat shield is now aft');
    return true;
  }

  /**
   * Apollo-style: keep only the uppermost engine section (the lander).
   * Call in low orbit BEFORE powered descent so the surface craft is short.
   */
  dropToLander() {
    const st = this.st;
    const engines = st.parts
      .filter((p) => p.alive && p.kind === 'stack' && p.def.engine)
      .sort((a, b) => a.stackIndex - b.stackIndex);
    const landerEng = engines[0];
    if (!landerEng) return false;
    const dec = st.parts
      .filter((p) => p.alive && p.kind === 'stack' && p.def.decoupler && p.stackIndex > landerEng.stackIndex)
      .sort((a, b) => a.stackIndex - b.stackIndex)[0];
    if (!dec) {
      if (!landerEng.ignited) landerEng.ignited = true;
      return false;
    }
    const cut = dec.stackIndex;
    const dropped = st.parts.filter((p) => p.stackIndex >= cut).map((p) => p.def.name);
    st.parts = st.parts.filter((p) => p.stackIndex < cut);
    landerEng.ignited = true;
    if (typeof this.session.refreshMass === 'function') this.session.refreshMass();
    if (typeof this.session.resyncPlan === 'function') this.session.resyncPlan();
    this.log(`  drop transfer — lander only (jettisoned ${dropped.join(', ')})  fuel ${this.session.fuelLeft().toFixed(0)} kg`);
    return true;
  }

  landerPartNames() {
    return this.st.parts.filter((p) => p.alive).map((p) => p.def.name);
  }

  loadSnap(pathOrTag) {
    const path = pathOrTag.includes('/') || pathOrTag.endsWith('.json')
      ? pathOrTag
      : `/workspace/moonshot/logs/snapshots/${pathOrTag}.json`;
    const tlm = this.session.loadSnapshot(path);
    this.log(`  loaded snapshot ${path}  body=${this.st.body} landed=${this.st.landed} fuel=${this.session.fuelLeft().toFixed(0)}`);
    return tlm;
  }

  dumpSnap(tag) {
    const snap = serializeSnapshot(this.st, { tag, craft: this.session.craftName });
    const path = writeSnapshot(snap);
    this.snaps.push({ tag, path });
    this.log(`  snapshot ${tag} → ${path}`);
    return path;
  }

  /**
   * On-rails coast with large dt. Do NOT use 120s physics steps.
   */
  coastRails(maxS, pred = null, dt = 60) {
    const st = this.st;
    const t0 = st.t;
    const tEnd = t0 + Math.max(0, maxS);
    let el;
    try {
      el = elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
    } catch {
      return false;
    }
    while (st.t < tEnd && !st.dead) {
      if (pred && pred()) return true;
      const step = Math.min(dt, tEnd - st.t);
      if (step <= 1e-9) break;
      st.t += step;
      const { pos, vel } = propagate(el, st.t);
      const b = BODIES[st.body];
      const floor = b.radius + Math.max(b.atmoHeight || 0, 2_500) + 400;
      if (pos.length() < floor) {
        st.t -= step;
        break;
      }
      st.pos.copy(pos);
      st.vel.copy(vel);
      const soiEvents = [];
      checkSOI(st, soiEvents);
      if (soiEvents.length) {
        this.handleEvents({ events: soiEvents.map((ev) => ({ type: ev.type, body: ev.body })) });
        try {
          el = elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
        } catch {
          break;
        }
      }
    }
    return pred ? !!pred() : true;
  }

  burnUntil(pred, { aim = 'prograde', maxS = 400, dt = 0.2, allowLander = true } = {}) {
    const tEnd = this.st.t + maxS;
    this.session.setThrottle(1);
    while (this.st.t < tEnd && !this.st.dead) {
      if (aim === 'prograde') this.session.point('prograde');
      else if (aim === 'retrograde') this.session.point('retrograde');
      else if (aim === 'up') this.session.point('up');
      const stepDt = Math.min(dt, tEnd - this.st.t);
      this.handleEvents(this.session.step(stepDt));
      this.maybeStageDry({ allowLander });
      if (pred()) break;
      if (this.session.fuelLeft() < 8) break;
    }
    this.session.setThrottle(0);
  }

  vInfEst() {
    const r = this.st.pos.length();
    const v = this.st.vel.length();
    const mu = BODIES[this.st.body].mu;
    const disc = v * v - 2 * mu / r;
    return disc > 0 ? Math.sqrt(disc) : 0;
  }

  // ---------------------------------------------------------------------------
  // Kerbin ascent (gravity turn from mission.test)
  // ---------------------------------------------------------------------------
  ascentToOrbit({ apTarget = 83_000, peClear = 71_500, turnStart = 80, turnSpan = 2200 } = {}) {
    this.session.setThrottle(1);
    this.doStage('ignition');
    const KERBIN = BODIES.kerbin;
    let orbitDone = false;
    for (let i = 0; i < 400_000; i++) {
      const st = this.st;
      const sp = st.vel.length();
      const u = this.session.up();
      const vUp = st.vel.dot(u);
      const e = this.els();
      const apAlt = (e.a > 0 ? e.ra : 1e12) - KERBIN.radius;
      const peAlt = e.rp - KERBIN.radius;
      if (e.a > 0 && peAlt > peClear) { this.session.setThrottle(0); orbitDone = true; break; }
      if (apAlt < apTarget) {
        const k = Math.min(0.92, Math.pow(Math.max(0, (sp - turnStart) / turnSpan), 0.8));
        this.pointVec(u.clone().multiplyScalar(1 - k).addScaledVector(this.session.east(), k));
      } else {
        const tAp = timeToApoapsis(e, st.t);
        const hdir = st.vel.clone().addScaledVector(u, -vUp);
        if (hdir.lengthSq() < 1) hdir.copy(this.session.east());
        hdir.normalize();
        const bias = Math.max(-0.15, Math.min(0.55, (35 - tAp) / 50));
        this.pointVec(hdir.addScaledVector(u, bias));
      }
      this.session.setThrottle(1);
      this.handleEvents(this.session.step(0.05));
      this.maybeStageDry();
      if (i % 2400 === 0 && i > 0) {
        this.log(`  ascent t=${st.t.toFixed(0)}s alt=${(this.session.alt() / 1000).toFixed(1)}km v=${sp.toFixed(0)} Ap=${(apAlt / 1000).toFixed(0)} Pe=${(peAlt / 1000).toFixed(0)}`);
      }
    }
    const e = this.els();
    if (!orbitDone || e.rp <= KERBIN.radius + 70_000) {
      throw new Error(`Failed to reach stable orbit (${orbitText(e, 'kerbin')})`);
    }
    this.log(`  LKO ${orbitText(e, 'kerbin')}  fuel ${this.session.fuelLeft().toFixed(0)} kg`);
    const spentTanks = !this.st.parts.some((p) => p.def.fuel && !p.def.engine && p.fuel > 0.5 &&
      computeSections(this.st.parts).get(p.stackIndex) === 0);
    const booster = this.st.parts.find((p) => p.def.name.includes('Falcon') || p.def.name.includes('Titan'));
    if (booster && spentTanks) this.doStage('drop launch stage');
    return e;
  }

  // ---------------------------------------------------------------------------
  // Mun transfer + landing
  // ---------------------------------------------------------------------------
  munTransferAndLand() {
    const session = this.session;
    const target = munTransferPhase(this.st.pos.length());
    const phaseNow = () => {
      const mun = getBodyState('mun', this.st.t).pos;
      const rv = this.st.pos.clone().normalize();
      const rm = mun.clone().normalize();
      const cr = new Vector3().crossVectors(rv, rm);
      let a = Math.atan2(cr.y, rv.dot(rm)) * 180 / Math.PI;
      if (a < 0) a += 360;
      return a;
    };
    const ok = this.coastRails(3 * 140_000, () => Math.abs(phaseNow() - target) < 1.2, 2);
    if (!ok) throw new Error(`Mun window missed (phase=${phaseNow().toFixed(1)} target=${target.toFixed(1)})`);
    this.log(`  TLI at phase ${phaseNow().toFixed(1)}° (target ${target.toFixed(1)}°)`);

    session.setThrottle(1);
    let enc = null;
    for (let i = 0; i < 20_000; i++) {
      session.point('prograde');
      this.handleEvents(session.step(0.15));
      this.maybeStageDry();
      const e = this.els();
      if (e.ra > BODIES.mun.orbitRadius - BODIES.mun.soi * 0.6) {
        session.setThrottle(0);
        enc = findMunEncounter(e, this.st.t, e.period ?? 90_000);
        if (enc) break;
        session.setThrottle(1);
        for (let j = 0; j < 40; j++) {
          session.point('prograde');
          this.handleEvents(session.step(0.15));
        }
        session.setThrottle(0);
        enc = findMunEncounter(this.els(), this.st.t, this.els().period ?? 90_000);
        break;
      }
    }
    if (!enc) {
      this.log('  TLI no encounter — mid-course search');
      let best = { dV: 0, enc: null, pe: Infinity };
      const vHat = this.st.vel.clone().normalize();
      for (let dv = -140; dv <= 180; dv += 8) {
        const vel = this.st.vel.clone().addScaledVector(vHat, dv);
        const el = elementsFromState(this.st.pos.clone(), vel, BODIES.kerbin.mu, this.st.t);
        const hit = findMunEncounter(el, this.st.t, 140_000);
        if (hit && hit.munPeriapsis > 15_000 && hit.munPeriapsis < best.pe) {
          best = { dV: dv, enc: hit, pe: hit.munPeriapsis };
        }
      }
      if (best.enc) {
        this.log(`  mid-course Δv ${best.dV.toFixed(0)} m/s  Mun Pe ${(best.pe / 1000).toFixed(0)} km`);
        this.applyProgradeBurn(best.dV);
        enc = findMunEncounter(this.els(), this.st.t, 140_000);
      }
    }
    if (!enc) throw new Error('No Mun encounter after TLI');
    this.log(`  predicted Mun Pe ${(enc.munPeriapsis / 1000).toFixed(0)} km  fuel ${session.fuelLeft().toFixed(0)} kg`);

    if (!this.coastRails(90_000, () => this.st.body === 'mun', 5)) {
      throw new Error('Did not reach Mun SOI');
    }
    const tPe = timeToPeriapsis(this.els(), this.st.t);
    this.log(`  Mun Pe in ${(tPe / 60).toFixed(1)} min, ${orbitText(this.els(), 'mun')}`);
    if (tPe > 20) this.coastRails(Math.max(0, tPe - 20), null, 2);

    session.setThrottle(1);
    for (let i = 0; i < 20_000; i++) {
      session.point('retrograde');
      this.handleEvents(session.step(0.15));
      this.maybeStageDry();
      const e = this.els();
      if (e.a > 0 && e.rp - BODIES.mun.radius < 32_000) break;
      if (session.alt() < 25_000) break;
    }
    session.setThrottle(0);
    const cap = this.els();
    if (!(cap.a > 0 && cap.ra < BODIES.mun.soi)) {
      throw new Error(`Mun capture failed: ${orbitText(cap, 'mun')}`);
    }
    this.log(`  MOI ${orbitText(cap, 'mun')}  fuel ${session.fuelLeft().toFixed(0)} kg`);
    this.lowerToLandingOrbit('mun', 26_000);
    this.dropToLander();
    return this.poweredDescent('mun');
  }

  poweredDescent(bodyName, { useChutes = false, brakeFrac = 0.45 } = {}) {
    const session = this.session;
    const body = BODIES[bodyName];
    session.setLegs(true);
    if (useChutes) session.armChutes();
    let landedEv = null;
    for (let i = 0; i < 120_000 && !landedEv; i++) {
      const u = session.up();
      const r = this.st.pos.length();
      const aglNow = r - body.radius - heightAt(bodyName, u) - (this.st.massProps?.comY ?? 0);
      const vUp = this.st.vel.dot(u);
      const vH = this.st.vel.clone().addScaledVector(u, -vUp);
      const speed = this.st.vel.length();
      const lit = this.st.parts.find((p) => p.alive && p.ignited && p.def.engine && !p.def.engine.srb);
      if (lit && aglNow > 8000) {
        const secs = computeSections(this.st.parts);
        const feedKg = this.st.parts.filter((p) => p.def.fuel && !p.def.engine && p.fuel > 0 &&
          secs.get(p.stackIndex) === secs.get(lit.stackIndex)).reduce((s, p) => s + p.fuel, 0);
        if (feedKg < 30) this.maybeStageDry();
      }

      const mp = this.st.massProps;
      const g = body.mu / (r * r);
      const maxThrust = this.st.parts
        .filter((p) => p.alive && p.ignited && p.def.engine)
        .reduce((s, p) => s + p.def.engine.thrustVac * p.sym, 0) || 24_000;
      const maxAcc = maxThrust / Math.max(1, mp.m);
      const brake = Math.max(0.1, brakeFrac * Math.max(0.2, maxAcc - g));
      const vAllow = Math.sqrt(Math.max(0, 2 * brake * Math.max(0, aglNow - 15))) + 3;

      const chuteOut = this.st.parts.some((p) => p.alive && p.def.chute && p.chuteState === 'deployed');
      if (useChutes && chuteOut && speed < 10 && aglNow < 400) {
        this.pointVec(u);
        session.setThrottle(0);
      } else if (vH.length() > 4 && aglNow > 2000) {
        this.pointVec(vH.clone().negate().addScaledVector(u, vH.length() * 0.25));
        session.setThrottle(1);
      } else if (speed > vAllow || (aglNow < 400 && speed > 8)) {
        this.pointVec(this.st.vel.clone().negate());
        session.setThrottle(1);
      } else {
        this.pointVec(u);
        session.setThrottle(aglNow < 80 && speed > 3 ? 0.25 : 0);
      }
      const tlm = session.step(aglNow < 2000 ? 0.04 : 0.08);
      const evs = this.handleEvents(tlm, { allowLand: true });
      landedEv = evs.find((ev) => ev.type === 'landed');
      if (this.st.landed) break;
      if (i % 8000 === 0) {
        this.log(`  descent ${bodyName}: agl ${(aglNow / 1000).toFixed(1)} km  v ${speed.toFixed(0)}  fuel ${session.fuelLeft().toFixed(0)}`);
      }
    }
    session.setThrottle(0);
    if (!this.st.landed || this.st.body !== bodyName) {
      throw new Error(`Failed to land on ${bodyName} (landed=${this.st.landed} body=${this.st.body})`);
    }
    const td = this.touchdowns[this.touchdowns.length - 1];
    this.log(`  landed on ${bodyName} at ${td.speed.toFixed(2)} m/s  fuel ${td.fuel.toFixed(0)} kg`);
    return td;
  }

  // ---------------------------------------------------------------------------
  // Vacuum / thin-atmo ascent from a landed state to a low circular orbit
  // ---------------------------------------------------------------------------
  surfaceAscent(bodyName, { apTarget = 28_000, peClear = 22_000 } = {}) {
    const session = this.session;
    const body = BODIES[bodyName];
    if (!this.st.landed) throw new Error('surfaceAscent expects a landed vessel');
    session.setLegs(false);
    let cut = 0;
    for (const p of this.st.parts) {
      if (p.alive && p.def.chute && p.chuteState && p.chuteState !== 'stowed') {
        p.chuteState = 'stowed';
        cut++;
      }
    }
    if (cut) this.log(`  stowed ${cut} chute(s) for ascent`);
    session.setThrottle(1);
    if (!this.st.parts.some((p) => p.alive && p.ignited && p.def.engine)) {
      this.doStage('ascent ignition');
    }
    const atmo = body.atmoHeight || 0;
    const turnV = bodyName === 'mun' ? 20 : 25;
    const turnSpan = bodyName === 'mun' ? 200 : 220;

    // Phase 1: gravity turn until Ap is high enough, then CUT. High-TWR
    // landers escape if they keep burning (Mun Kestrel TWR ~5).
    // Duna: stay vertical longer and cut above ~42 km so Pe circularizes
    // above the 50 km atmosphere (old 8 km / 12 km cut left 48×54).
    for (let i = 0; i < 80_000; i++) {
      const st = this.st;
      const u = session.up();
      const sp = st.vel.length();
      const e = this.els();
      const apAlt = (e.a > 0 ? e.ra : 1e12) - body.radius;
      const peAlt = e.rp - body.radius;
      const alt = session.alt();
      const minCutAlt = bodyName === 'duna' ? 42_000 : atmo + 1500;
      if (e.a > 0 && apAlt >= apTarget && alt > minCutAlt) {
        session.setThrottle(0);
        this.log(`  ${bodyName} Ap cut ${orbitText(e, bodyName)} v=${sp.toFixed(0)}`);
        break;
      }
      if (e.a < 0 && alt > Math.max(atmo + 2000, 8_000)) {
        session.setThrottle(0);
        this.log(`  ${bodyName} escape cut ${orbitText(e, bodyName)}`);
        break;
      }
      let k = Math.min(0.92, Math.pow(Math.max(0, (sp - turnV) / turnSpan), 0.85));
      if (bodyName === 'duna') {
        if (alt < 18_000) k = Math.min(k, 0.16);
        else if (alt < 32_000) k = Math.min(k, 0.50);
        else k = Math.min(0.90, Math.pow(Math.max(0, (sp - 80) / 360), 0.75));
        if (e.a > 0 && apAlt > apTarget * 1.3) k = Math.max(k, 0.72);
        if (e.a < 0) k = Math.max(k, 0.85);
      }
      this.pointVec(u.clone().multiplyScalar(1 - k).addScaledVector(session.east(), k));
      session.setThrottle(1);
      this.handleEvents(session.step(0.05));
      this.maybeStageDry();
      if (i % 400 === 0) {
        this.log(`  ${bodyName} ascent t=${st.t.toFixed(0)} alt=${(alt / 1000).toFixed(1)} v=${sp.toFixed(0)} Ap=${(apAlt / 1000).toFixed(0)} Pe=${(peAlt / 1000).toFixed(0)}`);
      }
    }

    // Phase 2: physics coast to Ap (rails abort below 22 km; Pe is often lower)
    session.setThrottle(0);
    {
      const e0 = this.els();
      this.log(`  ${bodyName} coast to Ap  ${orbitText(e0, bodyName)}`);
      for (let i = 0; i < 80_000; i++) {
        const e2 = this.els();
        const tAp = timeToApoapsis(e2, this.st.t);
        const alt = session.alt();
        if (!Number.isFinite(tAp) || tAp < 5) break;
        if (e2.period && tAp > e2.period * 0.48) break;
        if (alt < 7_000 && this.st.pos.dot(this.st.vel) < 0) break;
        this.handleEvents(session.step(0.2));
        if (this.st.body !== bodyName) break;
      }
    }

    // Phase 3: circularize — prograde at Ap raises Pe. Stop before escape.
    session.setThrottle(1);
    for (let i = 0; i < 40_000; i++) {
      const e = this.els();
      const apAlt = (e.a > 0 ? e.ra : 1e12) - body.radius;
      const peAlt = e.rp - body.radius;
      if (e.a > 0 && peAlt > peClear && apAlt < apTarget * 4) {
        session.setThrottle(0);
        break;
      }
      if (e.a < 0 || (Number.isFinite(apAlt) && apAlt > apTarget * 10 && peAlt > 8_000)) {
        session.setThrottle(0);
        break;
      }
      this.session.point('prograde');
      session.setThrottle(1);
      this.handleEvents(session.step(0.05));
      this.maybeStageDry();
      if (this.session.fuelLeft() < 20) break;
      if (this.st.body !== bodyName) break;
    }
    session.setThrottle(0);

    const e = this.els();
    if (!(e.a > 0) || e.rp <= body.radius + peClear * 0.7) {
      throw new Error(`${bodyName} ascent failed: ${orbitText(e, bodyName)}`);
    }
    this.log(`  ${bodyName} orbit ${orbitText(e, bodyName)}  fuel ${session.fuelLeft().toFixed(0)} kg`);
    return e;
  }

  facingKerbin() {
    const mun = getBodyState('mun', this.st.t);
    return this.st.pos.dot(mun.pos) < 0;
  }

  kerbinFrame() {
    const st = this.st;
    if (st.body === 'kerbin') {
      return { pos: st.pos.clone(), vel: st.vel.clone(), e: this.els() };
    }
    const rel = getRelativeState(st.body, 'kerbin', st.t);
    const pos = st.pos.clone().add(rel.pos);
    const vel = st.vel.clone().add(rel.vel);
    return { pos, vel, e: elementsFromState(pos, vel, BODIES.kerbin.mu, st.t) };
  }

  nearMunSoi() {
    if (this.st.body !== 'kerbin') return this.st.body === 'mun';
    const mun = getBodyState('mun', this.st.t);
    return this.st.pos.distanceTo(mun.pos) < BODIES.mun.soi * 1.15;
  }

  shapeKerbinPe({ lo = 28_000, hi = 40_000, aim = 34_000 } = {}) {
    const KERBIN = BODIES.kerbin;
    for (let pass = 0; pass < 6; pass++) {
      if (this.st.body !== 'kerbin') return;
      const kf = this.kerbinFrame();
      const pe = kf.e.rp - KERBIN.radius;
      const bound = kf.e.a > 0 && kf.e.e < 1 && Number.isFinite(kf.e.ra);
      if (bound && pe >= lo && pe <= hi) return;
      const dir = (!bound || pe > hi) ? 'retrograde' : (pe < lo ? 'prograde' : null);
      if (!dir) return;
      // Lowering Pe is cheapest near apoapsis. After a near-side TKI we
      // leave Mun already close to Ap — burn now. Only coast if Ap is soon
      // and the path does not recapture Mun.
      if (bound && kf.e.period && kf.e.period < 1e7) {
        const tAp = timeToApoapsis(kf.e, this.st.t);
        const r = this.st.pos.length();
        const nearAp = Number.isFinite(kf.e.ra) && r > 0.72 * kf.e.ra;
        if (!nearAp && Number.isFinite(tAp) && tAp > 40 && tAp < kf.e.period * 0.45) {
          this.log(`  Pe-correct coast to Ap in ${(tAp / 60).toFixed(1)} min`);
          this.coastRails(Math.max(0, tAp - 12), () => this.st.body !== 'kerbin' || this.nearMunSoi(), 20);
          if (this.st.body !== 'kerbin') return;
          if (this.nearMunSoi()) this.log('  Pe-correct skipped coast (Mun SOI nearby)');
        }
      }
      this.log(`  Pe-correct ${pass + 1}: ${dir} from ${(pe / 1000).toFixed(1)} km (bound=${bound}) fuel ${this.session.fuelLeft().toFixed(0)}`);
      this.session.setThrottle(1);
      for (let i = 0; i < 6_000; i++) {
        this.session.point(dir);
        const now0 = this.kerbinFrame();
        const close = Math.abs((now0.e.rp - KERBIN.radius) - aim) < 12_000;
        this.handleEvents(this.session.step(close ? 0.05 : 0.15));
        const now = this.kerbinFrame();
        const p = now.e.rp - KERBIN.radius;
        const b = now.e.a > 0 && now.e.e < 1;
        if (b && p >= lo && p <= hi) break;
        if (dir === 'retrograde' && b && p < lo) break;
        if (dir === 'prograde' && b && p > hi) break;
        if (this.session.fuelLeft() < 40) break;
        if (this.st.body !== 'kerbin') break;
      }
      this.session.setThrottle(0);
    }
  }

  tkiFromMun() {
    const period = this.els().period ?? 6_000;
    // Near-side prograde TKI: vessel between Mun and Kerbin. That subtracts
    // from Mun's Kerbin-orbit velocity and drops Kerbin Pe. Do NOT also wait
    // for Mun apoapsis — Ap is often on the far side and the burn then
    // escapes Kerbin instead of coming home.
    this.coastRails(period * 2.4, () => {
      if (!this.facingKerbin()) return false;
      const mun = getBodyState('mun', this.st.t);
      const align = -this.st.pos.clone().normalize().dot(mun.pos.clone().normalize());
      return align > 0.82;
    }, 3);
    const mun0 = getBodyState('mun', this.st.t);
    const align0 = -this.st.pos.clone().normalize().dot(mun0.pos.clone().normalize());
    this.log(`  TKI start  ${orbitText(this.els(), 'mun')}  align ${align0.toFixed(2)}  fuel ${this.session.fuelLeft().toFixed(0)} kg`);
    this.session.setThrottle(1);
    const t0 = this.st.t;
    let hyper = false;
    for (let i = 0; i < 10_000; i++) {
      this.session.point('prograde');
      this.handleEvents(this.session.step(0.08));
      this.maybeStageDry();
      const kf = this.kerbinFrame();
      const pe = kf.e.rp - BODIES.kerbin.radius;
      const boundK = kf.e.a > 0 && kf.e.e < 1;
      if (this.st.body === 'kerbin') {
        if (boundK && pe < 42_000) break;
        if (!boundK && pe < 50_000) break;
        if (this.session.fuelLeft() < 50) break;
        continue;
      }
      const e = this.els();
      if (e.a < 0) {
        hyper = true;
        if (pe < 42_000) break;
        if (this.vInfEst() > 45) break;
      }
      if (this.session.fuelLeft() < 55) break;
      if (this.st.t - t0 > 160) break;
    }
    this.session.setThrottle(0);
    this.log(`  TKI cutoff ${orbitText(this.els(), this.st.body)}  vInf ${this.vInfEst().toFixed(0)}  fuel ${this.session.fuelLeft().toFixed(0)}`);
    if (this.st.body === 'mun') {
      for (let i = 0; i < 20_000 && this.st.body === 'mun'; i++) {
        if (this.session.alt() > 28_000) break;
        this.handleEvents(this.session.step(0.4));
      }
      if (this.st.body === 'mun' && !this.coastRails(40_000, () => this.st.body === 'kerbin', 8)) {
        throw new Error(`Failed to leave Mun SOI after TKI (${orbitText(this.els(), 'mun')} hyper=${hyper})`);
      }
    }
    this.shapeKerbinPe({ lo: 28_000, hi: 40_000, aim: 34_000 });
    const kf = this.kerbinFrame();
    const pe = kf.e.rp - BODIES.kerbin.radius;
    this.log(`  TKI cutoff  Kerbin ${orbitText(kf.e, 'kerbin')}  fuel ${this.session.fuelLeft().toFixed(0)} kg`);
    if (!(kf.e.a > 0) || kf.e.e >= 1) {
      throw new Error(`Kerbin trajectory still escaping (Pe ${(pe / 1000).toFixed(1)} km)`);
    }
    if (pe > 68_000) throw new Error(`Kerbin Pe ${(pe / 1000).toFixed(1)} km above atmosphere`);
    return kf;
  }

  coastToKerbinPeriapsis() {
    const KERBIN = BODIES.kerbin;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (this.st.body === 'mun') {
        if (this.els().a > 0) {
          this.burnUntil(() => this.st.body === 'kerbin' || this.els().a < 0, { aim: 'prograde', maxS: 80 });
        }
        if (!this.coastRails(25_000, () => this.st.body === 'kerbin', 8)) {
          throw new Error('Stuck in Mun SOI on the way home');
        }
        this.shapeKerbinPe();
        continue;
      }
      const e = this.els();
      const pe = e.rp - KERBIN.radius;
      const bound = e.a > 0 && e.e < 1;
      if (!bound || pe > 68_000) {
        this.shapeKerbinPe();
        continue;
      }
      const inbound = this.st.pos.dot(this.st.vel) < 0;
      if (inbound && pe < 70_000 && this.session.alt() < 160_000) return;
      if (inbound && this.session.alt() < 90_000) return;
      const tPe = timeToPeriapsis(e, this.st.t);
      if (!Number.isFinite(tPe) || tPe > 1e8) throw new Error('No upcoming Kerbin periapsis');
      this.log(`  coast to Pe in ${(tPe / 60).toFixed(1)} min (${orbitText(e, 'kerbin')})`);
      const tGoal = this.st.t + Math.max(0, tPe - 120);
      while (this.st.t < tGoal) {
        if (this.st.body === 'mun') break;
        if (this.st.pos.dot(this.st.vel) < 0 && this.session.alt() < 90_000) return;
        const left = tGoal - this.st.t;
        const step = Math.min(left > 400 ? 80 : left > 60 ? 10 : 4, left);
        if (step <= 1e-6) break;
        this.coastRails(step, () => this.st.body === 'mun' || (this.st.pos.dot(this.st.vel) < 0 && this.session.alt() < 90_000), step);
      }
      if (this.st.body === 'mun') continue;
      const inbound2 = this.st.pos.dot(this.st.vel) < 0;
      const pe2 = this.els().rp - KERBIN.radius;
      if (inbound2 && pe2 < 70_000 && this.session.alt() < 200_000) return;
      if (this.session.alt() < 100_000) return;
      this.log(`  after Pe coast alt ${fmtDist(this.session.alt())} — retry ${attempt + 1}`);
      if (pe2 > 68_000 || !(this.els().a > 0)) this.shapeKerbinPe();
    }
  }

  kerbinReentry() {
    const session = this.session;
    const KERBIN = BODIES.kerbin;
    this.coastToKerbinPeriapsis();
    session.setThrottle(0);
    session.setLegs(true);
    // Jettison before interface so the heat shield (stack bottom) is windward
    // when pointing retrograde. Keep the engine only if Pe is still high.
    const pe0 = this.els().rp - KERBIN.radius;
    if (pe0 < 50_000) this.jettisonService();
    session.point('retrograde');
    this.log(`  reentry start alt ${(session.alt() / 1000).toFixed(1)} km  v ${this.st.vel.length().toFixed(0)}  Pe ${(pe0 / 1000).toFixed(1)}  fuel ${session.fuelLeft().toFixed(0)}`);

    let landed = false;
    let chutesArmed = false;
    for (let pass = 1; pass <= 12 && !landed && !this.st.dead; pass++) {
      const outbound0 = this.st.pos.dot(this.st.vel) > 0;
      if (session.alt() > 80_000 || outbound0) this.coastToKerbinPeriapsis();
      session.point('retrograde');
      this.log(`  atmo pass ${pass}: alt ${(session.alt() / 1000).toFixed(1)} km  v ${this.st.vel.length().toFixed(0)}`);
      let dipped = false;
      for (let i = 0; i < 30_000 && !this.st.dead; i++) {
        const alt = session.alt();
        const speed = this.st.vel.length();
        const outbound = this.st.pos.dot(this.st.vel) > 0;
        if (alt < KERBIN.atmoHeight) dipped = true;
        if (dipped && outbound && alt > KERBIN.atmoHeight + 2_000) {
          const e = this.els();
          this.log(`  skip-out ${orbitText(e, 'kerbin')} v=${speed.toFixed(0)}`);
          if (e.a > 0 && e.ra - KERBIN.radius < 280_000) this.jettisonService();
          if (e.a > 0 && e.ra - KERBIN.radius < 140_000 && session.fuelLeft() > 40) {
            this.burnUntil(() => {
              const e2 = this.els();
              return e2.a > 0 && e2.ra - KERBIN.radius < 68_000;
            }, { aim: 'retrograde', maxS: 50, dt: 0.1 });
          }
          break;
        }
        // Arm chutes only in the lower atmo under the tear speed. Physics
        // deploys at press>0.05, agl<2500, speed<300 and tears above 330.
        if (!chutesArmed && alt < 12_000 && speed < 260) {
          session.armChutes();
          chutesArmed = true;
          this.log(`  chutes armed  alt ${(alt / 1000).toFixed(1)} km  v ${speed.toFixed(0)}`);
        }
        const chuteOut = this.st.parts.some((p) => p.alive && p.def.chute && p.chuteState === 'deployed');
        const chuteAlive = this.st.parts.some((p) => p.alive && p.def.chute);
        if (chuteOut) {
          session.point('up');
          session.setThrottle(0);
        } else if (!chuteAlive && alt < 15_000 && session.fuelLeft() > 8) {
          const r = this.st.pos.length();
          const g = KERBIN.mu / (r * r);
          const maxThrust = this.st.parts
            .filter((p) => p.alive && p.ignited && p.def.engine)
            .reduce((s, p) => s + p.def.engine.thrustVac * p.sym, 0) || 0;
          const maxAcc = maxThrust / Math.max(1, this.st.massProps.m);
          const brake = Math.max(0.2, 0.35 * Math.max(0, maxAcc - g));
          const vAllow = Math.sqrt(Math.max(0, 2 * brake * Math.max(0, alt - 12))) + 5;
          if (speed > vAllow) {
            session.point(speed > 60 ? 'retrograde' : 'up');
            session.setThrottle(1);
          } else {
            session.setThrottle(0);
            if (alt < 800) session.point('up');
          }
        } else {
          // Retrograde = nose away from velocity = heat shield into the wind.
          session.point('retrograde');
          session.setThrottle(0);
        }
        const tlm = session.step(alt < 20_000 ? 0.12 : 0.35);
        const evs = this.handleEvents(tlm, { allowLand: true });
        if (evs.some((e) => e.type === 'landed') || this.st.landed) {
          landed = true;
          break;
        }
        if (this.st.body !== 'kerbin') throw new Error(`Left Kerbin during reentry (${this.st.body})`);
      }
      session.setThrottle(0);
    }
    if (!landed || !this.st.landed) throw new Error('Did not reach Kerbin surface');
    if (!this.st.parts.some((p) => p.alive && p.def.pod)) throw new Error('Pod destroyed');
    if (this.st.body !== 'kerbin') throw new Error(`Landed on ${this.st.body}, not Kerbin`);
    const td = this.touchdowns[this.touchdowns.length - 1];
    this.log(`  KERBIN LANDING ${td.speed.toFixed(2)} m/s  fuel ${td.fuel.toFixed(0)} kg  MET ${fmtTime(this.st.t)}`);
    return td;
  }

  // ---------------------------------------------------------------------------
  // Duna Hohmann (asymptote-aligned TDI, from duna-hohmann.mjs)
  // ---------------------------------------------------------------------------
  targetEjectionAngleDeg(rPark, vInf, mu) {
    const e = 1 + rPark * vInf * vInf / mu;
    const nuInf = Math.acos(Math.min(1, Math.max(-1, -1 / e))) * 180 / Math.PI;
    return 90 - nuInf;
  }

  vesselMidnightAngle(planet, t = this.st.t, pos = this.st.pos) {
    const k = getBodyState(planet, t);
    const kHat = k.pos.clone().normalize();
    const pHat = k.vel.clone().normalize();
    const r = pos.clone().normalize();
    return Math.atan2(r.dot(pHat), r.dot(kHat)) * 180 / Math.PI;
  }

  waitHohmannWindow(fromName, toName) {
    const xfer = hohmannTransfer(fromName, toName);
    const from = BODIES[fromName];
    const to = BODIES[toName];
    const nRel = from.omega - to.omega;
    const phaseNow0 = planetPhaseDeg(fromName, toName, this.st.t);
    let d = ((phaseNow0 - xfer.phaseDeg) % 360 + 360) % 360;
    if (d < 0.05 || d > 359.95) d = 0;
    const waitS = Math.abs(nRel) > 1e-14 ? d * (Math.PI / 180) / nRel : 0;
    const wait = waitS < 0 ? waitS + Math.abs(2 * Math.PI / nRel) : waitS;
    this.log(`  window ${fromName}→${toName} now ${phaseNow0.toFixed(2)}° tgt ${xfer.phaseDeg.toFixed(2)}° wait ${(wait / 86400).toFixed(2)} d`);
    const lkoP = this.els().period ?? 2200;
    const jump = Math.max(0, wait - lkoP - 80);
    if (jump > 30) this.coastRails(jump, null, 200);
    this.coastRails(lkoP + 400, () => {
      const p = planetPhaseDeg(fromName, toName, this.st.t);
      return Math.abs(angleDiff(p, xfer.phaseDeg)) < 0.15;
    }, 8);
    const phaseNow = planetPhaseDeg(fromName, toName, this.st.t);
    this.log(`  phase matched ${phaseNow.toFixed(2)}° (err ${angleDiff(phaseNow, xfer.phaseDeg).toFixed(2)}°)`);
    return xfer;
  }

  planetEjection(planet, vInfTarget) {
    const body = BODIES[planet];
    const rPark = this.st.pos.length();
    const ej = ejectionDeltaV(rPark, body.mu, vInfTarget);
    const alpha = this.targetEjectionAngleDeg(rPark, vInfTarget, body.mu);
    const startAng = alpha - 13;
    const el = this.els();
    const period = el.period ?? 2200;
    let bestT = this.st.t;
    let bestErr = 1e9;
    for (let dt = 0; dt <= period; dt += 4) {
      const t = this.st.t + dt;
      const { pos } = propagate(el, t);
      const ang = this.vesselMidnightAngle(planet, t, pos);
      const err = Math.abs(angleDiff(ang, startAng));
      if (err < bestErr) { bestErr = err; bestT = t; }
    }
    const coastTo = Math.max(0, bestT - this.st.t - 2);
    if (coastTo > 2) {
      this.coastRails(coastTo, () => Math.abs(angleDiff(this.vesselMidnightAngle(planet), startAng)) < 2.5, 4);
    }
    this.log(`  eject ${planet} α=${alpha.toFixed(1)}° start=${this.vesselMidnightAngle(planet).toFixed(1)}° dV=${ej.dV.toFixed(0)} v∞=${vInfTarget.toFixed(0)}`);
    this.burnUntil(() => {
      if (this.st.body !== planet) return true;
      const e = this.els();
      if (!(e.a < 0)) return false;
      return Math.abs(this.vInfEst() - vInfTarget) < 60;
    }, { aim: 'prograde', maxS: 420, dt: 0.15, allowLander: false });
    if (this.st.body === planet && !(this.els().a < 0)) {
      this.burnUntil(() => this.st.body !== planet || (this.els().a < 0 && Math.abs(this.vInfEst() - vInfTarget) < 90), {
        aim: 'prograde', maxS: 200, dt: 0.15, allowLander: true,
      });
    } else if (this.st.body === planet && this.els().a < 0 && Math.abs(this.vInfEst() - vInfTarget) > 70) {
      this.burnUntil(() => this.st.body !== planet || Math.abs(this.vInfEst() - vInfTarget) < 55, {
        aim: 'prograde', maxS: 80, dt: 0.15, allowLander: true,
      });
    }
    return ej;
  }

  closestApproach(childName, horizon, el = null) {
    el = el || this.els();
    const t0 = this.st.t;
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

  searchProgradeCA(childName, horizon) {
    const st = this.st;
    const mu = BODIES.kerbol.mu;
    const vHat = st.vel.clone().normalize();
    const rHat = st.pos.clone().normalize();
    const child = BODIES[childName];
    let best = { d: Infinity, dV: 0, enc: null, dPro: 0, dRad: 0 };
    const dVs = [];
    for (let v = -90; v <= 90; v += 3) dVs.push(v);
    for (const extra of [-2, -1, 1, 2, 4, -4, 7, -7, 12, -12, 18, -18, 25, -25, 35, -35, 50, -50, 70, -70, 110, -110, 160, -160, 220, -220]) {
      if (!dVs.includes(extra)) dVs.push(extra);
    }
    for (const dV of dVs) {
      const vel = st.vel.clone().addScaledVector(vHat, dV);
      const el = elementsFromState(st.pos.clone(), vel, mu, st.t);
      const enc = findEncounter(el, st.t, horizon, childName);
      const ca = this.closestApproach(childName, horizon, el);
      const d = enc ? Math.min(ca.d, Math.max(0, enc.periapsis + child.radius)) : ca.d;
      if (d < best.d) best = { d, dV, enc, dPro: dV, dRad: 0, ca };
    }
    if (Number.isFinite(best.dV)) {
      for (let dv = best.dV - 3; dv <= best.dV + 3; dv += 0.5) {
        const vel = st.vel.clone().addScaledVector(vHat, dv);
        const el = elementsFromState(st.pos.clone(), vel, mu, st.t);
        const enc = findEncounter(el, st.t, horizon, childName);
        const ca = this.closestApproach(childName, horizon, el);
        const d = enc ? Math.min(ca.d, Math.max(0, enc.periapsis + child.radius)) : ca.d;
        if (d < best.d) best = { d, dV: dv, enc, dPro: dv, dRad: 0, ca };
      }
    }
    for (const dRad of [0, 6, -6, 12, -12, 20, -20]) {
      const vel = st.vel.clone().addScaledVector(vHat, best.dV).addScaledVector(rHat, dRad);
      const el = elementsFromState(st.pos.clone(), vel, mu, st.t);
      const enc = findEncounter(el, st.t, horizon, childName);
      const ca = this.closestApproach(childName, horizon, el);
      const d = enc ? Math.min(ca.d, Math.max(0, enc.periapsis + child.radius)) : ca.d;
      if (d < best.d) best = { d, dV: best.dV, enc, dPro: best.dV, dRad, ca };
    }
    return best;
  }

  applyVectorBurn(dPro, dRad, maxS = 200) {
    const vHat = this.st.vel.clone().normalize();
    const rHat = this.st.pos.clone().normalize();
    const want = vHat.multiplyScalar(dPro).addScaledVector(rHat, dRad);
    const mag = want.length();
    if (mag < 0.8) return 0;
    const v0 = this.st.vel.clone();
    this.pointVec(want);
    this.session.setThrottle(1);
    const tEnd = this.st.t + maxS;
    while (this.st.t < tEnd && !this.st.dead && this.session.fuelLeft() > 8) {
      const got = this.st.vel.clone().sub(v0);
      if (got.length() >= mag) break;
      const remain = want.clone().sub(got);
      if (remain.lengthSq() > 1) this.pointVec(remain);
      this.handleEvents(this.session.step(0.12));
      this.maybeStageDry({ allowLander: true });
    }
    this.session.setThrottle(0);
    return this.st.vel.clone().sub(v0).length();
  }

  /** Prefer a usable Pe (~120 km), not a grazing SOI hit. */
  searchEncounterDV(childName, horizon, { peAim = 120_000 } = {}) {
    const st = this.st;
    const mu = BODIES.kerbol.mu;
    const vHat = st.vel.clone().normalize();
    const rHat = st.pos.clone().normalize();
    const candidates = [];
    const progs = [0, 8, -8, 15, -15, 25, -25, 40, -40, 60, -60, 90, -90, 130, -130, 180, 250];
    const rads = [0, 12, -12, 25, -25, 40];
    for (const dPro of progs) {
      for (const dRad of rads) {
        if (Math.abs(dPro) + Math.abs(dRad) > 320) continue;
        const vel = st.vel.clone().addScaledVector(vHat, dPro).addScaledVector(rHat, dRad);
        const el = elementsFromState(st.pos.clone(), vel, mu, st.t);
        const enc = findEncounter(el, st.t, horizon, childName);
        if (enc && enc.periapsis > -20_000) {
          candidates.push({
            dPro, dRad, enc, dV: dPro,
            d: enc.periapsis + BODIES[childName].radius,
            score: Math.abs(dPro) + Math.abs(dRad) * 1.2
              + (enc.periapsis < 40_000 ? 80 : 0)
              + Math.abs(enc.periapsis - peAim) / 50_000,
          });
        }
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0] || null;
  }

  /** Iterative mid-course like mcp/duna-hohmann.mjs. Returns { enc, ca0, hit }. */
  midCourseTo(childName, horizon) {
    const e0 = this.els();
    const ca0 = this.closestApproach(childName, horizon, e0);
    this.log(`  mid-course CA0 ${fmtDist(ca0.d)}`);
    let enc = findEncounter(e0, this.st.t, horizon, childName);
    let hit = null;
    if (enc && enc.periapsis > 8_000_000) enc = null;
    for (let iter = 0; iter < 6 && !enc; iter++) {
      hit = this.searchProgradeCA(childName, horizon);
      const scored = this.searchEncounterDV(childName, horizon);
      if (scored && scored.enc && scored.enc.periapsis < 8_000_000) {
        if (!hit.enc || scored.enc.periapsis < hit.enc.periapsis || scored.score < 40) hit = scored;
      }
      const peTxt = hit.enc ? ` Pe ${(hit.enc.periapsis / 1000).toFixed(0)} km` : '';
      this.log(`  mid-course iter ${iter}: Δv ${hit.dV.toFixed(1)} (rad ${(hit.dRad || 0).toFixed(1)})  CA ${fmtDist(hit.d)}${peTxt}`);
      if (Math.abs(hit.dV) < 0.4 && Math.abs(hit.dRad || 0) < 0.4) break;
      if (Math.abs(hit.dRad || 0) > 0.5) this.applyVectorBurn(hit.dPro ?? hit.dV, hit.dRad || 0);
      else this.applyProgradeBurn(hit.dV);
      enc = findEncounter(this.els(), this.st.t, horizon, childName);
      if (enc && enc.periapsis > 8_000_000) enc = null;
    }
    return { enc, ca0, hit };
  }

  applyProgradeBurn(dV, maxS = 180) {
    if (Math.abs(dV) < 0.5) return 0;
    const aim = dV < 0 ? 'retrograde' : 'prograde';
    const target = Math.abs(dV);
    const v0 = this.st.vel.clone();
    this.session.setThrottle(1);
    const tEnd = this.st.t + maxS;
    while (this.st.t < tEnd && !this.st.dead && this.session.fuelLeft() > 8) {
      this.session.point(aim);
      this.handleEvents(this.session.step(0.12));
      this.maybeStageDry({ allowLander: true });
      if (this.st.vel.clone().sub(v0).length() >= target) break;
    }
    this.session.setThrottle(0);
    return this.st.vel.clone().sub(v0).length();
  }

  coastToPlanet(childName, horizon) {
    if (this.st.body === childName) return true;
    const got = this.coastRails(horizon, () => this.st.body === childName, 120);
    return got && this.st.body === childName;
  }

  capturePlanet(bodyName, { peFloor = 50_000 } = {}) {
    const body = BODIES[bodyName];
    const el = this.els();
    const tPe = timeToPeriapsis(el, this.st.t);
    const peAlt = el.rp - body.radius;
    this.log(`  ${bodyName} Pe in ${(tPe / 60).toFixed(1)} min  alt ${(peAlt / 1000).toFixed(0)} km`);
    if (Number.isFinite(tPe) && tPe > 20) {
      const lead = peAlt < 60_000 ? 90 : 12;
      this.coastRails(Math.max(0, tPe - lead), () => this.st.body !== bodyName, 15);
    }
    if (this.st.body !== bodyName) throw new Error(`Left ${bodyName} SOI before capture`);
    this.burnUntil(() => {
      if (this.st.body !== bodyName) return true;
      const e = this.els();
      if (!(e.a > 0) || !Number.isFinite(e.ra)) return false;
      return e.ra < body.soi && e.rp > body.radius + peFloor;
    }, { aim: 'retrograde', maxS: 280, dt: 0.12, allowLander: true });
    if (this.st.body === bodyName) {
      const e = this.els();
      if (!(e.a > 0 && Number.isFinite(e.ra) && e.ra < body.soi)) {
        this.burnUntil(() => {
          const ee = this.els();
          return ee.a > 0 && Number.isFinite(ee.ra) && ee.ra < body.soi;
        }, { aim: 'retrograde', maxS: 200, dt: 0.12, allowLander: true });
      }
    }
    const e = this.els();
    const bound = e.a > 0 && Number.isFinite(e.ra) && e.ra < body.soi;
    if (!bound) throw new Error(`Capture failed: ${orbitText(e, bodyName)}`);
    this.log(`  ${bodyName} capture ${orbitText(e, bodyName)}  fuel ${this.session.fuelLeft().toFixed(0)} kg`);
    return e;
  }

  deorbitToSurface(bodyName, { peTarget: peOverride } = {}) {
    const body = BODIES[bodyName];
    const peTarget = peOverride ?? (body.atmoHeight ? Math.min(body.atmoHeight * 0.35, 20_000) : 3_000);
    this.log(`  deorbit ${bodyName} toward Pe ${(peTarget / 1000).toFixed(0)} km`);
    this.burnUntil(() => {
      const e = this.els();
      return (e.rp - body.radius) < peTarget || this.session.alt() < Math.max(body.atmoHeight || 0, 8_000);
    }, { aim: 'retrograde', maxS: 140, dt: 0.12 });
    this.session.setThrottle(0);
    for (let i = 0; i < 20_000; i++) {
      const alt = this.session.alt();
      const e = this.els();
      const tPe = timeToPeriapsis(e, this.st.t);
      if (alt < Math.max((body.atmoHeight || 0) * 0.55, 6_000)) break;
      if (!Number.isFinite(tPe) || tPe < 8) break;
      this.handleEvents(this.session.step(0.25));
      if (this.st.body !== bodyName) break;
    }
  }

  lowerToLandingOrbit(bodyName, peAim = 28_000) {
    const body = BODIES[bodyName];
    const floor = body.radius + Math.max(body.atmoHeight || 0, 8_000) + 2_000;
    const tPe = timeToPeriapsis(this.els(), this.st.t);
    if (Number.isFinite(tPe) && tPe > 20) this.coastRails(tPe - 12, null, 8);
    this.burnUntil(() => {
      const e = this.els();
      if (e.rp < floor) return true;
      return e.a > 0 && e.rp - body.radius < peAim + 4_000 && e.ra - body.radius < peAim * 2.4;
    }, { aim: 'retrograde', maxS: 360, dt: 0.12, allowLander: false });
    let e = this.els();
    if (e.a > 0 && e.ra - body.radius > peAim * 2.4 && e.rp > floor) {
      const tAp = timeToApoapsis(e, this.st.t);
      if (Number.isFinite(tAp) && tAp > 20) this.coastRails(Math.max(0, tAp - 10), null, 8);
      this.burnUntil(() => {
        const ee = this.els();
        if (ee.rp < floor) return true;
        return ee.a > 0 && ee.ra - body.radius < peAim * 2.4;
      }, { aim: 'retrograde', maxS: 280, dt: 0.12, allowLander: false });
      e = this.els();
    }
    this.log(`  ${bodyName} low orbit ${orbitText(e, bodyName)}`);
    const tPe2 = timeToPeriapsis(e, this.st.t);
    if (Number.isFinite(tPe2) && tPe2 > 20) this.coastRails(tPe2 - 10, null, 4);
    return e;
  }
}
