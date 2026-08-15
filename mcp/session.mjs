// Headless Moonshot sim session. Reuses the game physics exactly like
// tests/mission.test.mjs — one in-memory flight the MCP server drives.

import { Vector3, Quaternion } from 'three';
import { STOCK } from '../src/stock.js';
import { BODIES, getBodyState, getRelativeState, PAD_DIR, PAD_ALTITUDE } from '../src/constants.js';
import { buildVesselParts, buildStagePlan, stackGeometry, computeSections, massProps } from '../src/vessel.js';
import { physicsStep, checkSOI } from '../src/physics.js';
import { elementsFromState, propagate, findMunEncounter, munTransferPhase } from '../src/orbits.js';
import { heightAt } from '../src/terrain.js';

const Y = new Vector3(0, 1, 0);
const STEP_CAP_S = 120;
const DEFAULT_DT = 0.05;

function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function serializeEvent(ev) {
  const out = { type: ev.type };
  if (ev.speed != null) out.speed = ev.speed;
  if (ev.body) out.body = ev.body;
  if (ev.water != null) out.water = ev.water;
  if (ev.part?.def?.name) out.part = ev.part.def.name;
  return out;
}

export class SimSession {
  constructor() {
    this.st = null;
    this.plan = [];
    this.stageIdx = 0;
    this.events = [];
    this.lastEvents = [];
    this.craftName = null;
    this.liftedOff = false;
  }

  hasFlight() {
    return this.st != null;
  }

  newFlight(craftName = 'Mun Express') {
    const name = craftName || 'Mun Express';
    const designSrc = STOCK[name];
    if (!designSrc) {
      const available = Object.keys(STOCK).join(', ');
      throw new Error(`Unknown craft "${name}". Available: ${available}`);
    }
    const design = structuredClone(designSrc);
    const parts = buildVesselParts(design);
    const geom0 = stackGeometry(parts);
    const mp0 = massProps(parts, geom0);
    const quat0 = new Quaternion().setFromUnitVectors(Y, PAD_DIR);

    this.st = {
      t: 0, body: 'kerbin',
      pos: PAD_DIR.clone().multiplyScalar(BODIES.kerbin.radius + PAD_ALTITUDE + 0.7 + mp0.comY),
      vel: new Vector3(),
      quat: quat0.clone(), angVel: new Vector3(),
      throttle: 0, landed: true, dead: false,
      parts, geom: geom0, sections: computeSections(parts), massProps: mp0,
      controls: { pitch: 0, yaw: 0, roll: 0 },
      sas: false, sasMode: 'hold', sasTarget: quat0.clone(),
    };
    this.plan = buildStagePlan(parts);
    this.stageIdx = 0;
    this.events = [];
    this.lastEvents = [];
    this.craftName = name;
    this.liftedOff = false;
    return this.telemetry();
  }

  requireFlight() {
    if (!this.st) throw new Error('No flight in progress. Call ksp_new_flight first.');
    return this.st;
  }

  refreshMass() {
    const st = this.st;
    st.geom = stackGeometry(st.parts);
    st.sections = computeSections(st.parts);
    st.massProps = massProps(st.parts, st.geom);
  }

  up() {
    return this.st.pos.clone().normalize();
  }

  east() {
    return new Vector3(0, 1, 0).cross(this.up()).normalize();
  }

  alt() {
    return this.st.pos.length() - BODIES[this.st.body].radius;
  }

  fuelLeft() {
    return this.st.parts
      .filter((p) => p.fuel > 0 && !p.def.engine?.srb)
      .reduce((s, p) => s + p.fuel, 0);
  }

  situation() {
    const st = this.st;
    if (st.dead) return 'dead';
    if (st.landed && !this.liftedOff) return 'prelaunch';
    if (st.landed) return 'landed';
    return 'flight';
  }

  munPhaseDeg() {
    const st = this.st;
    const mun = getBodyState('mun', st.t).pos;
    const frame = getRelativeState(st.body, 'kerbin', st.t);
    const vesselKerbin = st.pos.clone().add(frame.pos);
    const rv = vesselKerbin.normalize();
    const rm = mun.clone().normalize();
    const cr = new Vector3().crossVectors(rv, rm);
    let a = Math.atan2(cr.y, rv.dot(rm)) * 180 / Math.PI;
    if (a < 0) a += 360;
    return a;
  }

  telemetry() {
    const st = this.requireFlight();
    this.refreshMass();
    const body = BODIES[st.body];
    const up = this.up();
    const alt = this.alt();
    const terrainH = alt < 95_000 ? heightAt(st.body, up) : 0;
    const agl = alt - terrainH - (st.massProps?.comY ?? 0);
    const speed = st.vel.length();
    const vspeed = st.vel.dot(up);

    const snap = {
      t: st.t,
      craft: this.craftName,
      body: st.body,
      situation: this.situation(),
      alt_m: alt,
      agl_m: agl,
      speed_ms: speed,
      vspeed_ms: vspeed,
      mass_t: st.massProps.m / 1000,
      throttle: st.throttle,
      fuel_kg: this.fuelLeft(),
      sas: st.sas,
      sasMode: st.sasMode,
      stageIndex: this.stageIdx,
      stages: this.plan.slice(this.stageIdx).map((e) => e.label),
      ap_m: null,
      pe_m: null,
      period_s: null,
      inclination_deg: null,
      mun_phase_deg: this.munPhaseDeg(),
      mun_pe_m: null,
      mun_transfer_phase_deg: null,
      landed: st.landed,
      dead: st.dead,
      last_events: this.lastEvents.map(serializeEvent),
    };

    try {
      const el = elementsFromState(st.pos, st.vel, body.mu, st.t);
      if (Number.isFinite(el.ra)) snap.ap_m = el.ra - body.radius;
      if (Number.isFinite(el.rp)) snap.pe_m = el.rp - body.radius;
      snap.period_s = el.period;
      if (el.what) {
        snap.inclination_deg = Math.acos(clamp(el.what.y, -1, 1)) * 180 / Math.PI;
      }
      if (st.body === 'kerbin') {
        snap.mun_transfer_phase_deg = munTransferPhase(st.pos.length());
        if (!st.landed && speed > 10) {
          const enc = findMunEncounter(el, st.t, el.period ?? 90_000);
          if (enc) snap.mun_pe_m = enc.munPeriapsis;
        }
      }
    } catch {
      // degenerate pad state / hyperbolic noise — leave orbit fields null
    }
    return snap;
  }

  stage() {
    const st = this.requireFlight();
    const ev = this.plan[this.stageIdx++];
    if (!ev) {
      this.stageIdx = this.plan.length;
      return { staged: null, message: 'No remaining stages', ...this.telemetry() };
    }
    if (ev.decouple !== null) st.parts = st.parts.filter((p) => p.stackIndex < ev.decouple);
    for (const k of ev.dropRadials) st.parts = st.parts.filter((p) => p.key !== k);
    for (const k of ev.ignite) {
      const p = st.parts.find((q) => q.key === k);
      if (p) p.ignited = true;
    }
    if (ev.chutes) {
      for (const p of st.parts) if (p.def.chute) p.chuteState = 'armed';
    }
    this.refreshMass();
    const names = ev.ignite
      .map((k) => st.parts.find((p) => p.key === k)?.def.name)
      .filter(Boolean)
      .join(' + ');
    return {
      staged: ev.label,
      ignite: names || null,
      decouple: ev.decouple,
      dropRadials: ev.dropRadials.length,
      ...this.telemetry(),
    };
  }

  setThrottle(value) {
    this.requireFlight();
    this.st.throttle = clamp(value, 0, 1);
    return { throttle: this.st.throttle, ...this.telemetry() };
  }

  setSas(mode) {
    this.requireFlight();
    const allowed = ['off', 'hold', 'prograde', 'retrograde'];
    if (!allowed.includes(mode)) {
      throw new Error(`Invalid SAS mode "${mode}". Use: ${allowed.join(', ')}`);
    }
    if (mode === 'off') {
      this.st.sas = false;
    } else {
      this.st.sas = true;
      this.st.sasMode = mode;
      if (mode === 'hold') this.st.sasTarget.copy(this.st.quat);
    }
    return { sas: this.st.sas, sasMode: this.st.sasMode, ...this.telemetry() };
  }

  setControls({ pitch, yaw, roll } = {}) {
    this.requireFlight();
    const c = this.st.controls;
    if (pitch != null) c.pitch = clamp(pitch, -1, 1);
    if (yaw != null) c.yaw = clamp(yaw, -1, 1);
    if (roll != null) c.roll = clamp(roll, -1, 1);
    return { controls: { ...c }, ...this.telemetry() };
  }

  point(dir) {
    const st = this.requireFlight();
    const up = this.up();
    const east = this.east();
    let v;
    switch (dir) {
      case 'prograde':
        v = st.vel.clone();
        break;
      case 'retrograde':
        v = st.vel.clone().negate();
        break;
      case 'up':
      case 'radial_out':
        v = up;
        break;
      case 'east':
        v = east;
        break;
      case 'radial_in':
        v = up.clone().negate();
        break;
      default:
        throw new Error(
          `Invalid point dir "${dir}". Use: prograde, retrograde, up, east, radial_out, radial_in`,
        );
    }
    if (v.lengthSq() < 1e-12) v = up.clone();
    st.quat.setFromUnitVectors(Y, v.normalize());
    st.angVel.set(0, 0, 0);
    if (st.sas && st.sasMode === 'hold') st.sasTarget.copy(st.quat);
    return { pointed: dir, ...this.telemetry() };
  }

  setLegs(down) {
    this.requireFlight();
    const want = !!down;
    let n = 0;
    for (const p of this.st.parts) {
      if (p.def.legs) {
        p.legsDown = want;
        n++;
      }
    }
    return { legs: want, parts: n, ...this.telemetry() };
  }

  armChutes() {
    this.requireFlight();
    let n = 0;
    for (const p of this.st.parts) {
      if (p.def.chute) {
        p.chuteState = 'armed';
        n++;
      }
    }
    return { chutes: 'armed', parts: n, ...this.telemetry() };
  }

  step(seconds = 1, dt = DEFAULT_DT) {
    this.requireFlight();
    const simTime = Math.min(STEP_CAP_S, Math.max(0, Number(seconds) || 0));
    const h = dt > 0 ? dt : DEFAULT_DT;
    const n = Math.round(simTime / h);
    const collected = [];
    for (let i = 0; i < n; i++) {
      physicsStep(this.st, h, this.events);
      this.st.t += h;
      for (const ev of this.events) {
        collected.push(serializeEvent(ev));
        if (ev.type === 'liftoff') this.liftedOff = true;
        if (ev.type === 'crashed') this.st.dead = true;
        if (ev.type === 'overheat' && ev.part?.def?.pod) this.st.dead = true;
      }
      this.lastEvents = this.events.splice(0, this.events.length);
      if (this.st.dead) break;
    }
    const tlm = this.telemetry();
    tlm.events = collected;
    tlm.stepped_s = n * h;
    return tlm;
  }

  /** On-rails coast when engines are off and out of atmosphere; else step. */
  coast(seconds) {
    const st = this.requireFlight();
    const cap = Math.min(STEP_CAP_S, Math.max(0, Number(seconds) || 0));
    const body = BODIES[st.body];
    const alt = this.alt();
    const thrusting = st.throttle > 0 && st.parts.some((p) => p.alive && p.ignited && p.def.engine);
    if (st.landed || st.dead || thrusting || alt < (body.atmoHeight || 0) + 2000) {
      return this.step(cap);
    }
    let el;
    try {
      el = elementsFromState(st.pos, st.vel, body.mu, st.t);
    } catch {
      return this.step(cap);
    }
    const collected = [];
    const t0 = st.t;
    const dt = Math.min(10, Math.max(1, cap / 20));
    while (st.t - t0 < cap) {
      st.t += dt;
      const { pos, vel } = propagate(el, st.t);
      if (pos.length() - BODIES[st.body].radius < 22_000) {
        st.t -= dt;
        const remain = cap - (st.t - t0);
        const rest = this.step(remain);
        rest.events = collected.concat(rest.events || []);
        rest.coast = 'fell-back-to-step';
        return rest;
      }
      st.pos.copy(pos);
      st.vel.copy(vel);
      const soiEvents = [];
      checkSOI(st, soiEvents);
      if (soiEvents.length) {
        for (const ev of soiEvents) collected.push({ type: ev.type, body: ev.body });
        el = elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
      }
    }
    this.lastEvents = collected;
    const tlm = this.telemetry();
    tlm.events = collected;
    tlm.stepped_s = st.t - t0;
    tlm.coast = 'rails';
    return tlm;
  }
}
