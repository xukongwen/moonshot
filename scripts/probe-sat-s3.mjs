#!/usr/bin/env node
// Headed proof: Kerbin Eye comm on (LKO day) / comm off (Mun far side).
// Playwright cannot see WebGPU. Headed Chrome + canvas.toDataURL + HUD composite.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Quaternion, Vector3 } from 'three';
import { STOCK } from '../src/stock.js';
import { buildVesselParts, stackGeometry, computeSections, massProps, hasBrain } from '../src/vessel.js';
import { BODIES, getInertialState } from '../src/constants.js';
import { fillEC } from '../src/power.js';
import { commState } from '../src/comms.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
const OUT_ON = join(SHOT_DIR, 'sat-s3-comm-on.png');
const OUT_OFF = join(SHOT_DIR, 'sat-s3-comm-off.png');
const OUT_JSON = join(ROOT, 'logs/sat-s3.json');
mkdirSync(SHOT_DIR, { recursive: true });

const DESIGN = { name: 'Kerbin Eye', ...structuredClone(STOCK['Kerbin Eye']) };

function looks3d(path) {
  const buf = readFileSync(path);
  return { bytes: buf.length, real3d: buf.length >= 110000 };
}

function composite(scenePath, hudPath, outPath) {
  const r = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', scenePath, '-i', hudPath,
    '-filter_complex', '[1]colorkey=0x000000:0.15:0.12[h];[0][h]overlay',
    outPath,
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    copyFileSync(scenePath, outPath);
    return { composited: false, err: (r.stderr || r.stdout || '').slice(0, 200) };
  }
  return { composited: true };
}

async function grabFrame(page, path) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(400);
  const b64 = await page.evaluate(() => {
    const c = document.querySelector('#app > canvas') || document.querySelector('canvas');
    return c.toDataURL('image/png').split(',')[1];
  });
  const scenePath = path.replace(/\.png$/, '.__scene.png');
  const hudPath = path.replace(/\.png$/, '.__hud.png');
  writeFileSync(scenePath, Buffer.from(b64, 'base64'));
  await page.screenshot({ path: hudPath, type: 'png' });
  const scene = looks3d(scenePath);
  const painted = scene.bytes >= 40000;
  if (painted) {
    const c = composite(scenePath, hudPath, path);
    try { unlinkSync(scenePath); unlinkSync(hudPath); } catch { /* keep */ }
    return { ...looks3d(path), ...c, sceneBytes: scene.bytes };
  }
  if (scene.bytes >= readFileSync(hudPath).length) copyFileSync(scenePath, path);
  else copyFileSync(hudPath, path);
  try { unlinkSync(scenePath); unlinkSync(hudPath); } catch { /* keep */ }
  return { ...looks3d(path), composited: false, sceneBytes: scene.bytes };
}

function placeDay({ t = 0, alt = 80_000 } = {}) {
  const parts = buildVesselParts(DESIGN);
  const geom = stackGeometry(parts);
  const mp = massProps(parts, geom);
  const bodyPos = getInertialState('kerbin', t).pos;
  const sunFromBody = bodyPos.clone().negate().normalize();
  const r = BODIES.kerbin.radius + alt;
  const pos = sunFromBody.multiplyScalar(r);
  const vel = new Vector3().crossVectors(new Vector3(0, 1, 0), pos).normalize()
    .multiplyScalar(Math.sqrt(BODIES.kerbin.mu / r) * 1.002);
  const quat = new Quaternion();
  const st = {
    t, body: 'kerbin',
    pos, vel, quat, angVel: new Vector3(),
    throttle: 0, landed: false, dead: false,
    parts, geom, sections: computeSections(parts), massProps: mp,
    controls: { pitch: 0, yaw: 0, roll: 0 },
    sas: true, sasMode: 'hold', sasTarget: quat.clone(),
  };
  fillEC(st);
  return st;
}

/** Mun far side: anti-Kerbin radial from getInertialState, 60 km Mun alt. */
function placeMunFar({ t = 0, alt = 60_000 } = {}) {
  const parts = buildVesselParts(DESIGN);
  const geom = stackGeometry(parts);
  const mp = massProps(parts, geom);
  const munIn = getInertialState('mun', t);
  const kerbinIn = getInertialState('kerbin', t);
  const radial = munIn.pos.clone().sub(kerbinIn.pos).normalize();
  const r = BODIES.mun.radius + alt;
  const pos = radial.multiplyScalar(r);
  const vel = new Vector3().crossVectors(new Vector3(0, 1, 0), pos);
  if (vel.lengthSq() < 1e-12) vel.set(0, 0, -1);
  vel.normalize().multiplyScalar(Math.sqrt(BODIES.mun.mu / r));
  const quat = new Quaternion();
  const st = {
    t, body: 'mun',
    pos, vel, quat, angVel: new Vector3(),
    throttle: 0, landed: false, dead: false,
    parts, geom, sections: computeSections(parts), massProps: mp,
    controls: { pitch: 0, yaw: 0, roll: 0 },
    sas: true, sasMode: 'hold', sasTarget: quat.clone(),
  };
  fillEC(st);
  return st;
}

function payloadOf(st, cam) {
  return {
    pos: st.pos.toArray(),
    vel: st.vel.toArray(),
    quat: [st.quat.x, st.quat.y, st.quat.z, st.quat.w],
    t: st.t,
    ec: st.ec,
    body: st.body,
    cam,
    holdSteps: st.body === 'kerbin' ? 150 : 8,
  };
}

const CAMS = [
  { out: 2.6, up: 1.8, side: 2.4 },
  { out: 3.2, up: 2.0, side: 2.0 },
  { out: 2.0, up: 2.4, side: 2.8 },
  { out: 3.6, up: 1.4, side: 2.2 },
];

process.env.DISPLAY = process.env.DISPLAY || ':3';

async function placeAndShoot(page, st, outPath, usedCam) {
  const payload = payloadOf(st, usedCam);
  const placed = await page.evaluate((p) => {
    const m = window.__moonshot;
    const f = m.flight;
    const st = f.st;
    st.t = p.t;
    st.met = p.t;
    st.body = p.body;
    st.pos.set(p.pos[0], p.pos[1], p.pos[2]);
    st.vel.set(p.vel[0], p.vel[1], p.vel[2]);
    st.quat.set(p.quat[0], p.quat[1], p.quat[2], p.quat[3]);
    st.angVel.set(0, 0, 0);
    st.landed = false;
    st.dead = false;
    st.throttle = 0;
    st.sas = true;
    st.sasMode = 'hold';
    st.sasTarget.copy(st.quat);
    st.ec = p.ec;
    f.flags.liftoff = true;
    f.flags.space = true;
    f.flags.orbit = true;
    f.rails = false;
    f.warpIdx = 0;
    if (f.mapOpen) f.toggleMap();
    document.getElementById('agent-panel')?.classList.add('hidden');

    f.legsDeployed = false;
    for (const part of st.parts) if (part.def?.legs) part.legsDown = false;
    if (typeof f.refreshViz === 'function') f.refreshViz();
    if (!f._origPhysStep && typeof f.physStep === 'function') f._origPhysStep = f.physStep.bind(f);
    if (typeof f._origPhysStep === 'function') {
      for (let i = 0; i < (p.holdSteps || 8); i++) f._origPhysStep(0.02);
    }
    f.physStep = () => {};
    st.sas = true;
    st.sasMode = 'hold';
    st.ec = p.ec;
    if (!f._pairFrozen) {
      f._pairFrozen = true;
      f.physStep = () => {};
      const origUpdate = f.updateScene.bind(f);
      f.updateScene = (dt) => {
        origUpdate(dt);
        const cam = f._pairCam || { out: 2.6, up: 1.8, side: 2.4 };
        const bus = st.parts.find((x) => x.kind === 'stack' && x.stackIndex === 0 && x.alive !== false);
        const y = (bus && st.geom?.yCenter?.get(bus.stackIndex)) ?? (st.massProps?.comY ?? 0);
        const V3 = st.pos.constructor;
        const local = new V3(0, y, 0);
        const world = typeof f.localToRender === 'function'
          ? f.localToRender(local)
          : local.clone().sub(new V3(0, st.massProps?.comY ?? 0, 0)).applyQuaternion(st.quat);
        const xWorld = new V3(1, 0, 0).applyQuaternion(st.quat).normalize();
        const yWorld = new V3(0, 1, 0).applyQuaternion(st.quat).normalize();
        const zWorld = new V3(0, 0, 1).applyQuaternion(st.quat).normalize();
        const out = Number.isFinite(cam.out) ? cam.out : 2.6;
        const up = Number.isFinite(cam.up) ? cam.up : 1.8;
        const side = Number.isFinite(cam.side) ? cam.side : 2.4;
        const camPos = world.clone()
          .addScaledVector(xWorld, out)
          .addScaledVector(yWorld, up)
          .addScaledVector(zWorld, side);
        f.camera.position.copy(camPos);
        f.camera.up.copy(yWorld);
        f.camera.lookAt(world);
      };
    }
    f._pairCam = p.cam;
    f.refreshHUD?.();
    return {
      body: st.body,
      t: st.t,
      landed: !!st.landed,
      nParts: st.parts.filter((x) => x.alive !== false).length,
    };
  }, payload);
  console.log('placed', JSON.stringify(placed));

  await page.waitForTimeout(2200);
  let last = await grabFrame(page, outPath);
  let cam = usedCam;
  for (let i = 1; i < CAMS.length && last.sceneBytes < 110000; i++) {
    console.log('  nudge', CAMS[i], 'bytes', last.bytes, 'scene', last.sceneBytes);
    cam = CAMS[i];
    await page.evaluate((c) => { window.__moonshot.flight._pairCam = c; }, cam);
    await page.waitForTimeout(1600);
    last = await grabFrame(page, outPath);
  }

  const live = await page.evaluate(() => {
    const st = window.__moonshot.flight.st;
    return {
      t: st.t,
      body: st.body,
      pos: [st.pos.x, st.pos.y, st.pos.z],
      vel: [st.vel.x, st.vel.y, st.vel.z],
      hudComm: document.getElementById('ro-comm')?.textContent ?? null,
      situation: document.getElementById('situation')?.textContent ?? null,
      sasOn: document.getElementById('sas-ind')?.classList.contains('on') ?? null,
    };
  });
  const liveSt = {
    ...st,
    t: live.t,
    body: live.body,
    pos: new Vector3().fromArray(live.pos),
    vel: new Vector3().fromArray(live.vel),
  };
  const cs = commState(liveSt);
  const r = BODIES[liveSt.body]?.radius ?? BODIES.kerbin.radius;
  const tel = {
    comm: cs.comm,
    commReason: cs.commReason,
    body: liveSt.body,
    alt: liveSt.pos.length() - r,
    brain: hasBrain(st.parts),
  };
  return { last, cam, tel, live, placed };
}

async function runOnce() {
  const server = await createServer({
    root: ROOT,
    server: { port: 5235, strictPort: false, host: '127.0.0.1' },
  });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  console.log('serving at', url, 'DISPLAY=', process.env.DISPLAY);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
      '--ignore-gpu-blocklist',
      '--window-position=0,0',
      '--window-size=1500,900',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__moonshot?.flight && window.__moonshot?.enterFlight, { timeout: 25000 });
    await page.waitForTimeout(2000);

    await page.evaluate((design) => {
      const m = window.__moonshot;
      m.setLang('zh');
      m.enterFlight(design);
      document.getElementById('agent-panel')?.classList.add('hidden');
    }, DESIGN);
    await page.waitForFunction(() => window.__moonshot?.flight?.active, { timeout: 15000 });
    await page.waitForTimeout(2500);

    const on = await placeAndShoot(page, placeDay(), OUT_ON, CAMS[0]);
    console.log(on.last.real3d ? '3D' : 'WEAK', 'sat-s3-comm-on.png', on.last.bytes, 'scene', on.last.sceneBytes, 'hud', on.live.hudComm);

    // unfreeze briefly so the second place can physStep a few frames for lastInfo
    await page.evaluate(() => {
      const f = window.__moonshot.flight;
      if (f._origPhysStep) f.physStep = f._origPhysStep;
      f._pairFrozen = true; // keep camera override; physStep restored above for next place
    });

    const off = await placeAndShoot(page, placeMunFar(), OUT_OFF, CAMS[0]);
    console.log(off.last.real3d ? '3D' : 'WEAK', 'sat-s3-comm-off.png', off.last.bytes, 'scene', off.last.sceneBytes, 'hud', off.live.hudComm);

    return {
      on, off, errors,
      ok: !!(on.last?.real3d && off.last?.real3d),
    };
  } finally {
    await Promise.race([
      (async () => { await browser.close(); await server.close(); })(),
      new Promise((r) => setTimeout(r, 6000)),
    ]);
  }
}

let resultRun = null;
let attempt = 0;
while (attempt < 2) {
  attempt++;
  try {
    resultRun = await runOnce();
    if (resultRun.ok) break;
    console.log('headed shot weak, retry', attempt);
  } catch (e) {
    console.log('headed shot failed', attempt, e.message || e);
    if (attempt >= 2) throw e;
  }
}

const on = resultRun?.on;
const off = resultRun?.off;
const errors = resultRun?.errors ?? [];

const result = {
  at: new Date().toISOString(),
  display: process.env.DISPLAY,
  craft: 'Kerbin Eye',
  method: 'headed Chrome channel=chrome canvas.toDataURL + HUD colorkey overlay',
  attempts: attempt,
  on: {
    path: 'logs/shots/sat-s3-comm-on.png',
    bytes: on?.last?.bytes ?? 0,
    real3d: on?.last?.real3d ?? false,
    composited: on?.last?.composited ?? false,
    sceneBytes: on?.last?.sceneBytes ?? 0,
    cam: on?.cam,
    hudComm: on?.live?.hudComm ?? null,
    telemetry: on?.tel ?? null,
  },
  off: {
    path: 'logs/shots/sat-s3-comm-off.png',
    bytes: off?.last?.bytes ?? 0,
    real3d: off?.last?.real3d ?? false,
    composited: off?.last?.composited ?? false,
    sceneBytes: off?.last?.sceneBytes ?? 0,
    cam: off?.cam,
    hudComm: off?.live?.hudComm ?? null,
    telemetry: off?.tel ?? null,
  },
  errors: errors.slice(0, 12),
};

writeFileSync(OUT_JSON, JSON.stringify(result, null, 2) + '\n');
try { copyFileSync(OUT_ON, '/workspace/sat-s3-comm-on.png'); } catch { /* optional */ }
try { copyFileSync(OUT_OFF, '/workspace/sat-s3-comm-off.png'); } catch { /* optional */ }
console.log(JSON.stringify(result, null, 2));
console.log('wrote', OUT_JSON, OUT_ON, OUT_OFF);
for (const e of errors.slice(0, 8)) console.log('err', String(e).slice(0, 240));
process.exit(resultRun?.ok ? 0 : 2);
