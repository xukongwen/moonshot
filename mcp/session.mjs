// Headless Moonshot sim session. Reuses the game physics exactly like
// tests/mission.test.mjs — vessels[] + activeId, this.st aliases the active ship.

import { Vector3, Quaternion } from 'three';
import { STOCK } from '../src/stock.js';
import { BODIES, getBodyState, getRelativeState, PAD_DIR, PAD_ALTITUDE } from '../src/constants.js';
import { buildVesselParts, buildStagePlan, stackGeometry, computeSections, massProps } from '../src/vessel.js';
import { physicsStep, checkSOI } from '../src/physics.js';
import { elementsFromState, propagate, findMunEncounter, munTransferPhase, stateFromKepler } from '../src/orbits.js';
import { heightAt } from '../src/terrain.js';
import { setLang } from '../src/i18n.js';
import { Workshop } from './workshop.mjs';
import { serializeSnapshot, applySnapshotToState } from './snapshot.mjs';
import { buildSave, validateSave } from '../src/save.js';
import {
  evaluateCapture, applyWeld, weldFromStates, serializeWeld, hydrateWeld,
} from '../src/docking.js';

const Y = new Vector3(0, 1, 0);
const STEP_CAP_S = 120;
const DEFAULT_DT = 0.05;
const RAILS_DIST_M = 50_000;
export const WARP_LEVELS = [1, 2, 3, 4, 10, 100, 1000, 10000, 100000];

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

function resolveDesign(design) {
  if (typeof design === 'string') {
    const src = STOCK[design];
    if (!src) {
      throw new Error(`Unknown craft "${design}". Available: ${Object.keys(STOCK).join(', ')}`);
    }
    const d = structuredClone(src);
    d.name = design;
    d.radials ??= [];
    return d;
  }
  if (!design || !Array.isArray(design.stack)) {
    throw new Error('Invalid design: expected { name, stack, radials } or a stock craft name');
  }
  const d = structuredClone(design);
  d.radials ??= [];
  return d;
}

function makeState({ parts, body, pos, vel, quat, t, landed }) {
  const geom0 = stackGeometry(parts);
  const mp0 = massProps(parts, geom0);
  return {
    t: t ?? 0,
    body,
    pos,
    vel,
    quat,
    angVel: new Vector3(),
    throttle: 0,
    landed: !!landed,
    dead: false,
    parts,
    geom: geom0,
    sections: computeSections(parts),
    massProps: mp0,
    controls: { pitch: 0, yaw: 0, roll: 0 },
    translate: { x: 0, y: 0, z: 0 },
    sas: false,
    sasMode: 'hold',
    sasTarget: quat.clone(),
  };
}

export class SimSession {
  constructor(opts = {}) {
    this.vessels = [];
    this.activeId = null;
    this.targetId = null;
    this.weld = null;
    this.dockState = 'free';
    this._idSeq = 1;
    this.events = [];
    this.lastEvents = [];
    this.workshop = new Workshop(opts.workshop ?? {});
    this.lastDesign = null;
    this.warpIdx = 0;
    this.mapOpen = false;
    this.cam = { az: 0.5, el: 0.25, dist: 28 };
    this.lang = 'en';
  }

  activeVessel() {
    if (!this.activeId) return null;
    return this.vessels.find((v) => v.id === this.activeId) ?? null;
  }

  vesselById(id) {
    if (id == null) return null;
    return this.vessels.find((v) => v.id === id) ?? null;
  }

  get st() {
    return this.activeVessel()?.st ?? null;
  }

  set st(value) {
    const v = this.activeVessel();
    if (v) v.st = value;
  }

  get plan() {
    return this.activeVessel()?.plan ?? [];
  }

  set plan(value) {
    const v = this.activeVessel();
    if (v) v.plan = value;
  }

  get stageIdx() {
    return this.activeVessel()?.stageIdx ?? 0;
  }

  set stageIdx(value) {
    const v = this.activeVessel();
    if (v) v.stageIdx = value;
  }

  get liftedOff() {
    return this.activeVessel()?.liftedOff ?? false;
  }

  set liftedOff(value) {
    const v = this.activeVessel();
    if (v) v.liftedOff = !!value;
  }

  get craftName() {
    return this.activeVessel()?.name ?? null;
  }

  set craftName(value) {
    const v = this.activeVessel();
    if (v) v.name = value;
  }

  hasFlight() {
    return this.activeVessel() != null;
  }

  newFlight(craftName = 'Mun Express') {
    const name = craftName || 'Mun Express';
    const designSrc = STOCK[name];
    if (!designSrc) {
      const available = Object.keys(STOCK).join(', ');
      throw new Error(`Unknown craft "${name}". Available: ${available}`);
    }
    const design = structuredClone(designSrc);
    design.name = name;
    return this.newFlightFromDesign(design);
  }

  /** Same pad spawn as newFlight, from an arbitrary VAB design. */
  newFlightFromDesign(design) {
    const d = resolveDesign(design);
    const parts = buildVesselParts(d);
    const geom0 = stackGeometry(parts);
    const mp0 = massProps(parts, geom0);
    const quat0 = new Quaternion().setFromUnitVectors(Y, PAD_DIR);
    const st = makeState({
      parts,
      body: 'kerbin',
      pos: PAD_DIR.clone().multiplyScalar(BODIES.kerbin.radius + PAD_ALTITUDE + 0.7 + mp0.comY),
      vel: new Vector3(),
      quat: quat0,
      t: 0,
      landed: true,
    });
    st.sas = false;
    const vessel = {
      id: 'active',
      name: d.name || 'Untitled Craft',
      design: structuredClone(d),
      st,
      plan: buildStagePlan(parts),
      stageIdx: 0,
      liftedOff: false,
    };
    this.vessels = [vessel];
    this.activeId = 'active';
    this.targetId = null;
    this.weld = null;
    this.dockState = 'free';
    this.events = [];
    this.lastEvents = [];
    this.lastDesign = structuredClone(d);
    this.warpIdx = 0;
    return this.telemetry();
  }

  /**
   * Place a ship in a Kepler orbit (circular OK: ap=pe).
   * Equatorial plane, true anomaly from +X, same convention as existing orbits.
   */
  spawnOrbital(design, opts = {}) {
    const d = resolveDesign(design);
    const body = opts.body || 'kerbin';
    if (!BODIES[body]) throw new Error(`Unknown body "${body}"`);
    const ap = opts.ap_m ?? opts.ap;
    const pe = opts.pe_m ?? opts.pe ?? ap;
    if (ap == null || pe == null) throw new Error('spawnOrbital requires ap_m and pe_m');
    const t0 = this.st?.t ?? 0;
    const kv = stateFromKepler(body, { ap_m: ap, pe_m: pe, ta_deg: opts.ta_deg ?? 0 });
    const parts = buildVesselParts(d);
    for (const p of parts) {
      if (p.def.engine) p.ignited = true;
    }
    const east = new Vector3(0, 1, 0).cross(kv.pos.clone().normalize());
    if (east.lengthSq() < 1e-12) east.set(0, 0, -1);
    east.normalize();
    const quat = new Quaternion().setFromUnitVectors(Y, kv.vel.lengthSq() > 1 ? kv.vel.clone().normalize() : east);
    const st = makeState({
      parts,
      body,
      pos: kv.pos,
      vel: kv.vel,
      quat,
      t: t0,
      landed: false,
    });
    st.sas = true;
    st.sasMode = 'hold';
    st.sasTarget.copy(quat);
    const id = opts.id != null ? String(opts.id) : String(this._idSeq++);
    if (this.vesselById(id)) throw new Error(`Vessel id "${id}" already exists`);
    const vessel = {
      id,
      name: opts.name || d.name || `Vessel ${id}`,
      design: structuredClone(d),
      st,
      plan: buildStagePlan(parts),
      stageIdx: 0,
      liftedOff: true,
    };
    this.vessels.push(vessel);
    if (!this.activeId) this.activeId = id;
    return { id: vessel.id, name: vessel.name, ...this.telemetry() };
  }

  listVessels() {
    return this.vessels.map((v) => {
      const st = v.st;
      const alt = st.pos.length() - BODIES[st.body].radius;
      let situation = 'flight';
      if (st.dead) situation = 'dead';
      else if (st.landed && !v.liftedOff) situation = 'prelaunch';
      else if (st.landed) situation = 'landed';
      return {
        id: v.id,
        name: v.name,
        body: st.body,
        alt_m: alt,
        situation,
        active: v.id === this.activeId,
      };
    });
  }

  setTarget(id) {
    if (id == null || id === '' || id === 'null') {
      this.targetId = null;
      return { target: null, ...this.telemetry() };
    }
    const v = this.vesselById(String(id));
    if (!v) throw new Error(`Unknown vessel "${id}"`);
    this.targetId = v.id;
    return { target: this.targetId, ...this.telemetry() };
  }

  setTranslate({ x, y, z } = {}) {
    this.requireFlight();
    const tr = this.st.translate ?? (this.st.translate = { x: 0, y: 0, z: 0 });
    if (x != null) tr.x = clamp(x, -1, 1);
    if (y != null) tr.y = clamp(y, -1, 1);
    if (z != null) tr.z = clamp(z, -1, 1);
    return { translate: { ...tr }, ...this.telemetry() };
  }

  relativeNav() {
    const act = this.activeVessel();
    const tgt = this.vesselById(this.targetId);
    if (!act || !tgt || tgt.id === act.id || tgt.st.body !== act.st.body) {
      return {
        target: this.targetId,
        range_m: null,
        closing_ms: null,
        rel_speed_ms: null,
        phase_deg: null,
      };
    }
    const rel = tgt.st.pos.clone().sub(act.st.pos);
    const range = rel.length();
    const relVel = tgt.st.vel.clone().sub(act.st.vel);
    const closing = range > 1e-6 ? relVel.dot(rel.clone().normalize()) : 0;
    const rv = act.st.pos.clone().normalize();
    const rm = tgt.st.pos.clone().normalize();
    const cr = new Vector3().crossVectors(rv, rm);
    let phase = Math.atan2(cr.y, rv.dot(rm)) * 180 / Math.PI;
    if (phase < 0) phase += 360;
    return {
      target: tgt.id,
      range_m: range,
      closing_ms: closing,
      rel_speed_ms: relVel.length(),
      phase_deg: phase,
    };
  }

  pairForDock() {
    const act = this.activeVessel();
    if (!act) return null;
    if (this.targetId) {
      const tgt = this.vesselById(this.targetId);
      if (tgt && tgt.id !== act.id) return { a: act, b: tgt };
    }
    const other = this.vessels.find((v) => v.id !== act.id);
    return other ? { a: act, b: other } : null;
  }

  tryAutoDock() {
    if (this.weld || this.dockState === 'hard') return;
    const pair = this.pairForDock();
    if (!pair) return;
    if (pair.a.st.body !== pair.b.st.body) return;
    const ev = evaluateCapture(pair.a.st, pair.b.st);
    if (ev.ok) this.hardDock(pair.a, pair.b);
  }

  hardDock(a, b) {
    this.weld = weldFromStates(a.id, a.st, b.id, b.st);
    this.dockState = 'hard';
    applyWeld(a.st, b.st, this.weld);
  }

  dock() {
    this.requireFlight();
    if (this.weld) return { docked: true, dockState: 'hard', ...this.telemetry() };
    const pair = this.pairForDock();
    if (!pair) throw new Error('Need a second vessel (set a target) to dock');
    const ev = evaluateCapture(pair.a.st, pair.b.st);
    if (ev.ok) {
      this.hardDock(pair.a, pair.b);
      return {
        docked: true,
        dockState: 'hard',
        dist: ev.dist,
        axisAng: ev.axisAng,
        closing: ev.closing,
        ...this.telemetry(),
      };
    }
    return {
      docked: false,
      dockState: this.dockState,
      dist: ev.dist,
      axisAng: ev.axisAng,
      closing: ev.closing,
      reason: ev.reason,
      ...this.telemetry(),
    };
  }

  undock() {
    this.requireFlight();
    if (!this.weld) return { dockState: 'free', undocked: false, ...this.telemetry() };
    const a = this.vesselById(this.weld.a);
    const b = this.vesselById(this.weld.b);
    if (a && b) {
      const axis = new Vector3(0, 1, 0).applyQuaternion(a.st.quat);
      b.st.pos.addScaledVector(axis, 0.45);
      b.st.vel.copy(a.st.vel).addScaledVector(axis, 0.2);
    }
    this.weld = null;
    this.dockState = 'free';
    return { dockState: 'free', undocked: true, ...this.telemetry() };
  }

  launchWorkshop() {
    const v = this.workshop.validateLaunch();
    if (!v.ok) throw new Error(v.error);
    return this.newFlightFromDesign(this.workshop.design);
  }

  revert() {
    this.vessels = [];
    this.activeId = null;
    this.targetId = null;
    this.weld = null;
    this.dockState = 'free';
    this.events = [];
    this.lastEvents = [];
    this.warpIdx = 0;
    return { reverted: true, workshop: this.workshop.snapshot() };
  }

  relaunch() {
    if (!this.lastDesign) {
      throw new Error('No previous craft to relaunch. Launch from the VAB first.');
    }
    return this.newFlightFromDesign(this.lastDesign);
  }

  setWarp(level) {
    const idx = clamp(level, 0, WARP_LEVELS.length - 1);
    this.warpIdx = Math.round(idx);
    return {
      warpIdx: this.warpIdx,
      warp: WARP_LEVELS[this.warpIdx],
      rails: this.warpIdx > 3,
    };
  }

  setMap(open) {
    this.mapOpen = !!open;
    return { mapOpen: this.mapOpen };
  }

  setCamera({ az, el, dist } = {}) {
    if (az != null) this.cam.az = Number(az);
    if (el != null) this.cam.el = Number(el);
    if (dist != null) this.cam.dist = Number(dist);
    return { cam: { ...this.cam } };
  }

  setLang(lang) {
    if (lang !== 'en' && lang !== 'zh') {
      throw new Error(`Invalid lang "${lang}". Use: en, zh`);
    }
    this.lang = lang;
    setLang(lang);
    return { lang: this.lang };
  }

  requireFlight() {
    if (!this.st) throw new Error('No flight in progress. Call ksp_new_flight or ksp_vab_launch first.');
    return this.st;
  }

  refreshMass() {
    const st = this.st;
    if (!st) return;
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
    const nav = this.relativeNav();

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
      warpIdx: this.warpIdx,
      warp: WARP_LEVELS[this.warpIdx],
      mapOpen: this.mapOpen,
      cam: { ...this.cam },
      lang: this.lang,
      vessels: this.listVessels(),
      activeId: this.activeId,
      target: nav.target,
      range_m: nav.range_m,
      closing_ms: nav.closing_ms,
      rel_speed_ms: nav.rel_speed_ms,
      phase_deg: nav.phase_deg,
      dockState: this.dockState,
      translate: { ...(st.translate ?? { x: 0, y: 0, z: 0 }) },
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

  vesselCanRails(v) {
    if (!v || v.st.landed || v.st.dead) return false;
    const st = v.st;
    const thrusting = st.throttle > 0 && st.parts.some((p) => p.alive && p.ignited && p.def.engine);
    const translating = st.translate && (st.translate.x || st.translate.y || st.translate.z);
    const alt = st.pos.length() - BODIES[st.body].radius;
    if (thrusting || translating || alt < (BODIES[st.body].atmoHeight || 0) + 2000) return false;
    return true;
  }

  consumeEvents(v, evs, collected) {
    for (const ev of evs) {
      collected.push(serializeEvent(ev));
      if (ev.type === 'liftoff') v.liftedOff = true;
      if (ev.type === 'crashed') v.st.dead = true;
      if (ev.type === 'overheat' && ev.part?.def?.pod) v.st.dead = true;
    }
  }

  railsVessel(v, h, collected) {
    const st = v.st;
    const body = BODIES[st.body];
    let el;
    try {
      el = elementsFromState(st.pos, st.vel, body.mu, st.t);
    } catch {
      const evs = [];
      physicsStep(st, h, evs);
      st.t += h;
      this.consumeEvents(v, evs, collected);
      return;
    }
    st.t += h;
    const { pos, vel } = propagate(el, st.t);
    if (pos.length() - body.radius < 22_000) {
      st.t -= h;
      const evs = [];
      physicsStep(st, h, evs);
      st.t += h;
      this.consumeEvents(v, evs, collected);
      return;
    }
    st.pos.copy(pos);
    st.vel.copy(vel);
    const soiEvents = [];
    checkSOI(st, soiEvents);
    for (const ev of soiEvents) collected.push({ type: ev.type, body: ev.body });
  }

  tickAll(h, { railsOk }, collected) {
    const active = this.activeVessel();
    for (const v of this.vessels) {
      if (this.weld && v.id === this.weld.b) continue;
      const isActive = v.id === this.activeId;
      if (!isActive) {
        v.st.throttle = 0;
        v.st.translate = { x: 0, y: 0, z: 0 };
        v.st.controls.pitch = 0;
        v.st.controls.yaw = 0;
        v.st.controls.roll = 0;
        if (!v.st.sas) {
          v.st.sas = true;
          v.st.sasMode = 'hold';
          v.st.sasTarget.copy(v.st.quat);
        }
      }
      const dist = active && !isActive ? v.st.pos.distanceTo(active.st.pos) : 0;
      const useRails = (railsOk || dist > RAILS_DIST_M) && this.vesselCanRails(v);
      if (useRails) this.railsVessel(v, h, collected);
      else {
        const evs = [];
        physicsStep(v.st, h, evs);
        v.st.t += h;
        this.consumeEvents(v, evs, collected);
      }
    }
    if (this.weld) {
      const a = this.vesselById(this.weld.a);
      const b = this.vesselById(this.weld.b);
      if (a && b) applyWeld(a.st, b.st, this.weld);
      else {
        this.weld = null;
        this.dockState = 'free';
      }
    }
    this.tryAutoDock();
  }

  advanceAll(seconds, { forceRails = false, dt = DEFAULT_DT } = {}) {
    this.requireFlight();
    const cap = Math.min(STEP_CAP_S, Math.max(0, Number(seconds) || 0));
    const t0 = this.st.t;
    const collected = [];
    const railsWanted = forceRails || this.warpIdx > 3;
    if (railsWanted && this.vesselCanRails(this.activeVessel())) {
      const step = Math.min(10, Math.max(1, cap / 20));
      while (this.st.t - t0 < cap - 1e-9) {
        const h = Math.min(step, cap - (this.st.t - t0));
        this.tickAll(h, { railsOk: true }, collected);
        if (this.st.dead) break;
      }
    } else {
      const h = dt > 0 ? dt : DEFAULT_DT;
      const n = Math.round(cap / h);
      for (let i = 0; i < n; i++) {
        this.tickAll(h, { railsOk: this.warpIdx > 3 }, collected);
        if (this.st.dead) break;
      }
    }
    this.lastEvents = collected;
    const tlm = this.telemetry();
    tlm.events = collected;
    tlm.stepped_s = this.st.t - t0;
    tlm.coast = railsWanted && this.vesselCanRails(this.activeVessel()) ? 'rails' : 'physics';
    return tlm;
  }

  physicsAdvance(seconds = 1, dt = DEFAULT_DT) {
    return this.advanceAll(seconds, { forceRails: false, dt });
  }

  step(seconds = 1, dt = DEFAULT_DT) {
    this.requireFlight();
    if (this.warpIdx > 3) return this.coast(seconds);
    return this.physicsAdvance(seconds, dt);
  }

  /** On-rails coast when engines are off and out of atmosphere; else physics. */
  coast(seconds) {
    return this.advanceAll(seconds, { forceRails: true });
  }

  captureVesselBlock(v, slot) {
    return {
      id: v.id,
      name: v.name,
      design: {
        name: v.design?.name ?? v.name ?? '',
        stack: [...(v.design?.stack ?? [])],
        radials: structuredClone(v.design?.radials ?? []),
      },
      snapshot: serializeSnapshot(v.st, { tag: slot, craft: v.name }),
      stageIdx: v.stageIdx,
      liftedOff: !!v.liftedOff,
      sas: !!v.st.sas,
      sasMode: v.st.sasMode ?? 'hold',
      controls: {
        pitch: v.st.controls?.pitch ?? 0,
        yaw: v.st.controls?.yaw ?? 0,
        roll: v.st.controls?.roll ?? 0,
      },
      translate: { ...(v.st.translate ?? { x: 0, y: 0, z: 0 }) },
    };
  }

  captureSave(name) {
    const slot = String(name ?? '').trim();
    if (!slot) throw new Error('captureSave requires name');
    const w = this.workshop.snapshot();
    const workshop = {
      name: w.name,
      stack: w.stack,
      radials: w.radials,
      selected: w.selected,
    };
    const crafts = {};
    for (const [k, v] of Object.entries(this.workshop.readAll())) {
      crafts[k] = {
        name: v.name ?? k,
        stack: [...(v.stack ?? [])],
        radials: structuredClone(v.radials ?? []),
      };
    }
    let flight = null;
    let mode = 'vab';
    let vessels = null;
    if (this.hasFlight()) {
      mode = 'flight';
      const designSrc = this.lastDesign ?? this.activeVessel()?.design ?? this.workshop.design;
      const design = {
        name: designSrc.name ?? this.craftName ?? '',
        stack: [...(designSrc.stack ?? [])],
        radials: structuredClone(designSrc.radials ?? []),
      };
      flight = {
        craftName: this.craftName ?? design.name ?? '',
        design,
        snapshot: serializeSnapshot(this.st, { tag: slot, craft: this.craftName }),
        stageIdx: this.stageIdx,
        warpIdx: this.warpIdx,
        sas: !!this.st.sas,
        sasMode: this.st.sasMode ?? 'hold',
        controls: {
          pitch: this.st.controls?.pitch ?? 0,
          yaw: this.st.controls?.yaw ?? 0,
          roll: this.st.controls?.roll ?? 0,
        },
        mapOpen: !!this.mapOpen,
        cam: { ...this.cam },
        liftedOff: !!this.liftedOff,
      };
      vessels = this.vessels.map((v) => this.captureVesselBlock(v, slot));
    }
    return buildSave({
      name: slot,
      mode,
      lang: this.lang,
      workshop,
      crafts,
      flight,
      vessels,
      activeId: this.activeId,
      targetId: this.targetId,
      weld: serializeWeld(this.weld),
      dockState: this.dockState,
    });
  }

  applyVesselRecord(rec) {
    const design = rec.design ?? { name: rec.name, stack: ['pod-mk1'], radials: [] };
    const d = resolveDesign(design);
    const parts = buildVesselParts(d);
    const quat0 = new Quaternion();
    const st = makeState({
      parts,
      body: 'kerbin',
      pos: new Vector3(),
      vel: new Vector3(),
      quat: quat0,
      t: 0,
      landed: true,
    });
    if (rec.snapshot) applySnapshotToState(st, rec.snapshot);
    st.geom = stackGeometry(st.parts);
    st.sections = computeSections(st.parts);
    st.massProps = massProps(st.parts, st.geom);
    if (rec.sas != null) st.sas = !!rec.sas;
    if (rec.sasMode) st.sasMode = rec.sasMode;
    if (rec.controls) {
      st.controls.pitch = rec.controls.pitch ?? 0;
      st.controls.yaw = rec.controls.yaw ?? 0;
      st.controls.roll = rec.controls.roll ?? 0;
    }
    if (rec.translate) {
      st.translate = {
        x: rec.translate.x ?? 0,
        y: rec.translate.y ?? 0,
        z: rec.translate.z ?? 0,
      };
    }
    return {
      id: String(rec.id ?? this._idSeq++),
      name: rec.name || d.name || 'Vessel',
      design: structuredClone(d),
      st,
      plan: buildStagePlan(st.parts),
      stageIdx: Number(rec.stageIdx) || 0,
      liftedOff: !!rec.liftedOff,
    };
  }

  applySave(doc) {
    validateSave(doc);
    const w = doc.workshop;
    this.workshop.design = {
      name: w.name ?? '',
      stack: Array.isArray(w.stack) ? [...w.stack] : [],
      radials: Array.isArray(w.radials) ? structuredClone(w.radials) : [],
    };
    const sel = Number(w.selected);
    this.workshop.selected = Number.isInteger(sel) ? sel : -1;
    if (this.workshop.selected >= this.workshop.design.stack.length) {
      this.workshop.selected = this.workshop.design.stack.length - 1;
    }

    if (doc.crafts && typeof doc.crafts === 'object' && !Array.isArray(doc.crafts)) {
      const all = this.workshop.readAll();
      for (const [k, v] of Object.entries(doc.crafts)) {
        if (v && typeof v === 'object') all[k] = structuredClone(v);
      }
      this.workshop.writeAll(all);
    }

    if (doc.lang === 'en' || doc.lang === 'zh') this.setLang(doc.lang);

    const multi = Array.isArray(doc.vessels) && doc.vessels.length > 0;
    if (doc.mode === 'flight' && (multi || doc.flight?.design)) {
      if (multi) {
        this.vessels = doc.vessels.map((rec) => this.applyVesselRecord(rec));
        this.activeId = doc.activeId && this.vesselById(doc.activeId)
          ? doc.activeId
          : this.vessels[0].id;
        this.targetId = doc.targetId && this.vesselById(doc.targetId) ? doc.targetId : null;
        this.weld = hydrateWeld(doc.weld);
        this.dockState = doc.dockState ?? (this.weld ? 'hard' : 'free');
        if (this.weld) {
          const a = this.vesselById(this.weld.a);
          const b = this.vesselById(this.weld.b);
          if (a && b) applyWeld(a.st, b.st, this.weld);
        }
      } else {
        const f = doc.flight;
        this.newFlightFromDesign(f.design);
        if (f.craftName) this.craftName = f.craftName;
        if (f.snapshot) applySnapshotToState(this.st, f.snapshot);
        this.refreshMass();
        if (f.stageIdx != null) this.stageIdx = Number(f.stageIdx) || 0;
        if (f.sas != null) this.st.sas = !!f.sas;
        if (f.sasMode) this.st.sasMode = f.sasMode;
        if (f.controls) {
          this.st.controls.pitch = f.controls.pitch ?? 0;
          this.st.controls.yaw = f.controls.yaw ?? 0;
          this.st.controls.roll = f.controls.roll ?? 0;
        }
        if (f.liftedOff != null) this.liftedOff = !!f.liftedOff;
      }
      const f = doc.flight;
      if (f?.warpIdx != null) this.warpIdx = Number(f.warpIdx) || 0;
      if (f?.mapOpen != null) this.mapOpen = !!f.mapOpen;
      if (f?.cam) {
        if (f.cam.az != null) this.cam.az = Number(f.cam.az);
        if (f.cam.el != null) this.cam.el = Number(f.cam.el);
        if (f.cam.dist != null) this.cam.dist = Number(f.cam.dist);
      }
      this.lastDesign = structuredClone(this.activeVessel()?.design ?? this.lastDesign);
      return this.telemetry();
    }

    this.revert();
    return this.workshop.snapshot();
  }
}
