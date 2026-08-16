// Headed proof: Mun Express OX-STAT side wings (T-shape, span out).
// Playwright cannot see WebGPU. Headed Chrome + canvas.toDataURL + HUD composite.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Quaternion, Vector3 } from 'three';
import { STOCK } from '../src/stock.js';
import { buildVesselParts, stackGeometry, computeSections, massProps } from '../src/vessel.js';
import { BODIES, getInertialState } from '../src/constants.js';
import { fillEC, sunVectorInertial, ecTelemetry, wheelsLive } from '../src/power.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
const OUT_PNG = join(SHOT_DIR, 'panel-wings.png');
const OUT_JSON = join(ROOT, 'logs/panel-wings.json');
mkdirSync(SHOT_DIR, { recursive: true });

const DESIGN = { name: 'Mun Express', ...structuredClone(STOCK['Mun Express']) };

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

/** Day-side 80 km. Identity quat so ±Z wings sit left-right of the pod. */
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
    sas: false, sasMode: 'hold', sasTarget: quat.clone(),
  };
  fillEC(st);
  return st;
}

function telFromLive(stTemplate, live) {
  const st = {
    ...stTemplate,
    t: live.t,
    body: live.body,
    pos: new Vector3().fromArray(live.pos),
    vel: new Vector3().fromArray(live.vel),
    quat: new Quaternion().fromArray(live.quat),
    ec: live.ec,
    sas: live.sas,
    landed: live.landed,
    dead: live.dead,
  };
  const tel = ecTelemetry(st, st.t);
  const r = BODIES[st.body]?.radius ?? BODIES.kerbin.radius;
  return {
    ...tel,
    wheelsLive: wheelsLive(st),
    body: st.body,
    alt: st.pos.length() - r,
    t: st.t,
    sas: st.sas,
    hudEc: live.hudEc,
    situation: live.situation,
  };
}

// Top-ish / front-ish of the upper stack: +X in front, +Y above, almost no
// +Z so the ±Z wings read left and right (T-shape, ~2.2 m each side).
const CAMS = [
  { out: 4.5, up: 6.5, side: 0.25 },
  { out: 3.2, up: 8.0, side: 0.15 },
  { out: 6.5, up: 4.0, side: 0.20 },
  { out: 2.0, up: 9.5, side: 0.10 },
];

process.env.DISPLAY = process.env.DISPLAY || ':3';

const server = await createServer({
  root: ROOT,
  server: { port: 5231, strictPort: false, host: '127.0.0.1' },
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

let last = null;
let usedCam = CAMS[0];
let tel = null;

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

  const st0 = placeDay();
  const payload = {
    pos: st0.pos.toArray(),
    vel: st0.vel.toArray(),
    quat: [st0.quat.x, st0.quat.y, st0.quat.z, st0.quat.w],
    t: st0.t,
    ec: st0.ec,
    cam: usedCam,
  };

  const placed = await page.evaluate((p) => {
    const m = window.__moonshot;
    const f = m.flight;
    const st = f.st;
    st.t = p.t;
    st.met = p.t;
    st.body = 'kerbin';
    st.pos.set(p.pos[0], p.pos[1], p.pos[2]);
    st.vel.set(p.vel[0], p.vel[1], p.vel[2]);
    st.quat.set(p.quat[0], p.quat[1], p.quat[2], p.quat[3]);
    st.angVel.set(0, 0, 0);
    st.landed = false;
    st.dead = false;
    st.throttle = 0;
    st.sas = false;
    st.sasMode = 'hold';
    st.sasTarget.copy(st.quat);
    st.ec = p.ec;
    f.flags.liftoff = true;
    f.flags.space = true;
    f.rails = false;
    f.warpIdx = 0;
    if (f.mapOpen) f.toggleMap();
    document.getElementById('agent-panel')?.classList.add('hidden');

    f.legsDeployed = false;
    for (const part of st.parts) if (part.def?.legs) part.legsDown = false;
    if (typeof f.refreshViz === 'function') f.refreshViz();
    if (typeof f.physStep === 'function') f.physStep(0.02);
    st.ec = p.ec;
    st.pos.set(p.pos[0], p.pos[1], p.pos[2]);
    st.vel.set(p.vel[0], p.vel[1], p.vel[2]);
    st.quat.set(p.quat[0], p.quat[1], p.quat[2], p.quat[3]);
    st.angVel.set(0, 0, 0);
    if (!f._pairFrozen) {
      f._pairFrozen = true;
      f.physStep = () => {};
      const origUpdate = f.updateScene.bind(f);
      f.updateScene = (dt) => {
        origUpdate(dt);
        const cam = f._pairCam || { out: 4.5, up: 6.5, side: 0.25 };
        const panel = st.parts.find((x) => x.alive !== false && x.def?.panel);
        if (!panel) return;
        const host = st.parts.find((q) => q.kind === 'stack' && q.stackIndex === panel.stackIndex && q.alive !== false);
        const y = st.geom?.yCenter?.get('r:' + panel.key)
          ?? st.geom?.yCenter?.get(panel.stackIndex)
          ?? 0;
        const V3 = st.pos.constructor;
        const local = new V3(0, y, 0);
        const world = typeof f.localToRender === 'function'
          ? f.localToRender(local)
          : local.clone().sub(new V3(0, st.massProps?.comY ?? 0, 0)).applyQuaternion(st.quat);
        const xWorld = new V3(1, 0, 0).applyQuaternion(st.quat).normalize();
        const yWorld = new V3(0, 1, 0).applyQuaternion(st.quat).normalize();
        const zWorld = new V3(0, 0, 1).applyQuaternion(st.quat).normalize();
        const out = Number.isFinite(cam.out) ? cam.out : 4.5;
        const up = Number.isFinite(cam.up) ? cam.up : 6.5;
        const side = Number.isFinite(cam.side) ? cam.side : 0.25;
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
    const panels = st.parts.filter((x) => x.alive !== false && x.def?.panel);
    return {
      body: st.body,
      ec: st.ec,
      t: st.t,
      landed: !!st.landed,
      nParts: st.parts.filter((x) => x.alive !== false).length,
      panelSym: panels[0]?.sym ?? 0,
    };
  }, payload);
  console.log('placed', JSON.stringify(placed));

  await page.waitForTimeout(2200);

  last = await grabFrame(page, OUT_PNG);
  for (let i = 1; i < CAMS.length && last.sceneBytes < 110000; i++) {
    console.log('  nudge', CAMS[i], 'bytes', last.bytes, 'scene', last.sceneBytes);
    usedCam = CAMS[i];
    await page.evaluate((cam) => { window.__moonshot.flight._pairCam = cam; }, usedCam);
    await page.waitForTimeout(1600);
    last = await grabFrame(page, OUT_PNG);
  }
  console.log(last.real3d ? '3D' : 'WEAK', 'panel-wings.png', last.bytes, 'scene', last.sceneBytes, 'comp', last.composited);

  const live = await page.evaluate(() => {
    const st = window.__moonshot.flight.st;
    const ecEl = document.getElementById('ro-ec');
    return {
      t: st.t,
      body: st.body,
      pos: [st.pos.x, st.pos.y, st.pos.z],
      vel: [st.vel.x, st.vel.y, st.vel.z],
      quat: [st.quat.x, st.quat.y, st.quat.z, st.quat.w],
      ec: st.ec,
      sas: st.sas,
      landed: !!st.landed,
      dead: !!st.dead,
      hudEc: ecEl?.textContent ?? null,
      situation: document.getElementById('situation')?.textContent ?? null,
    };
  });
  tel = telFromLive(st0, live);
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

const result = {
  version: '0.1.6',
  at: new Date().toISOString(),
  display: process.env.DISPLAY,
  craft: 'Mun Express',
  orbit: '80 km circular kerbin',
  setup: 'stock hang sym 2 at 90°/270°, identity quat, SAS off, legs stowed, side wings',
  method: 'headed Chrome channel=chrome canvas.toDataURL + HUD colorkey overlay',
  cam: usedCam,
  path: 'logs/shots/panel-wings.png',
  bytes: last?.bytes ?? 0,
  real3d: last?.real3d ?? false,
  composited: last?.composited ?? false,
  sceneBytes: last?.sceneBytes ?? 0,
  telemetry: tel ? {
    ec: tel.ec,
    ecCap: tel.ecCap,
    ecGen: tel.ecGen,
    eclipsed: tel.eclipsed,
    panelW: tel.panelW,
    wheelsLive: tel.wheelsLive,
    body: tel.body,
    alt: tel.alt,
  } : null,
  hudEc: tel?.hudEc ?? null,
  situation: tel?.situation ?? null,
  errors: errors.slice(0, 12),
};

writeFileSync(OUT_JSON, JSON.stringify(result, null, 2) + '\n');
try { copyFileSync(OUT_PNG, '/workspace/panel-wings.png'); } catch { /* optional */ }
console.log(JSON.stringify(result, null, 2));
console.log('wrote', OUT_JSON, OUT_PNG);
for (const e of errors.slice(0, 8)) console.log('err', String(e).slice(0, 240));
process.exit(last?.real3d ? 0 : 2);
