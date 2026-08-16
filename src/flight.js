// Flight director: owns the flight scene, state, time warp, staging,
// camera, HUD wiring, map view, debris, milestones.

import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import {
  BODIES, getBodyState, getRelativeState, childrenOf, PAD_DIR, PAD_ALTITUDE, fmtDist,
} from './constants.js';
import { density, pressureAtm } from './aero.js';
import {
  elementsFromState, propagate, timeToApoapsis, timeToPeriapsis,
  findMunEncounter, findEncounter, munTransferPhase,
  planetPhaseDeg, hohmannTransfer, stateFromKepler,
} from './orbits.js';
import { evaluateCapture, applyWeld, weldFromStates, placeFacingPorts } from './docking.js';
import { physicsStep, checkSOI, stepDebris } from './physics.js';
import { buildVesselParts, buildStagePlan, stackGeometry, computeSections, massProps, partY } from './vessel.js';
import { buildVesselGroup, buildPartMesh, setLegs, setCanopies } from './vesselviz.js';
import { TerrainPatch, makePlanetTexture, heightAt } from './terrain.js';
import {
  makePlume, updatePlume, makeAtmosphere, makeSun, makeStars, makePlasma, ExplosionPool,
} from './effects.js';
import { HUD } from './hud.js';
import { MapView } from './map.js';
import { Navball } from './navball.js';
import { SoundFX } from './sound.js';
import { t, bodyName, getLang } from './i18n.js';
import { loadDemoIfEmpty } from './agent-ui.js';

const WARP_LEVELS = [1, 2, 3, 4, 10, 100, 1000, 10000, 100000];
const PHYS_DT = 0.02;
const SUNDIR = new THREE.Vector3(1, 0.25, 0.45).normalize();
const $ = (id) => document.getElementById(id);

export class Flight {
  constructor({ renderer, onRevert }) {
    this.renderer = renderer;
    this.onRevert = onRevert;
    this.active = false;
    this.sound = new SoundFX();
  }

  async init() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 1e12);
    this.camCtl = { az: 0.5, el: 0.25, dist: 28 };

    this.scene.add(new THREE.AmbientLight(0x445566, 0.5));
    this.sunLight = new THREE.DirectionalLight(0xfff3e0, 2.8);
    this.sunLight.position.copy(SUNDIR);
    this.scene.add(this.sunLight);

    this.planetTex = {
      kerbin: makePlanetTexture('kerbin', 1024, 512),
      mun: makePlanetTexture('mun', 1024, 512),
      minmus: makePlanetTexture('minmus', 1024, 512),
      duna: makePlanetTexture('duna', 1024, 512),
    };

    this.bodyMeshes = {};
    const meshSpec = {
      kerbol: { shrink: 0, seg: [48, 24], basic: true },
      kerbin: { shrink: 400, seg: [128, 64], rough: 0.9 },
      mun: { shrink: 250, seg: [96, 48], rough: 1 },
      minmus: { shrink: 80, seg: [64, 32], rough: 1 },
      duna: { shrink: 200, seg: [96, 48], rough: 0.95 },
    };
    for (const [k, b] of Object.entries(BODIES)) {
      const spec = meshSpec[k] ?? { shrink: 100, seg: [48, 24], rough: 1 };
      let mat;
      if (spec.basic) {
        mat = new THREE.MeshBasicMaterial({ color: b.color ?? 0xffee66 });
      } else if (this.planetTex[k]) {
        mat = new THREE.MeshStandardNodeMaterial({ map: this.planetTex[k], roughness: spec.rough });
      } else {
        mat = new THREE.MeshStandardNodeMaterial({ color: b.color ?? 0x888888, roughness: spec.rough });
      }
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(1, b.radius - spec.shrink), spec.seg[0], spec.seg[1]),
        mat,
      );
      this.bodyMeshes[k] = mesh;
      this.scene.add(mesh);
    }
    this.kerbinMesh = this.bodyMeshes.kerbin;
    this.munMesh = this.bodyMeshes.mun;

    this.sunDirU = uniform(SUNDIR.clone());
    this.atmoCenterU = uniform(new THREE.Vector3());
    this.atmoMesh = makeAtmosphere(BODIES.kerbin.radius, this.sunDirU, this.atmoCenterU);
    this.scene.add(this.atmoMesh);

    this.sunSprite = makeSun();
    this.scene.add(this.sunSprite);
    const stars = makeStars();
    this.stars = stars.points;
    this.starsFade = stars.fadeU;
    this.stars.scale.setScalar(8e10);
    this.scene.add(this.stars);

    // launch pad
    this.pad = new THREE.Group();
    const slab = new THREE.Mesh(
      new THREE.CylinderGeometry(14, 16, 0.5, 8),
      new THREE.MeshStandardNodeMaterial({ color: 0x55585e, roughness: 0.9 }),
    );
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 26, 1.2),
      new THREE.MeshStandardNodeMaterial({ color: 0x8a2e2e, roughness: 0.8 }),
    );
    tower.position.set(8, 13, 0);
    this.pad.add(slab, tower);
    this.pad.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), PAD_DIR);
    this.scene.add(this.pad);

    this.patch = new TerrainPatch();
    this.boom = new ExplosionPool(this.scene);
    this.plasma = makePlasma();
    this.scene.add(this.plasma.mesh);

    this.map = new MapView(this.planetTex);
    this.navball = new Navball($('navball-slot'));
    await this.navball.init();

    this.bindUI();
    this.bindInput();
  }

  // -------------------------------------------------------------------------
  // lifecycle
  // -------------------------------------------------------------------------

  start(design) {
    if (typeof this.pilotCancel === 'function') {
      const fn = this.pilotCancel;
      this.pilotCancel = null;
      this.pilot = null;
      fn();
    }
    this.pilot = null;
    this.design = design;
    this.cleanupVessel();
    this.debris?.forEach((d) => this.scene.remove(d.group));
    this.debris = [];
    HUD.hideEndcard();

    const parts = buildVesselParts(design);
    const geom = stackGeometry(parts);
    const mp = massProps(parts, geom);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), PAD_DIR);

    this.st = {
      t: 0, met: 0, body: 'kerbin',
      pos: PAD_DIR.clone().multiplyScalar(BODIES.kerbin.radius + PAD_ALTITUDE + 0.7 + mp.comY),
      vel: new THREE.Vector3(),
      quat, angVel: new THREE.Vector3(),
      throttle: 0, landed: true, dead: false,
      parts, geom, sections: computeSections(parts), massProps: mp,
      controls: { pitch: 0, yaw: 0, roll: 0 },
      translate: { x: 0, y: 0, z: 0 },
      sas: true, sasMode: 'hold', sasTarget: quat.clone(),
      elements: null,
    };
    this.plan = buildStagePlan(parts);
    this.stageIndex = 0;
    this.vessels = [{
      id: 'active', name: design.name, design, st: this.st,
      plan: this.plan, stageIdx: 0, liftedOff: false,
    }];
    this.activeId = 'active';
    this.targetId = null;
    this.weld = null;
    this.dockState = 'free';
    this._idSeq = 1;
    this.clearOtherViz();
    this.flags = { liftoff: false, space: false, orbit: false, munSoi: false, munLanded: false };
    this.warpIdx = 0;
    this.rails = false;
    this.mapOpen = false;
    this.legsDeployed = false;
    this.lastInfo = null;
    this.encounter = null;
    this.encTimer = 0;
    this.hudTimer = 0;
    this.camCtl.dist = Math.max(20, this.st.geom.totalLength * 2.2);

    this.refreshViz();
    this.active = true;
    $('flight-ui').classList.remove('hidden');
    HUD.msg(t('msg.pad', { name: design.name }));
    HUD.setSituation(t('sit.prelaunch', { body: getLang() === 'en' ? bodyName('kerbin').toUpperCase() : bodyName('kerbin') }));
    HUD.stages(this.plan, 0, this.st.parts, this.st.sections);
    loadDemoIfEmpty();
  }

  /**
   * Replay a headless snapshot (logs/snapshots/*.json) onto the live Flight.
   * Matches parts by stackIndex + stack/radial (VAB rebuilds keys).
   */
  applySnapshot(json) {
    const snap = typeof json === 'string' ? JSON.parse(json) : json;
    if (!snap) return false;
    if (!this.st) {
      if (!this.design) return false;
      this.start(this.design);
    }
    HUD.hideEndcard();
    this.debris?.forEach((d) => this.scene.remove(d.group));
    this.debris = [];

    const st = this.st;
    st.t = Number(snap.t) || 0;
    st.met = st.t;
    st.body = snap.body || 'kerbin';
    st.pos.set(snap.pos[0], snap.pos[1], snap.pos[2]);
    st.vel.set(snap.vel[0], snap.vel[1], snap.vel[2]);
    st.quat.set(snap.quat[0], snap.quat[1], snap.quat[2], snap.quat[3]);
    st.angVel.set(0, 0, 0);
    st.throttle = snap.throttle ?? 0;
    st.landed = !!snap.landed;
    st.dead = !!snap.dead;
    st.sas = true;
    st.sasMode = 'hold';
    st.sasTarget.copy(st.quat);
    st.controls = { pitch: 0, yaw: 0, roll: 0 };

    if (this.design) {
      st.parts = buildVesselParts(this.design);
      this.plan = buildStagePlan(st.parts);
    }

    const used = new Set();
    const keep = [];
    for (const sp of snap.parts ?? []) {
      const radial = String(sp.key || '').startsWith('r');
      const cands = st.parts.filter((p) =>
        !used.has(p.key) &&
        p.stackIndex === sp.stackIndex &&
        (radial ? p.kind === 'radial' : p.kind === 'stack'));
      const p = cands.find((q) => q.key === sp.key) || cands[0];
      if (!p) continue;
      used.add(p.key);
      if (sp.fuel != null) p.fuel = sp.fuel;
      p.ignited = !!sp.ignited;
      if (sp.chuteState != null) p.chuteState = sp.chuteState;
      if (sp.legsDown != null) p.legsDown = sp.legsDown;
      p.alive = sp.alive !== false;
      keep.push(p);
    }
    st.parts = keep;
    st.geom = stackGeometry(st.parts);
    st.sections = computeSections(st.parts);
    st.massProps = massProps(st.parts, st.geom);

    this.legsDeployed = st.parts.some((p) => p.legsDown);
    this.warpIdx = 0;
    this.rails = false;
    this.encounter = null;
    this.encTimer = 0;
    this.inferStageIndex();

    const alt = st.pos.length() - BODIES[st.body].radius;
    this.flags.liftoff = !st.landed || st.t > 1;
    this.flags.space = alt > (BODIES[st.body].atmoHeight || 0);
    this.flags.orbit = !st.landed && this.flags.space;
    this.flags.munSoi = st.body === 'mun';
    this.flags.munLanded = st.body === 'mun' && st.landed;

    this.lastInfo = {
      alt, agl: alt, speed: st.vel.length(), accelG: 0, maxTempFrac: 0,
      thrust: 0, perEngine: new Map(),
      rho: density(st.body, alt), press: pressureAtm(st.body, alt),
      qDyn: 0, flux: 0, plasma: 0, terrainH: 0,
    };

    if (st.landed) {
      this.camCtl.dist = Math.max(20, (st.geom.totalLength || 12) * 2.2);
      this.camCtl.el = 0.28;
      this.camCtl.az = 0.55;
    } else if (st.body === 'mun') {
      this.camCtl.dist = Math.min(2400, Math.max(500, alt * 0.0009));
      this.camCtl.el = -0.55;
      this.camCtl.az = 0.75;
    } else if (alt > 500_000) {
      this.camCtl.dist = 420;
      this.camCtl.el = -0.45;
      this.camCtl.az = 1.0;
    } else {
      this.camCtl.dist = 180;
      this.camCtl.el = -0.55;
      this.camCtl.az = 0.85;
    }

    this.refreshViz();
    this.active = true;
    $('flight-ui').classList.remove('hidden');
    this.hudTimer = 0;
    this.hudTick(1);
    HUD.msg(t('hud.snapshot', { tag: snap.tag || '', t: st.t.toFixed(0) }));
    if (this.mapOpen) this.refreshMapNow();
    return true;
  }

  /** After start(design) + applySnapshot, restore stage/warp/sas/cam/map. */
  applyGameExtras(block) {
    if (!this.st || !block) return;
    if (block.stageIdx != null) this.stageIndex = Number(block.stageIdx) || 0;
    if (block.warpIdx != null) this.setWarp(Number(block.warpIdx) || 0);
    if (block.sas != null) this.st.sas = !!block.sas;
    if (block.sasMode) this.st.sasMode = block.sasMode;
    if (block.controls) {
      this.st.controls.pitch = block.controls.pitch ?? 0;
      this.st.controls.yaw = block.controls.yaw ?? 0;
      this.st.controls.roll = block.controls.roll ?? 0;
    }
    if (block.mapOpen != null && !!block.mapOpen !== this.mapOpen) this.toggleMap();
    if (block.cam) {
      if (block.cam.az != null) this.camCtl.az = Number(block.cam.az);
      if (block.cam.el != null) this.camCtl.el = Number(block.cam.el);
      if (block.cam.dist != null) this.camCtl.dist = Number(block.cam.dist);
    }
    if (block.liftedOff != null && this.flags) this.flags.liftoff = !!block.liftedOff;
    HUD.stages(this.plan, this.stageIndex, this.st.parts, this.st.sections);
    this.refreshHUD();
  }

  inferStageIndex() {
    if (!this.plan?.length) { this.stageIndex = 0; return; }
    this.stageIndex = 0;
    for (let i = 0; i < this.plan.length; i++) {
      const ev = this.plan[i];
      let spent = false;
      if (ev.decouple !== null) {
        const still = this.st.parts.some((p) => p.kind === 'stack' && p.stackIndex >= ev.decouple && p.alive);
        if (!still) spent = true;
      }
      if (ev.dropRadials.length) {
        const still = ev.dropRadials.some((k) => this.st.parts.some((p) => p.key === k && p.alive));
        if (!still) spent = true;
      }
      if (ev.ignite.length) {
        const allLit = ev.ignite.every((k) => {
          const p = this.st.parts.find((q) => q.key === k);
          return !p || p.ignited;
        });
        if (allLit) spent = true;
      }
      if (ev.chutes) {
        const armed = this.st.parts.some((p) => p.def.chute && p.chuteState && p.chuteState !== 'stowed');
        if (armed) spent = true;
      }
      if (spent) this.stageIndex = i + 1;
      else break;
    }
  }

  stop() {
    if (typeof this.pilotCancel === 'function') {
      const fn = this.pilotCancel;
      this.pilotCancel = null;
      this.pilot = null;
      fn();
    }
    this.pilot = null;
    this.active = false;
    this.cleanupVessel();
    this.debris?.forEach((d) => this.scene.remove(d.group));
    this.debris = [];
    $('flight-ui').classList.add('hidden');
  }

  cleanupVessel() {
    if (this.vGroup) { this.scene.remove(this.vGroup); this.vGroup = null; }
    this.clearOtherViz();
  }

  clearOtherViz() {
    if (this.otherViz) {
      for (const g of this.otherViz.values()) this.scene.remove(g);
    }
    this.otherViz = new Map();
  }

  vesselById(id) {
    return this.vessels?.find((v) => v.id === id) ?? null;
  }

  putInOrbit({ body = 'kerbin', ap_m, pe_m, ta_deg = 0 } = {}) {
    if (!this.st) return false;
    const kv = stateFromKepler(body, { ap_m, pe_m: pe_m ?? ap_m, ta_deg });
    this.st.body = body;
    this.st.landed = false;
    this.st.dead = false;
    this.st.pos.copy(kv.pos);
    this.st.vel.copy(kv.vel);
    this.st.quat.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      kv.vel.lengthSq() > 1 ? kv.vel.clone().normalize() : new THREE.Vector3(0, 0, -1),
    );
    this.st.angVel.set(0, 0, 0);
    this.st.sas = true;
    this.st.sasMode = 'hold';
    this.st.sasTarget.copy(this.st.quat);
    this.st.elements = null;
    this.rails = false;
    this.warpIdx = 0;
    if (this.flags) this.flags.liftoff = true;
    this.camCtl.dist = 80;
    this.camCtl.el = -0.2;
    const alt = this.st.pos.length() - BODIES[body].radius;
    this.lastInfo = {
      alt, agl: alt, speed: this.st.vel.length(), accelG: 0, maxTempFrac: 0,
      thrust: 0, perEngine: new Map(), rho: 0, press: 0, qDyn: 0, flux: 0, plasma: 0, terrainH: 0,
    };
    this.hudTimer = 0;
    this.refreshHUD?.();
    return true;
  }

  spawnOrbital(design, opts = {}) {
    if (!design || !Array.isArray(design.stack)) {
      throw new Error('spawnOrbital needs a design');
    }
    const d = structuredClone(design);
    d.radials ??= [];
    const body = opts.body || 'kerbin';
    const t0 = this.st?.t ?? 0;
    const kv = stateFromKepler(body, {
      ap_m: opts.ap_m, pe_m: opts.pe_m ?? opts.ap_m, ta_deg: opts.ta_deg ?? 0,
    });
    const parts = buildVesselParts(d);
    for (const p of parts) if (p.def.engine) p.ignited = true;
    const geom = stackGeometry(parts);
    const mp = massProps(parts, geom);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      kv.vel.lengthSq() > 1 ? kv.vel.clone().normalize() : new THREE.Vector3(0, 0, -1),
    );
    const st = {
      t: t0, met: t0, body,
      pos: kv.pos, vel: kv.vel, quat, angVel: new THREE.Vector3(),
      throttle: 0, landed: false, dead: false,
      parts, geom, sections: computeSections(parts), massProps: mp,
      controls: { pitch: 0, yaw: 0, roll: 0 },
      translate: { x: 0, y: 0, z: 0 },
      sas: true, sasMode: 'hold', sasTarget: quat.clone(),
      elements: null,
    };
    if (!this.vessels) this.vessels = [];
    const id = opts.id != null ? String(opts.id) : String(this._idSeq++);
    const vessel = {
      id, name: opts.name || d.name || `Vessel ${id}`,
      design: d, st, plan: buildStagePlan(parts), stageIdx: 0, liftedOff: true,
    };
    this.vessels.push(vessel);
    this.ensureOtherViz(vessel);
    return vessel;
  }

  ensureOtherViz(v) {
    if (!this.otherViz) this.otherViz = new Map();
    if (v.id === this.activeId) return;
    if (this.otherViz.has(v.id)) return;
    const { group } = buildVesselGroup(v.st.parts);
    this.scene.add(group);
    this.otherViz.set(v.id, group);
  }

  setTarget(id) {
    this.targetId = id == null ? null : String(id);
    return this.targetId;
  }

  relativeNav() {
    const tgt = this.vesselById(this.targetId);
    if (!this.st || !tgt || tgt.st.body !== this.st.body) {
      return { target: this.targetId, range_m: null, closing_ms: null, rel_speed_ms: null };
    }
    const rel = tgt.st.pos.clone().sub(this.st.pos);
    const range = rel.length();
    const relVel = tgt.st.vel.clone().sub(this.st.vel);
    const closing = range > 1e-6 ? relVel.dot(rel.clone().normalize()) : 0;
    return { target: tgt.id, range_m: range, closing_ms: closing, rel_speed_ms: relVel.length() };
  }

  mapOthers() {
    return (this.vessels ?? [])
      .filter((v) => v.id !== this.activeId)
      .map((v) => ({
        id: v.id, name: v.name, body: v.st.body, pos: v.st.pos,
        target: v.id === this.targetId,
      }));
  }

  dock() {
    const tgt = this.vesselById(this.targetId) || (this.vessels ?? []).find((v) => v.id !== this.activeId);
    if (!this.st || !tgt) return { dockState: this.dockState ?? 'free', docked: false };
    const ev = evaluateCapture(this.st, tgt.st);
    if (ev.ok) {
      this.weld = weldFromStates(this.activeId, this.st, tgt.id, tgt.st);
      this.dockState = 'hard';
      applyWeld(this.st, tgt.st, this.weld);
      return { docked: true, dockState: 'hard', dist: ev.dist };
    }
    return { docked: false, dockState: this.dockState ?? 'free', dist: ev.dist, axisAng: ev.axisAng, closing: ev.closing };
  }

  undock() {
    if (!this.weld) return { dockState: 'free', undocked: false };
    const a = this.vesselById(this.weld.a);
    const b = this.vesselById(this.weld.b);
    if (a && b) {
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(a.st.quat);
      b.st.pos.addScaledVector(axis, 0.45);
      b.st.vel.copy(a.st.vel).addScaledVector(axis, 0.2);
    }
    this.weld = null;
    this.dockState = 'free';
    return { dockState: 'free', undocked: true };
  }

  placeFacingForShot(gap = 0.8) {
    const tgt = this.vesselById(this.targetId) || (this.vessels ?? []).find((v) => v.id !== this.activeId);
    if (!this.st || !tgt) return null;
    return placeFacingPorts(this.st, tgt.st, gap);
  }

  refreshViz() {
    this.cleanupVessel();
    const { group, meshByKey, plumeAnchors } = buildVesselGroup(this.st.parts);
    this.vGroup = group;
    this.meshByKey = meshByKey;
    this.plumes = [];
    for (const anchor of plumeAnchors) {
      for (const pos of anchor.positions) {
        const plume = makePlume(anchor.radius);
        plume.mesh.position.copy(pos);
        group.add(plume.mesh);
        this.plumes.push({ ...plume, key: anchor.key });
      }
    }
    setLegs(meshByKey, this.st.parts, this.legsDeployed);
    setCanopies(meshByKey, this.st.parts);
    this.scene.add(group);
  }

  // -------------------------------------------------------------------------
  // input + UI
  // -------------------------------------------------------------------------

  bindUI() {
    $('btn-revert').onclick = () => { this.stop(); this.onRevert(); };
    $('btn-end-revert').onclick = () => { this.stop(); this.onRevert(); };
    $('btn-end-relaunch').onclick = () => this.start(this.design);
    $('btn-map').onclick = () => this.toggleMap();
    $('btn-help').onclick = () => HUD.toggleHelp();
    $('btn-help-close').onclick = () => HUD.toggleHelp(false);
    $('btn-warp-up').onclick = () => this.setWarp(this.warpIdx + 1);
    $('btn-warp-down').onclick = () => this.setWarp(this.warpIdx - 1);
  }

  bindInput() {
    this.keys = {};
    addEventListener('keydown', (e) => {
      if (!this.active || e.target.tagName === 'INPUT') return;
      this.keys[e.code] = true;
      switch (e.code) {
        case 'Space': e.preventDefault(); this.stage(); break;
        case 'KeyT': this.st.sas = !this.st.sas; this.st.sasTarget.copy(this.st.quat); break;
        case 'Digit1': this.st.sasMode = 'hold'; this.st.sasTarget.copy(this.st.quat); break;
        case 'Digit2': this.st.sasMode = 'prograde'; break;
        case 'Digit3': this.st.sasMode = 'retrograde'; break;
        case 'KeyZ': this.setThrottle(1); break;
        case 'KeyX': this.setThrottle(0); break;
        case 'KeyG':
          this.legsDeployed = !this.legsDeployed;
          for (const p of this.st.parts) if (p.def.legs) p.legsDown = this.legsDeployed;
          setLegs(this.meshByKey, this.st.parts, this.legsDeployed);
          HUD.msg(this.legsDeployed ? t('msg.legsDeployed') : t('msg.legsStowed'));
          break;
        case 'KeyP':
          for (const p of this.st.parts) {
            if (p.alive && p.def.chute && p.chuteState === 'stowed') p.chuteState = 'armed';
          }
          HUD.msg(t('msg.chutesArmed'));
          break;
        case 'KeyM': this.toggleMap(); break;
        case 'F1': e.preventDefault(); HUD.toggleHelp(); break;
        case 'Comma': this.setWarp(this.warpIdx - 1); break;
        case 'Period': this.setWarp(this.warpIdx + 1); break;
      }
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    const dom = this.renderer.domElement;
    let dragging = false, lx = 0, ly = 0;
    dom.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
    addEventListener('pointerup', () => { dragging = false; });
    addEventListener('pointermove', (e) => {
      if (!dragging || !this.active) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (this.mapOpen) this.map.drag(dx, dy);
      else {
        this.camCtl.az += dx * 0.006;
        this.camCtl.el = THREE.MathUtils.clamp(this.camCtl.el + dy * 0.006, -1.35, 1.35);
      }
    });
    dom.addEventListener('wheel', (e) => {
      if (!this.active) return;
      const f = Math.pow(1.0015, e.deltaY);
      if (this.mapOpen) this.map.zoom(f);
      else this.camCtl.dist = THREE.MathUtils.clamp(this.camCtl.dist * f, 6, 2500);
    }, { passive: true });
  }

  setThrottle(v) {
    this.st.throttle = THREE.MathUtils.clamp(v, 0, 1);
    if (this.rails && v > 0) { this.setWarp(0); HUD.msg(t('msg.warpThrottle'), 'warn'); }
  }

  handleHeldKeys(dt) {
    const st = this.st;
    if (this.keys.ShiftLeft || this.keys.ShiftRight) this.setThrottle(st.throttle + dt * 0.6);
    if (this.keys.ControlLeft || this.keys.ControlRight) this.setThrottle(st.throttle - dt * 0.6);
    st.controls.pitch = (this.keys.KeyW ? -1 : 0) + (this.keys.KeyS ? 1 : 0);
    st.controls.yaw = (this.keys.KeyA ? -1 : 0) + (this.keys.KeyD ? 1 : 0);
    st.controls.roll = (this.keys.KeyQ ? -1 : 0) + (this.keys.KeyE ? 1 : 0);
    st.translate = st.translate || { x: 0, y: 0, z: 0 };
    st.translate.y = (this.keys.KeyI ? 1 : 0) + (this.keys.KeyK ? -1 : 0);
    st.translate.x = (this.keys.KeyL ? 1 : 0) + (this.keys.KeyJ ? -1 : 0);
    st.translate.z = (this.keys.KeyH ? 1 : 0) + (this.keys.KeyN ? -1 : 0);
  }

  toggleMap() {
    this.mapOpen = !this.mapOpen;
    if (this.mapOpen) this.refreshMapNow();
    this.navball.setVisible(!this.mapOpen);
  }

  // -------------------------------------------------------------------------
  // time warp
  // -------------------------------------------------------------------------

  enginesLit() {
    return this.st.throttle > 0.001 &&
      this.st.parts.some((p) => p.alive && p.ignited && p.def.engine && !p.def.engine.srb) ||
      this.st.parts.some((p) => p.alive && p.ignited && p.def.engine?.srb && p.fuel > 0);
  }

  setWarp(idx) {
    idx = THREE.MathUtils.clamp(idx, 0, WARP_LEVELS.length - 1);
    const st = this.st;
    if (idx > 3) {
      const focus = BODIES[st.body];
      const inAtmo = focus.atmoHeight &&
        st.pos.length() - focus.radius < focus.atmoHeight + 2000;
      if (!st.landed && (inAtmo || this.enginesLit())) {
        HUD.msg(t('msg.warpAtmo'), 'warn');
        idx = Math.min(idx, 3);
      }
    }
    this.warpIdx = idx;
    const goRails = idx > 3;
    if (goRails && !this.rails && !st.landed) {
      st.elements = elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
    }
    this.rails = goRails;
    HUD.setWarp(WARP_LEVELS[idx], this.rails);
  }

  // -------------------------------------------------------------------------
  // staging
  // -------------------------------------------------------------------------

  stage() {
    if (this.st.dead) return;
    this.sound.ensure();
    if (this.stageIndex >= this.plan.length) { HUD.msg(t('msg.noStages'), 'warn'); return; }
    if (this.rails) { this.setWarp(0); }
    const ev = this.plan[this.stageIndex++];
    const st = this.st;

    const structuralChange = ev.decouple !== null || ev.dropRadials.length > 0;
    if (ev.decouple !== null) this.jettisonStack(ev.decouple);
    if (ev.dropRadials.length) this.jettisonRadials(ev.dropRadials);

    for (const key of ev.ignite) {
      const p = st.parts.find((q) => q.key === key);
      if (p?.alive) p.ignited = true;
    }
    if (ev.ignite.length) {
      if (st.landed && st.throttle === 0) this.setThrottle(1);
      HUD.msg(ev.decouple !== null ? t('msg.sepIgnition') : t('msg.ignition'));
    }
    if (ev.chutes) {
      for (const p of st.parts) {
        if (p.alive && p.def.chute && p.chuteState === 'stowed') p.chuteState = 'armed';
      }
      HUD.msg(t('msg.chutesArmed'));
    }
    this.sound.stage();
    st.geom = stackGeometry(st.parts);
    st.sections = computeSections(st.parts);
    if (structuralChange) this.refreshViz(); // rebuild meshes without the jettisoned parts
    HUD.stages(this.plan, this.stageIndex, st.parts, st.sections);
  }

  nose() { return new THREE.Vector3(0, 1, 0).applyQuaternion(this.st.quat); }

  /** World position (render space, origin = vessel CoM) of a vessel-local point. */
  localToRender(local) {
    return local.clone().sub(new THREE.Vector3(0, this.st.massProps.comY, 0)).applyQuaternion(this.st.quat);
  }

  jettisonStack(idx) {
    const st = this.st;
    const removed = st.parts.filter((p) => p.stackIndex >= idx);
    if (!removed.length) return;
    st.parts = st.parts.filter((p) => p.stackIndex < idx);

    const sub = buildVesselGroup(removed);
    const len = sub.group.userData.geom.totalLength;
    const nose = this.nose();
    // removed chunk was the bottom of the stack: its centre sits len/2 above the old bottom
    const centerLocalY = len / 2;
    const d = {
      body: st.body,
      pos: st.pos.clone().addScaledVector(nose, centerLocalY - st.massProps.comY),
      vel: st.vel.clone().addScaledVector(nose, -2.5),
      mass: removed.reduce((s, p) => s + p.def.mass * p.sym + p.fuel, 0),
      cda: 2, spin: 0, dead: false,
      group: sub.group, quat: st.quat.clone(),
      axis: new THREE.Vector3().randomDirection(),
      comOffset: centerLocalY,
    };
    this.scene.add(d.group);
    this.debris.push(d);
    this.trimDebris();
  }

  jettisonRadials(keys) {
    const st = this.st;
    const nose = this.nose();
    for (const key of keys) {
      const p = st.parts.find((q) => q.key === key);
      if (!p) continue;
      st.parts = st.parts.filter((q) => q !== p);
      const host = st.parts.find((q) => q.kind === 'stack' && q.stackIndex === p.stackIndex);
      const hostR = host ? host.def.size / 2 : 0.625;
      const y = partY(st.geom, p);
      for (let i = 0; i < p.sym; i++) {
        const a = (i / p.sym) * Math.PI * 2;
        const offset = hostR + p.def.size / 2;
        const local = new THREE.Vector3(Math.cos(a) * offset, y, Math.sin(a) * offset);
        const outDir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).applyQuaternion(st.quat);
        const single = { ...p, sym: 1 };
        const mesh = buildPartMesh(single);
        const d = {
          body: st.body,
          pos: st.pos.clone().add(this.localToRender(local)),
          vel: st.vel.clone().addScaledVector(outDir, 7).addScaledVector(nose, -1),
          mass: p.def.mass + p.fuel / p.sym,
          cda: 0.8, spin: 0, dead: false,
          group: mesh, quat: st.quat.clone(),
          axis: outDir.clone(),
          comOffset: 0,
        };
        this.scene.add(d.group);
        this.debris.push(d);
      }
    }
    this.trimDebris();
  }

  trimDebris() {
    while (this.debris.length > 14) {
      const d = this.debris.shift();
      this.scene.remove(d.group);
    }
  }

  // -------------------------------------------------------------------------
  // per-frame
  // -------------------------------------------------------------------------

  frame(dt) {
    if (!this.active) return;
    dt = Math.min(dt, 0.1);
    this.handleHeldKeys(dt);
    if (typeof this.pilot === 'function') {
      try { this.pilot(dt); } catch (err) { console.error(err); this.pilot = null; }
    }
    const st = this.st;

    if (!st.dead) {
      if (this.rails) this.railsStep(dt);
      else this.physStep(dt);
    }

    this.updateScene(dt);
    this.hudTick(dt);

    if (this.mapOpen) {
      this.map.update(st, this.mapOthers());
      this.renderer.render(this.map.scene, this.map.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
      const up = st.pos.clone().normalize();
      this.navball.update(up, st.quat, st.vel);
    }
  }

  physStep(dt) {
    const st = this.st;
    const warp = WARP_LEVELS[this.warpIdx];
    const total = dt * warp;
    const n = Math.min(80, Math.ceil(total / PHYS_DT));
    const h = total / n;
    const events = [];
    for (let i = 0; i < n; i++) {
      this.lastInfo = physicsStep(st, h, events);
      st.t += h;
      if (this.flags.liftoff) st.met += h;
      for (const d of this.debris) if (!d.dead && d.body === st.body) stepDebris(d, h);
      if (st.dead) break;
    }
    this.debris = this.debris.filter((d) => {
      if (d.dead) this.scene.remove(d.group);
      return !d.dead;
    });
    this.processEvents(events);
    this.stepOtherVessels(total);
    this.milestones();
  }

  stepOtherVessels(total) {
    const n = Math.min(40, Math.ceil(total / PHYS_DT));
    const h = total / Math.max(1, n);
    const events = [];
    for (const v of this.vessels ?? []) {
      if (v.id === this.activeId) continue;
      if (this.weld && v.id === this.weld.b) continue;
      v.st.throttle = 0;
      v.st.translate = { x: 0, y: 0, z: 0 };
      const dist = v.st.pos.distanceTo(this.st.pos);
      const far = dist > 50_000 || this.rails;
      for (let i = 0; i < n; i++) {
        if (far && !v.st.landed) {
          try {
            const el = elementsFromState(v.st.pos, v.st.vel, BODIES[v.st.body].mu, v.st.t);
            v.st.t += h;
            const pv = propagate(el, v.st.t);
            v.st.pos.copy(pv.pos); v.st.vel.copy(pv.vel);
          } catch {
            physicsStep(v.st, h, events);
            v.st.t += h;
          }
        } else {
          physicsStep(v.st, h, events);
          v.st.t += h;
        }
      }
    }
    if (this.weld) {
      const a = this.vesselById(this.weld.a);
      const b = this.vesselById(this.weld.b);
      if (a && b) applyWeld(a.st, b.st, this.weld);
    } else if (this.targetId) {
      const tgt = this.vesselById(this.targetId);
      if (tgt) {
        const ev = evaluateCapture(this.st, tgt.st);
        if (ev.ok) {
          this.weld = weldFromStates(this.activeId, this.st, tgt.id, tgt.st);
          this.dockState = 'hard';
          applyWeld(this.st, tgt.st, this.weld);
        }
      }
    }
  }

  railsStep(dt) {
    const st = this.st;
    const warp = WARP_LEVELS[this.warpIdx];
    st.t += dt * warp;
    if (this.flags.liftoff) st.met += dt * warp;
    if (!st.landed && st.elements) {
      const { pos, vel } = propagate(st.elements, st.t);
      st.pos.copy(pos); st.vel.copy(vel);
      const events = [];
      checkSOI(st, events);
      if (events.length) {
        st.elements = elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
        this.processEvents(events);
      }
      const alt = st.pos.length() - BODIES[st.body].radius;
      if (BODIES[st.body].atmoHeight && alt < BODIES[st.body].atmoHeight + 1000) {
        this.setWarp(0);
        HUD.msg(t('msg.atmoWarp'), 'warn');
      }
      this.lastInfo = {
        alt, agl: alt, speed: st.vel.length(), accelG: 0, maxTempFrac: 0,
        thrust: 0, perEngine: new Map(), rho: 0, press: 0, qDyn: 0, flux: 0, plasma: 0,
        terrainH: 0,
      };
      // gentle cooldown on rails
      for (const p of st.parts) p.temp = Math.max(4, p.temp - 5 * dt * Math.min(warp, 100));
    }
    this.stepOtherVessels(dt * warp);
    this.milestones();
  }

  processEvents(events) {
    const st = this.st;
    for (const ev of events) {
      switch (ev.type) {
        case 'liftoff':
          if (!this.flags.liftoff) {
            this.flags.liftoff = true;
            HUD.banner(t('banner.liftoff'));
            HUD.msg(t('msg.liftoff'));
          }
          break;
        case 'landed': {
          if (st.body === 'mun' && !this.flags.munLanded) {
            this.flags.munLanded = true;
            HUD.banner(t('banner.munLand'), 6000);
            HUD.msg(t('msg.touchdownFlag', { speed: ev.speed.toFixed(1) }));
          } else if (st.body === 'kerbin' && this.flags.liftoff) {
            const verb = ev.water ? t('verb.splashdown') : t('verb.touchdown');
            HUD.msg(ev.water
              ? t('msg.splashdownSpeed', { speed: ev.speed.toFixed(1) })
              : t('msg.touchdownSpeed', { speed: ev.speed.toFixed(1) }));
            if (this.flags.munLanded) {
              HUD.banner(t('banner.roundtrip'));
              HUD.endcard(t('end.complete'), t('end.completeText', { verb }), true);
            } else if (this.flags.space || this.flags.orbit) {
              HUD.endcard(t('end.recovery'), t('end.recoveryText', { verb, where: bodyName(st.body) }), true);
            }
          } else {
            HUD.msg(t('msg.landedSpeed', { speed: ev.speed.toFixed(1) }));
          }
          break;
        }
        case 'crashed': {
          st.dead = true;
          this.sound.explosion();
          this.boom.spawn(new THREE.Vector3(0, 0, 0), 14);
          if (this.vGroup) this.vGroup.visible = false;
          HUD.endcard(t('end.crash'),
            t('end.crashText', {
              speed: ev.speed.toFixed(0),
              body: bodyName(st.body),
              hint: ev.speed < 20 ? t('end.crashClose') : t('end.crashCrater'),
            }));
          break;
        }
        case 'overheat': {
          this.sound.explosion();
          const mesh = this.meshByKey?.get(ev.part.key);
          if (mesh) {
            mesh.visible = false;
            this.boom.spawn(mesh.getWorldPosition(new THREE.Vector3()).sub(this.vGroupWorldShift()), 5);
          }
          HUD.msg(t('msg.overheat', { name: ev.part.def.name }), 'bad');
          if (ev.part.def.pod) {
            st.dead = true;
            HUD.endcard(t('end.burned'), t('end.burnedText'));
          }
          break;
        }
        case 'chute':
          this.sound.chute();
          HUD.msg(t('msg.chuteDeploy'));
          setCanopies(this.meshByKey, st.parts);
          break;
        case 'chute-torn':
          HUD.msg(t('msg.chuteTorn'), 'bad');
          this.sound.warn();
          setCanopies(this.meshByKey, st.parts);
          break;
        case 'soi':
          if (ev.body === 'mun') {
            this.flags.munSoi = true;
            HUD.banner(t('banner.munSoi'));
          } else if (ev.body === 'kerbin') {
            HUD.msg(t('msg.kerbinSpace'));
          } else {
            const soiName = getLang() === 'en' ? bodyName(ev.body).toUpperCase() : bodyName(ev.body);
            HUD.banner(t('banner.soi', { name: soiName }));
          }
          this.encounter = null;
          if (this.mapOpen) this.refreshMapNow();
          break;
      }
    }
  }

  vGroupWorldShift() { return new THREE.Vector3(); } // explosions are near origin anyway

  milestones() {
    const st = this.st;
    const alt = st.pos.length() - BODIES[st.body].radius;
    if (!this.flags.space && st.body === 'kerbin' && alt > BODIES.kerbin.atmoHeight) {
      this.flags.space = true;
      HUD.banner(t('banner.space'));
    }
    if (!this.flags.orbit && st.body === 'kerbin' && this.curEls) {
      const els = this.curEls;
      if (els.a > 0 && els.rp > BODIES.kerbin.radius + BODIES.kerbin.atmoHeight) {
        this.flags.orbit = true;
        HUD.banner(t('banner.orbit'));
      }
    }
  }

  // -------------------------------------------------------------------------
  // rendering
  // -------------------------------------------------------------------------

  updateScene(dt) {
    const st = this.st;
    const origin = st.pos;
    const far = this.camera.far * 0.9;
    for (const [name, mesh] of Object.entries(this.bodyMeshes)) {
      const rel = getRelativeState(name, st.body, st.t);
      mesh.position.copy(rel.pos).sub(origin);
      mesh.visible = mesh.position.length() < far;
    }
    this.atmoMesh.position.copy(this.kerbinMesh.position);
    this.atmoCenterU.value.copy(this.atmoMesh.position);
    this.atmoMesh.visible = this.kerbinMesh.visible;

    const kerbinRel = getRelativeState('kerbin', st.body, st.t);
    const padPos = PAD_DIR.clone().multiplyScalar(BODIES.kerbin.radius + PAD_ALTITUDE + 0.25)
      .add(kerbinRel.pos).sub(origin);
    this.pad.position.copy(padPos);
    this.pad.visible = padPos.length() < 2.5e5;

    // vessel
    if (this.vGroup && !st.dead) {
      const mp = st.massProps ?? massProps(st.parts, st.geom);
      this.vGroup.quaternion.copy(st.quat);
      this.vGroup.position.copy(new THREE.Vector3(0, mp.comY, 0).applyQuaternion(st.quat).negate());
    }
    for (const v of this.vessels ?? []) {
      if (v.id === this.activeId) continue;
      this.ensureOtherViz(v);
      const group = this.otherViz.get(v.id);
      if (!group) continue;
      let rel = v.st.pos.clone();
      if (v.st.body !== st.body) {
        const frame = getRelativeState(v.st.body, st.body, st.t);
        rel.add(frame.pos);
      }
      rel.sub(origin);
      const mp = v.st.massProps ?? massProps(v.st.parts, v.st.geom);
      group.quaternion.copy(v.st.quat);
      group.position.copy(rel).add(new THREE.Vector3(0, mp.comY, 0).applyQuaternion(v.st.quat).negate());
      group.visible = rel.length() < 5e5;
    }

    // terrain patch
    const alt = st.pos.length() - BODIES[st.body].radius;
    this.patch.update(st.body, st.pos, this.lastInfo?.agl ?? alt, this.scene);
    this.patch.place(origin);

    // camera (ENU orbit around vessel)
    const up = st.pos.clone().normalize();
    const east = new THREE.Vector3(0, 1, 0).cross(up);
    if (east.lengthSq() < 1e-8) east.set(0, 0, -1);
    east.normalize();
    const north = up.clone().cross(east).normalize();
    const { az, el, dist } = this.camCtl;
    const offset = east.clone().multiplyScalar(Math.cos(el) * Math.cos(az))
      .addScaledVector(north, Math.cos(el) * Math.sin(az))
      .addScaledVector(up, Math.sin(el))
      .multiplyScalar(dist);
    this.camera.position.copy(offset);
    this.camera.up.copy(up);
    this.camera.lookAt(0, 0, 0);

    // sky, stars, sun
    const rho = density(st.body, alt);
    let skyF = Math.min(1, Math.pow(rho / 1.225, 0.4));
    skyF *= THREE.MathUtils.clamp(up.dot(SUNDIR) + 0.35, 0, 1);
    const sky = new THREE.Color(0x020308).lerp(new THREE.Color(0x77b4e8), skyF);
    this.renderer.setClearColor(sky);
    this.starsFade.value = 1 - skyF;
    this.stars.position.copy(this.camera.position);
    this.sunSprite.position.copy(this.camera.position).addScaledVector(SUNDIR, 2e6);
    this.sunSprite.scale.setScalar(1.4e5);

    // plumes
    const press = this.lastInfo?.press ?? 0;
    for (const plume of this.plumes ?? []) {
      const f = this.lastInfo?.perEngine?.get(plume.key) ?? 0;
      const part = st.parts.find((p) => p.key === plume.key);
      const full = part ? (part.def.engine.throttleable ? st.throttle : 1) : 0;
      const lit = f > 0 ? Math.max(0.25, full) : 0;
      updatePlume(plume, lit, 1 - Math.min(1, press), (3 + (1 - press) * 5) * (part?.def.size ?? 1) * 1.6);
    }

    // plasma
    const plasmaI = this.lastInfo?.plasma ?? 0;
    this.plasma.intensityU.value = plasmaI;
    this.plasma.mesh.visible = plasmaI > 0.03;
    if (this.plasma.mesh.visible && st.vel.lengthSq() > 1) {
      const back = st.vel.clone().normalize().negate();
      this.plasma.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), back);
    }

    // debris
    for (const d of this.debris) {
      const frame = getRelativeState(d.body, st.body, st.t);
      const rel = d.pos.clone().add(frame.pos).sub(origin);
      d.group.position.copy(rel).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(d.quat), -d.comOffset);
      d.group.quaternion.copy(d.quat);
      d.group.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(d.axis, d.spin * 0.6));
      d.group.visible = rel.length() < 3e5;
    }

    this.boom.update(dt);

    // sound
    this.sound.setEngine(
      (this.lastInfo?.thrust ?? 0) > 1 ? Math.max(0.3, st.throttle) : 0,
      Math.min(1, press * 2 + 0.15),
    );
    this.sound.setWind(this.lastInfo?.qDyn ?? 0);
  }

  // -------------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------------

  hudTick(dt) {
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.12;
    const st = this.st;
    const info = this.lastInfo;
    const navEarly = this.relativeNav();
    const tgtEarly = this.vesselById(this.targetId);
    HUD.targetReadouts(navEarly, this.dockState, tgtEarly?.name);
    if (!info) return;

    HUD.setMET(st.met);
    HUD.setThrottle(st.throttle);
    HUD.setSAS(st.sas, st.sasMode);
    HUD.setWarp(WARP_LEVELS[this.warpIdx], this.rails);

    const up = st.pos.clone().normalize();
    const vspeed = st.vel.dot(up);
    HUD.readouts(info, st, vspeed);

    // situation line
    const sitBody = getLang() === 'en' ? bodyName(st.body).toUpperCase() : bodyName(st.body);
    let sitKey = 'sit.flying';
    if (st.dead) sitKey = 'sit.destroyed';
    else if (st.landed) sitKey = this.flags.liftoff ? 'sit.landed' : 'sit.prelaunch';
    else if (info.alt > (BODIES[st.body].atmoHeight || 4000) && this.curEls) {
      const atmoTop = BODIES[st.body].radius + (BODIES[st.body].atmoHeight || 0);
      if (this.curEls.a <= 0) sitKey = 'sit.escaping';
      else if (this.curEls.rp > atmoTop) sitKey = 'sit.orbiting';
      else sitKey = 'sit.suborbital';
    }
    HUD.setSituation(t(sitKey, { body: sitBody }));

    // orbital elements (recompute when not on rails)
    if (!st.landed) {
      this.curEls = this.rails && st.elements
        ? st.elements
        : elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
    } else this.curEls = null;

    // encounter search + map refresh, ~1 Hz
    this.encTimer -= dt + 0.12;
    if (this.encTimer <= 0) {
      this.encTimer = 1;
      this.encounter = null;
      if (this.curEls && !st.landed && this.curEls.a > 0) {
        const kids = childrenOf(st.body);
        const ordered = [...kids].sort((a, b) => (a === 'mun' ? -1 : b === 'mun' ? 1 : 0));
        let best = null;
        for (const kid of ordered) {
          const child = BODIES[kid];
          if (this.curEls.ra > child.orbitRadius - child.soi) {
            const enc = findEncounter(this.curEls, st.t, this.curEls.period ?? 200000, kid);
            if (enc) {
              if (kid === 'mun') { best = enc; break; }
              if (!best || enc.tEnter < best.tEnter) best = enc;
            }
          }
        }
        this.encounter = best;
      }
      if (this.mapOpen) this.refreshMapNow();
      HUD.stages(this.plan, this.stageIndex, st.parts, st.sections ?? computeSections(st.parts));
    }

    // orbit panel
    let phase = null, transferPhase = 0;
    let dunaPhase = null, dunaTarget = 0, vesselDunaPhase = null;
    const dunaXfer = hohmannTransfer('kerbin', 'duna');
    dunaTarget = dunaXfer.phaseDeg;
    if (st.body === 'kerbin') {
      const munPos = getBodyState('mun', st.t).pos;
      const rv = st.pos.clone().normalize(), rm = munPos.clone().normalize();
      const cross = new THREE.Vector3().crossVectors(rv, rm);
      let a = Math.atan2(cross.y, rv.dot(rm)) * 180 / Math.PI;
      if (a < 0) a += 360;
      phase = a;
      transferPhase = munTransferPhase(st.pos.length());
      dunaPhase = planetPhaseDeg('kerbin', 'duna', st.t);
    } else if (st.body === 'kerbol') {
      dunaPhase = planetPhaseDeg('kerbin', 'duna', st.t);
      const dv = st.pos.clone().normalize();
      const dm = getBodyState('duna', st.t).pos.clone().normalize();
      const cr = new THREE.Vector3().crossVectors(dv, dm);
      let va = Math.atan2(cr.y, dv.dot(dm)) * 180 / Math.PI;
      if (va < 0) va += 360;
      vesselDunaPhase = va;
    }
    const nav = this.relativeNav();
    const tgt = this.vesselById(this.targetId);
    HUD.targetReadouts(nav, this.dockState, tgt?.name);
    HUD.orbit(st, this.curEls, {
      tAp: this.curEls ? timeToApoapsis(this.curEls, st.t) : null,
      tPe: this.curEls ? timeToPeriapsis(this.curEls, st.t) : Infinity,
      phase, transferPhase,
      dunaPhase, dunaTarget, vesselDunaPhase,
      encounter: this.encounter,
      targetNav: nav,
      targetName: tgt?.name,
      dockState: this.dockState,
    });
  }

  refreshMapNow() {
    this.map.refresh(this.st, this.curEls, this.encounter);
    this.map.update(this.st, this.mapOthers());
  }

  refreshHUD() {
    if (!this.active || !this.st) return;
    this.hudTimer = 0;
    this.hudTick(1);
    this.map?.refreshLabels?.();
    if (this.mapOpen) this.refreshMapNow();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.map?.resize(w, h);
  }
}
