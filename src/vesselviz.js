// Builds the 3D representation of a vessel from its part list.
// Shared by the VAB preview and the flight scene.
// Group origin: stack bottom (y=0), +Y up the stack.

import * as THREE from 'three/webgpu';
import { stackGeometry, partY } from './vessel.js';

const MATS = {};
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!MATS[key]) {
    MATS[key] = new THREE.MeshStandardNodeMaterial({
      color, roughness: opts.rough ?? 0.55, metalness: opts.metal ?? 0.25, ...opts.extra,
    });
  }
  return MATS[key];
}

const WHITE = 0xdfe3e8, GRAY = 0x8d959e, DARK = 0x3a3f46, ORANGE = 0xc96a2a,
  YELLOW = 0xd6b13c, REDDISH = 0x9e4a3a, BLUE = 0x5f87b0, GOLD = 0xc9a227;

function cyl(rTop, rBot, h, color, seg = 24) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat(color));
}

/** Flat trapezoid blade: thin in X (radial), wide in Z (tangent), long in -Y. */
function taperedBlade(w0, w1, len, thick, color, opts = {}) {
  const hw0 = w0 / 2, hw1 = w1 / 2, ht = thick / 2;
  const verts = new Float32Array([
    -ht, 0, -hw0,   ht, 0, -hw0,   ht, 0, hw0,   -ht, 0, hw0,
    -ht, -len, -hw1, ht, -len, -hw1, ht, -len, hw1, -ht, -len, hw1,
  ]);
  const idx = [
    1, 2, 6, 1, 6, 5,
    3, 0, 4, 3, 4, 7,
    0, 1, 5, 0, 5, 4,
    2, 3, 7, 2, 7, 6,
    0, 3, 2, 0, 2, 1,
    4, 5, 6, 4, 6, 7,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat(color, opts));
}

/** Authored radial ring for 1.25 m stacks (hostR = 0.625). */
const DESIGN_HOST_R = 0.625;

function isWideHost(hostR) {
  return hostR > DESIGN_HOST_R + 1e-9;
}

/** Place a radial ring just outside the host tank. 1.25 m keeps the authored radius. */
export function radialAttachR(designedR, hostR, clearance = 0.08) {
  return isWideHost(hostR) ? hostR + clearance : designedR;
}

export function buildPartMesh(p, hostR = DESIGN_HOST_R) {
  const d = p.def;
  const r = d.size / 2, L = d.length;
  const g = new THREE.Group();

  switch (d.shape) {
    case 'pod': {
      const body = cyl(r * 0.45, r, L, WHITE);
      g.add(body);
      const window = cyl(r * 0.46, r * 0.46, L * 0.18, DARK);
      window.position.y = L * 0.18;
      g.add(window);
      break;
    }
    case 'tank': {
      g.add(cyl(r, r, L, WHITE));
      const band = cyl(r * 1.01, r * 1.01, L * 0.16, ORANGE);
      g.add(band);
      const cap1 = cyl(r * 0.97, r * 1.0, L * 0.07, GRAY); cap1.position.y = L * 0.465; g.add(cap1);
      const cap2 = cyl(r * 1.0, r * 0.97, L * 0.07, GRAY); cap2.position.y = -L * 0.465; g.add(cap2);
      break;
    }
    case 'engine': {
      const mount = cyl(r * 0.9, r * 0.7, L * 0.4, GRAY); mount.position.y = L * 0.3; g.add(mount);
      const nozzle = cyl(r * 0.25, r * 0.78, L * 0.62, DARK); nozzle.position.y = -L * 0.16; g.add(nozzle);
      break;
    }
    case 'srb': {
      g.add(cyl(r, r, L * 0.92, 0xcfd4cf));
      const nose = cyl(0.02, r, L * 0.1, REDDISH); nose.position.y = L * 0.48; g.add(nose);
      const noz = cyl(r * 0.3, r * 0.55, L * 0.1, DARK); noz.position.y = -L * 0.48; g.add(noz);
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, L * 0.5, 24, 1, true), mat(REDDISH));
      stripe.position.y = L * 0.1;
      g.add(stripe);
      break;
    }
    case 'decoupler': {
      g.add(cyl(r, r, L, DARK));
      const band = cyl(r * 1.02, r * 1.02, L * 0.4, YELLOW); g.add(band);
      break;
    }
    case 'adapter': {
      g.add(cyl(0.625, r, L, WHITE));
      break;
    }
    case 'nose': {
      g.add(new THREE.Mesh(new THREE.ConeGeometry(r, L, 24), mat(GRAY)));
      break;
    }
    case 'fins': {
      const attachR = radialAttachR(0.3, hostR, 0.12);
      for (let i = 0; i < 4; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, L, 0.55), mat(REDDISH));
        const a = (i / 4) * Math.PI * 2;
        fin.position.set(Math.cos(a) * attachR, 0, Math.sin(a) * attachR);
        fin.rotation.y = -a;
        g.add(fin);
      }
      break;
    }
    case 'chute': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(ORANGE));
      dome.position.y = -L * 0.2; g.add(dome);
      const base = cyl(r * 0.6, r * 0.7, L * 0.5, GRAY); base.position.y = -L * 0.25; g.add(base);
      // deployed canopy, hidden until used
      const canopy = new THREE.Group();
      const c = new THREE.Mesh(new THREE.SphereGeometry(4.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), mat(ORANGE, { extra: { side: THREE.DoubleSide } }));
      c.position.y = 9;
      canopy.add(c);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x999999 });
      const lpts = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        lpts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 3.4, 9.6, Math.sin(a) * 3.4));
      }
      canopy.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lpts), lineMat));
      canopy.visible = false;
      canopy.name = 'canopy';
      g.add(canopy);
      break;
    }
    case 'legs': {
      // LT-2: small lander legs. Authored for 1.25 m — do not fatten on XL hosts.
      // Stow along the tank (foot up the stack), not the old 1.25 rad A-frame
      // (~1.52 m out, 0.50 m down). Same axis as LT-25: tangent, +θ swings
      // local −Y toward +radial. Inner foot edge hugs 1.25 m skin + 0.08
      // (radialAttachR clearance): attachR + L sinθ + footR cosθ = hostR + 0.08.
      const attachR = radialAttachR(0.62, hostR, 0.08);
      const footR = 0.17;
      const hugC = DESIGN_HOST_R + 0.08 - attachR;
      const hugHyp = Math.hypot(L, footR);
      const stowAngle = Math.PI - Math.asin(hugC / hugHyp) - Math.atan2(footR, L);
      for (let i = 0; i < 4; i++) {
        const leg = new THREE.Group();
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.09, L, 0.09), mat(GRAY));
        strut.position.y = -L / 2;
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.34), mat(DARK));
        foot.position.y = -L;
        leg.add(strut, foot);
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        leg.position.set(Math.cos(a) * attachR, L * 0.4, Math.sin(a) * attachR);
        leg.userData.axis = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
        leg.userData.stowAngle = stowAngle;
        leg.userData.deployAngle = -0.32;
        leg.userData.strutLen = L;
        leg.userData.attachR = attachR;
        leg.userData.footR = footR;
        leg.name = `leg${i}`;
        g.add(leg);
      }
      break;
    }
    case 'legs-xl': {
      // LT-25: Falcon 9 recovery legs — wide cream carbon blade + helium ram + crush pad.
      // Real F9: carbon/Al honeycomb, stowed along the tank, deploy out-and-down.
      const attachR = hostR + 0.08;
      const strutLen = L;
      const footR = 0.72;
      const attachY = -1.35;
      const CARBON = 0xcfc6b6;
      const EDGE = 0xb7ae9e;
      const GROOVE = 0x8f877c;
      const RAM = 0xd4dae0;
      const SHOE = 0x1a1c20;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);

        const mount = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.55), mat(DARK));
        mount.position.set(ca * attachR, attachY, sa * attachR);
        mount.rotation.y = -a;
        g.add(mount);
        const hinge = cyl(0.11, 0.11, 0.52, 0x2a2e34, 10);
        hinge.rotation.x = Math.PI / 2;
        hinge.position.set(ca * attachR, attachY, sa * attachR);
        hinge.rotation.y = -a;
        g.add(hinge);

        const leg = new THREE.Group();
        const visual = new THREE.Group();
        visual.rotation.y = -a; // +X radial out, +Z tangent — deploy rotates around tangent

        const blade = taperedBlade(0.98, 0.40, strutLen * 0.96, 0.07, CARBON);
        visual.add(blade);
        const railL = taperedBlade(0.10, 0.07, strutLen * 0.96, 0.10, EDGE);
        railL.position.z = 0.44;
        const railR = taperedBlade(0.10, 0.07, strutLen * 0.96, 0.10, EDGE);
        railR.position.z = -0.44;
        visual.add(railL, railR);
        const groove = taperedBlade(0.22, 0.12, strutLen * 0.72, 0.04, GROOVE);
        groove.position.set(-0.03, -strutLen * 0.04, 0);
        visual.add(groove);

        const ram = cyl(0.045, 0.055, strutLen * 0.70, RAM, 10);
        ram.material = mat(RAM, { metal: 0.72, rough: 0.28 });
        ram.position.set(-0.08, -strutLen * 0.38, 0);
        visual.add(ram);
        const ramTip = cyl(0.035, 0.035, 0.18, 0x9aa3ab, 8);
        ramTip.position.set(-0.08, -strutLen * 0.74, 0);
        visual.add(ramTip);

        // Last boom section = replaceable Al honeycomb crush core (real F9).
        const boomTip = cyl(0.13, 0.17, 0.42, DARK, 10);
        boomTip.position.y = -strutLen + 0.28;
        const joint = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(0x2a2e34, { metal: 0.55, rough: 0.35 }));
        joint.position.y = -strutLen + 0.06;
        visual.add(boomTip, joint);

        // Pad is articulated: cancel deployAngle so the shoe sits flat on the deck.
        const shoe = new THREE.Group();
        shoe.position.y = -strutLen;
        shoe.rotation.z = -0.88;
        const foot = new THREE.Mesh(
          new THREE.CylinderGeometry(footR, footR * 1.04, 0.20, 16),
          mat(SHOE, { rough: 0.82, metal: 0.12 }),
        );
        const lip = new THREE.Mesh(
          new THREE.CylinderGeometry(footR * 1.10, footR * 1.10, 0.05, 16),
          mat(0x0c0d10),
        );
        lip.position.y = -0.11;
        const core = new THREE.Mesh(
          new THREE.CylinderGeometry(footR * 0.62, footR * 0.62, 0.06, 8),
          mat(0x3a3e44, { metal: 0.2, rough: 0.7 }),
        );
        core.position.y = 0.08;
        shoe.add(foot, lip, core);
        visual.add(shoe);

        leg.add(visual);
        leg.position.set(ca * attachR, attachY, sa * attachR);
        leg.userData.axis = new THREE.Vector3(-sa, 0, ca);
        leg.userData.stowAngle = 2.98;
        leg.userData.deployAngle = 0.88;
        leg.userData.strutLen = strutLen;
        leg.userData.attachR = attachR;
        leg.userData.footR = footR;
        leg.name = `leg${i}`;
        g.add(leg);
      }
      break;
    }
    case 'shield': {
      const disc = cyl(r * 1.05, r * 0.92, L, 0x6b5340);
      g.add(disc);
      break;
    }
    case 'rcs': {
      g.add(cyl(r * 0.42, r * 0.42, L, BLUE));
      for (let i = 0; i < 4; i++) {
        const noz = cyl(0.05, 0.07, 0.16, DARK);
        const a = (i / 4) * Math.PI * 2;
        noz.rotation.z = Math.PI / 2;
        noz.position.set(Math.cos(a) * r * 0.48, 0, Math.sin(a) * r * 0.48);
        g.add(noz);
      }
      break;
    }
    case 'panel': {
      // OX-STAT: static side wing (already extended, no deploy).
      // Local +X = span (radial out after wrap rotation.y = -a)
      // Local +Y = chord (stack)
      // Local +Z = thickness; painted PV grid/rim sit on +Z
      // After wrap, local +Z → vessel (-sin a, 0, cos a) (tangent).
      // A sym pair is one plane: the painted face is instance 0's tangent
      // for every inst. The opposite attach (a-a0≈π) maps +Z the other
      // way, so buildVesselGroup also does rotateX(π) (span stays out).
      const span = 2.2, chord = 0.60, thick = 0.04;
      const PV = 0x1a4a7a, GRID = 0x5aa0d0, RIM = 0xc5ccd3;
      const wing = new THREE.Group();
      wing.add(new THREE.Mesh(
        new THREE.BoxGeometry(span, chord, thick),
        mat(PV, { rough: 0.38, metal: 0.22, extra: { side: THREE.DoubleSide } }),
      ));
      const rimT = 0.018;
      const rimZ = thick / 2 + 0.002;
      const rimMat = mat(RIM, { metal: 0.72, rough: 0.28 });
      const rimN = new THREE.Mesh(new THREE.BoxGeometry(span + 0.012, rimT, 0.008), rimMat);
      rimN.position.set(0, chord / 2 - rimT / 2, rimZ);
      const rimS = new THREE.Mesh(new THREE.BoxGeometry(span + 0.012, rimT, 0.008), rimMat);
      rimS.position.set(0, -chord / 2 + rimT / 2, rimZ);
      const rimE = new THREE.Mesh(new THREE.BoxGeometry(rimT, chord - rimT * 1.5, 0.008), rimMat);
      rimE.position.set(span / 2 - rimT / 2, 0, rimZ);
      const rimW = new THREE.Mesh(new THREE.BoxGeometry(rimT, chord - rimT * 1.5, 0.008), rimMat);
      rimW.position.set(-span / 2 + rimT / 2, 0, rimZ);
      wing.add(rimN, rimS, rimE, rimW);
      // Grid along the span: more cells along X than Y.
      const cols = 10, rows = 3;
      const insetX = span * 0.90, insetY = chord * 0.90;
      for (let i = 0; i <= rows; i++) {
        const y = -insetY / 2 + (i / rows) * insetY;
        const hz = new THREE.Mesh(new THREE.BoxGeometry(insetX, 0.008, 0.005), mat(GRID));
        hz.position.set(0, y, thick / 2 + 0.0015);
        wing.add(hz);
      }
      for (let j = 0; j <= cols; j++) {
        const x = -insetX / 2 + (j / cols) * insetX;
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.008, insetY, 0.005), mat(GRID));
        v.position.set(x, 0, thick / 2 + 0.0015);
        wing.add(v);
      }
      // Inner edge on the tank: box is centered, so shift +span/2 along local X.
      // (buildVesselGroup overwrites g.position, so offset lives on the child.)
      wing.position.x = span / 2;
      g.add(wing);
      const stub = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), mat(GRAY));
      stub.position.x = 0.04;
      g.add(stub);
      break;
    }
    case 'battery': {
      // Small KSP-ish Z-100 brick. Local +X radial out after wrap rotation.
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.20), mat(ORANGE)));
      const capT = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.035, 0.205), mat(YELLOW));
      capT.position.y = 0.07;
      const capB = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.035, 0.205), mat(YELLOW));
      capB.position.y = -0.07;
      g.add(capT, capB);
      break;
    }
    case 'satbus': {
      // 1.25 m cube-ish box. White body + gold MLI + dark radiators. Flat faces.
      // Stack axis +Y; top/bottom stay stackable (camera goes under).
      const w = d.size;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(w, L, w), mat(WHITE, { rough: 0.48, metal: 0.16 })));
      const mli = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, L * 0.64, w * 0.72),
        mat(GOLD, { metal: 0.72, rough: 0.32 }),
      );
      mli.position.x = w / 2 + 0.009;
      const mli2 = mli.clone();
      mli2.position.x = -(w / 2 + 0.009);
      g.add(mli, mli2);
      const rad = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.58, L * 0.15, 0.016),
        mat(DARK, { rough: 0.72, metal: 0.28 }),
      );
      rad.position.set(0, L * 0.18, w / 2 + 0.008);
      const radB = rad.clone();
      radB.position.y = -L * 0.18;
      const radZ = rad.clone();
      radZ.position.z = -(w / 2 + 0.008);
      const radZB = radB.clone();
      radZB.position.z = -(w / 2 + 0.008);
      g.add(rad, radB, radZ, radZB);
      const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, 0.03, w * 0.78), mat(GOLD, { metal: 0.68, rough: 0.36 }));
      top.position.y = L / 2 - 0.012;
      const bot = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 0.035, w * 0.42), mat(GRAY));
      bot.position.y = -(L / 2 - 0.012);
      g.add(top, bot);
      const tracker = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.11), mat(DARK));
      tracker.position.set(w * 0.36, L * 0.28, w / 2 + 0.05);
      g.add(tracker);
      break;
    }
    case 'antenna': {
      // Radial dish. Local +X = out after wrap rotation.y = -a. Gold dish + gray boom.
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.08), mat(GRAY, { metal: 0.5, rough: 0.4 }));
      mount.position.x = 0.03;
      g.add(mount);
      const boom = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.04), mat(GRAY, { metal: 0.55, rough: 0.35 }));
      boom.position.x = 0.14;
      g.add(boom);
      const dishR = 0.40;
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(dishR, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.42),
        mat(GOLD, { metal: 0.78, rough: 0.26, extra: { side: THREE.DoubleSide } }),
      );
      dish.scale.set(1, 0.38, 1);
      dish.rotation.z = Math.PI / 2; // concave faces +X
      dish.position.x = 0.28;
      g.add(dish);
      const feed = cyl(0.022, 0.038, 0.10, GRAY, 10);
      feed.rotation.z = Math.PI / 2;
      feed.position.x = 0.46;
      g.add(feed);
      break;
    }
    case 'camera': {
      // Dark barrel + glass on the −Y (nadir) end. Stack part under the bus.
      const house = new THREE.Mesh(new THREE.BoxGeometry(r * 1.7, L * 0.30, r * 1.7), mat(DARK));
      house.position.y = L * 0.30;
      g.add(house);
      const barrel = cyl(r * 0.70, r * 0.78, L * 0.52, 0x2a2e34, 16);
      barrel.position.y = -L * 0.02;
      g.add(barrel);
      const ring = cyl(r * 0.82, r * 0.82, 0.035, GRAY, 16);
      ring.position.y = -L * 0.28;
      g.add(ring);
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.04, 16),
        mat(BLUE, { metal: 0.82, rough: 0.14 }),
      );
      glass.position.y = -L * 0.36;
      g.add(glass);
      break;
    }
    default:
      g.add(cyl(r, r, L, GRAY));
  }
  return g;
}

/**
 * Build the whole vessel. Returns { group, meshByKey, plumeAnchors }.
 * plumeAnchors: [{ key, y, radius, count, hostRadius }] engine nozzle exits.
 */
export function buildVesselGroup(parts) {
  const geom = stackGeometry(parts);
  const group = new THREE.Group();
  const meshByKey = new Map();
  const plumeAnchors = [];

  for (const p of parts) {
    if (!p.alive) continue;
    const y = partY(geom, p);

    if (p.kind === 'stack') {
      const mesh = buildPartMesh(p);
      mesh.position.y = y;
      group.add(mesh);
      meshByKey.set(p.key, mesh);
      if (p.def.engine) {
        plumeAnchors.push({
          key: p.key, positions: [new THREE.Vector3(0, y - p.def.length / 2, 0)],
          radius: p.def.size * 0.33,
        });
      }
    } else {
      // radial attachments
      const host = parts.find((q) => q.kind === 'stack' && q.stackIndex === p.stackIndex && q.alive);
      const hostR = host ? host.def.size / 2 : DESIGN_HOST_R;
      const mesh = buildPartMesh(p, hostR);
      const wrap = new THREE.Group();
      const positions = [];
      if (p.def.fins || p.def.legs) {
        // ×4 sets authored for 1.25 m; buildPartMesh places them on the host skin
        mesh.position.y = y;
        wrap.add(mesh);
      } else {
        const a0 = Number.isFinite(p.attachAngle) ? p.attachAngle : 0;
        const wafer = p.def.shape === 'panel' || p.def.shape === 'battery';
        const facesOut = wafer || p.def.shape === 'antenna';
        for (let i = 0; i < p.sym; i++) {
          const a = a0 + (i / p.sym) * Math.PI * 2;
          const inst = i === 0 ? mesh : buildPartMesh(p, hostR);
          // panel halfOut ~0: attach at host skin; the mesh offset (span/2) does the rest
          // antenna: small halfOut so the dish sits outside the 1.25 m box, not inside
          const halfOut = p.def.shape === 'panel' ? 0
            : p.def.shape === 'battery' ? 0.07
            : p.def.shape === 'antenna' ? 0.18
            : p.def.size / 2;
          const offset = hostR + halfOut;
          inst.position.set(Math.cos(a) * offset, y, Math.sin(a) * offset);
          if (facesOut) {
            inst.rotation.y = -a;
            // Opposite attach: rotation.y = -a sends local +Z to the
            // other tangent. Extra local rotateX(PI) — not Euler x+y,
            // which folds span into the tank — puts the grid on the
            // shared face. Span stays local +X = radial out; chord -Y.
            if (p.def.shape === 'panel') {
              const da = a - a0;
              if (Math.abs(Math.sin(da)) < 1e-6 && Math.cos(da) < 0) {
                inst.rotateX(Math.PI);
              }
            }
          }
          wrap.add(inst);
          if (p.def.engine) {
            positions.push(new THREE.Vector3(Math.cos(a) * offset, y - p.def.length / 2, Math.sin(a) * offset));
          }
        }
      }
      group.add(wrap);
      meshByKey.set(p.key, wrap);
      if (p.def.engine) plumeAnchors.push({ key: p.key, positions, radius: p.def.size * 0.3 });
    }
  }
  group.userData.geom = geom;
  return { group, meshByKey, plumeAnchors };
}

/** Animate landing legs on a built vessel. t: 0 stowed, 1 deployed. */
export function setLegs(meshByKey, parts, deployed) {
  for (const p of parts) {
    if (!p.def.legs) continue;
    const wrap = meshByKey.get(p.key);
    if (!wrap) continue;
    wrap.traverse((o) => {
      if (o.name?.startsWith('leg') && o.userData.axis) {
        const ang = deployed ? o.userData.deployAngle : o.userData.stowAngle;
        o.setRotationFromAxisAngle(o.userData.axis, ang);
      }
    });
  }
}

/** Show/hide deployed parachute canopies. */
export function setCanopies(meshByKey, parts) {
  for (const p of parts) {
    if (!p.def.chute) continue;
    const m = meshByKey.get(p.key);
    if (!m) continue;
    m.traverse((o) => { if (o.name === 'canopy') o.visible = p.chuteState === 'deployed'; });
  }
}
