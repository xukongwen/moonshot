// Map view: current-SOI-body frame, child orbits, predicted encounter
// trajectory after SOI entry.

import * as THREE from 'three/webgpu';
import { BODIES, getBodyState, getRelativeState, childrenOf } from './constants.js';
import { sampleOrbitPoints } from './orbits.js';

function textSprite(text, color = '#cfe3ff') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  const paint = (t) => {
    x.clearRect(0, 0, 256, 64);
    x.font = '28px monospace';
    x.fillStyle = color;
    x.textAlign = 'left';
    x.shadowColor = '#000'; x.shadowBlur = 6;
    x.fillText(t, 8, 40);
  };
  paint(text);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, depthTest: false, transparent: true, sizeAttenuation: false,
  }));
  s.scale.set(0.22, 0.055, 1);
  s.center.set(0, 0.5);
  s.renderOrder = 20;
  s.userData.setText = (t) => { paint(t); tex.needsUpdate = true; };
  return s;
}

function dotSprite(color, px = 0.02) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.beginPath(); x.arc(32, 32, 20, 0, Math.PI * 2); x.fill();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), depthTest: false, transparent: true, sizeAttenuation: false,
  }));
  s.scale.set(px, px, 1);
  s.renderOrder = 19;
  return s;
}

function makeLine(color, opacity = 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 260), 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  return line;
}

function setLine(line, pts, offset = null) {
  const attr = line.geometry.getAttribute('position');
  const n = Math.min(pts.length, attr.count);
  for (let i = 0; i < n; i++) {
    attr.setXYZ(i, pts[i].x + (offset?.x ?? 0), pts[i].y + (offset?.y ?? 0), pts[i].z + (offset?.z ?? 0));
  }
  attr.needsUpdate = true;
  line.geometry.setDrawRange(0, n);
}

function sampleChildOrbit(name, count = 128) {
  const b = BODIES[name];
  const period = (2 * Math.PI) / b.omega;
  const pts = [];
  for (let i = 0; i <= count; i++) {
    pts.push(getBodyState(name, (i / count) * period).pos);
  }
  return pts;
}

function zoomLimits(bodyName) {
  const b = BODIES[bodyName] ?? BODIES.kerbin;
  const minD = 2 * b.radius;
  const maxD = b.soi === Infinity ? 8e10 : Math.max(3e8, 2.5 * b.soi);
  return { minD, maxD };
}

export class MapView {
  constructor(planetTextures = {}) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x01020a);
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1e4, 1e12);
    this.cam = { az: 0.6, el: 0.9, dist: 4.2e7 };
    this.visible = false;
    this.frameBody = 'kerbin';

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(1, 0.25, 0.45);
    this.scene.add(sun);

    this.meshes = {};
    this.orbitLines = {};
    this.soiSpheres = {};

    for (const [k, b] of Object.entries(BODIES)) {
      let mat;
      if (k === 'kerbol') {
        mat = new THREE.MeshBasicMaterial({ color: b.color ?? 0xffee66 });
      } else if (planetTextures[k]) {
        mat = new THREE.MeshStandardNodeMaterial({ map: planetTextures[k], roughness: 1 });
      } else {
        mat = new THREE.MeshStandardMaterial({ color: b.color ?? 0x888888, roughness: 1 });
      }
      const segs = k === 'kerbol' ? [32, 16] : k === 'kerbin' ? [48, 24] : [32, 16];
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.radius, segs[0], segs[1]), mat);
      this.meshes[k] = mesh;
      this.scene.add(mesh);

      if (b.parent) {
        const orbitPts = sampleChildOrbit(k);
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(orbitPts),
          new THREE.LineBasicMaterial({
            color: b.color ?? 0x666677, transparent: true, opacity: 0.7,
          }),
        );
        line.visible = false;
        this.orbitLines[k] = line;
        this.scene.add(line);

        const soi = new THREE.Mesh(
          new THREE.SphereGeometry(b.soi, 32, 16),
          new THREE.MeshBasicMaterial({
            color: 0x8888aa, wireframe: true, transparent: true, opacity: 0.08, depthWrite: false,
          }),
        );
        soi.visible = false;
        this.soiSpheres[k] = soi;
        this.scene.add(soi);
      }
    }

    this.orbitLine = makeLine(0x55b1ff);
    this.encLine = makeLine(0xffc14d, 0.95);
    this.scene.add(this.orbitLine, this.encLine);

    this.vesselDot = dotSprite('#7fd0ff', 0.016);
    this.apLabel = textSprite('Ap', '#8fd0ff');
    this.peLabel = textSprite('Pe', '#8fd0ff');
    this.munPeLabel = textSprite('Mun Pe', '#ffc14d');
    this.scene.add(this.vesselDot, this.apLabel, this.peLabel, this.munPeLabel);
  }

  /** Refresh orbital geometry (call ~1 Hz or after burns). */
  refresh(st, els, encounter) {
    this.frameBody = st.body;
    const parent = BODIES[st.body]?.parent;

    for (const name of Object.keys(this.meshes)) {
      const rel = getRelativeState(name, st.body, st.t);
      this.meshes[name].position.copy(rel.pos);
      const show = name === st.body
        || BODIES[name].parent === st.body
        || name === parent;
      this.meshes[name].visible = show;
    }

    for (const name of Object.keys(this.orbitLines)) {
      const isChild = BODIES[name].parent === st.body;
      this.orbitLines[name].visible = isChild;
      this.soiSpheres[name].visible = isChild;
      if (isChild) this.soiSpheres[name].position.copy(getRelativeState(name, st.body, st.t).pos);
    }

    if (els) {
      const maxR = BODIES[st.body].soi === Infinity ? 5e10 : BODIES[st.body].soi * 1.05;
      setLine(this.orbitLine, sampleOrbitPoints(els, 220, maxR));
      this.orbitLine.material.color.set(BODIES[st.body].color ?? 0x55b1ff);
      this.orbitLine.visible = true;

      const peP = els.phat.clone().multiplyScalar(els.rp);
      this.peLabel.position.copy(peP);
      this.peLabel.visible = els.rp > 0;
      if (els.a > 0) {
        this.apLabel.position.copy(els.phat.clone().multiplyScalar(-els.ra));
        this.apLabel.visible = true;
      } else this.apLabel.visible = false;
    }

    if (encounter) {
      const child = encounter.child || 'mun';
      const childPos = getRelativeState(child, st.body, encounter.tEnter).pos;
      setLine(this.encLine, sampleOrbitPoints(encounter.relElements, 160, BODIES[child].soi), childPos);
      this.encLine.visible = true;
      this.munPeLabel.userData.setText(child === 'mun' ? 'Mun Pe' : `${BODIES[child].name} Pe`);
      this.munPeLabel.position.copy(
        encounter.relElements.phat.clone().multiplyScalar(encounter.relElements.rp).add(childPos));
      this.munPeLabel.visible = true;
    } else {
      this.encLine.visible = false;
      this.munPeLabel.visible = false;
    }
  }

  /** Per-frame: vessel marker + camera. Frame origin is the current SOI body. */
  update(st) {
    this.frameBody = st.body;
    this.vesselDot.position.copy(st.pos);

    const { minD, maxD } = zoomLimits(st.body);
    this.cam.dist = THREE.MathUtils.clamp(this.cam.dist, minD, maxD);

    const { az, el, dist } = this.cam;
    this.camera.position.set(
      Math.cos(az) * Math.sin(el) * dist,
      Math.cos(el) * dist,
      Math.sin(az) * Math.sin(el) * dist,
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
  }

  drag(dx, dy) {
    this.cam.az += dx * 0.005;
    this.cam.el = THREE.MathUtils.clamp(this.cam.el + dy * 0.005, 0.05, Math.PI - 0.05);
  }

  zoom(f) {
    const { minD, maxD } = zoomLimits(this.frameBody);
    this.cam.dist = THREE.MathUtils.clamp(this.cam.dist * f, minD, maxD);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
