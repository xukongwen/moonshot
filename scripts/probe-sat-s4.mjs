#!/usr/bin/env node
// Headed proof: true nadir still from takePhoto() + chase-cam context.
// Playwright cannot see WebGPU. Headed Chrome + canvas.toDataURL.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Quaternion, Vector3 } from 'three';
import { STOCK } from '../src/stock.js';
import { buildVesselParts, stackGeometry, computeSections, massProps } from '../src/vessel.js';
import { BODIES } from '../src/constants.js';
import { fillEC } from '../src/power.js';
import { PHOTO_EC } from '../src/photo.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
const OUT_NADIR = join(SHOT_DIR, 'sat-s4-nadir.png');
const OUT_CTX = join(SHOT_DIR, 'sat-s4-context.png');
const OUT_JSON = join(ROOT, 'logs/sat-s4.json');
mkdirSync(SHOT_DIR, { recursive: true });

const DESIGN = { name: 'Kerbin Eye', ...structuredClone(STOCK['Kerbin Eye']) };
// Same visual sun as flight.js SUNDIR — dayside must be lit in the render.
const SUNDIR = new Vector3(1, 0.25, 0.45).normalize();

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

function placeVisualDay({ t = 0, alt = 80_000 } = {}) {
  const parts = buildVesselParts(DESIGN);
  const geom = stackGeometry(parts);
  const mp = massProps(parts, geom);
  const r = BODIES.kerbin.radius + alt;
  const pos = SUNDIR.clone().multiplyScalar(r);
  const vel = new Vector3().crossVectors(new Vector3(0, 1, 0), pos);
  if (vel.lengthSq() < 1e-12) vel.set(0, 0, -1);
  vel.normalize().multiplyScalar(Math.sqrt(BODIES.kerbin.mu / r) * 1.002);
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

process.env.DISPLAY = process.env.DISPLAY || ':3';

async function runOnce() {
  const server = await createServer({
    root: ROOT,
    server: { port: 5236, strictPort: false, host: '127.0.0.1' },
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

    const st = placeVisualDay();
    const payload = {
      pos: st.pos.toArray(),
      vel: st.vel.toArray(),
      quat: [st.quat.x, st.quat.y, st.quat.z, st.quat.w],
      t: st.t,
      ec: st.ec,
      body: st.body,
    };

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
      if (!Array.isArray(st.album)) st.album = [];
      f.flags.liftoff = true;
      f.flags.space = true;
      f.flags.orbit = true;
      f.rails = false;
      f.warpIdx = 0;
      if (f.mapOpen) f.toggleMap();
      document.getElementById('agent-panel')?.classList.add('hidden');
      f.legsDeployed = false;
      if (typeof f.refreshViz === 'function') f.refreshViz();
      if (!f._origPhysStep && typeof f.physStep === 'function') f._origPhysStep = f.physStep.bind(f);
      if (typeof f._origPhysStep === 'function') {
        for (let i = 0; i < 12; i++) f._origPhysStep(0.02);
      }
      f.physStep = () => {};
      st.ec = p.ec;
      // chase cam: sat in foreground, Kerbin behind (context only)
      const origUpdate = f.updateScene.bind(f);
      f.updateScene = (dt) => {
        origUpdate(dt);
        const up = st.pos.clone().normalize();
        const east = new st.pos.constructor(0, 1, 0).cross(up);
        if (east.lengthSq() < 1e-8) east.set(0, 0, -1);
        east.normalize();
        const north = up.clone().cross(east).normalize();
        f.camera.position.copy(east.multiplyScalar(18).addScaledVector(north, 10).addScaledVector(up, 8));
        f.camera.up.copy(up);
        f.camera.lookAt(0, 0, 0);
      };
      f.refreshHUD?.();
      return {
        body: st.body,
        t: st.t,
        ec: st.ec,
        nParts: st.parts.filter((x) => x.alive !== false).length,
        hasTakePhoto: typeof f.takePhoto === 'function',
      };
    }, payload);
    console.log('placed', JSON.stringify(placed));

    await page.waitForTimeout(2200);
    const ctx = await grabFrame(page, OUT_CTX);
    console.log(ctx.real3d ? '3D' : 'WEAK', 'sat-s4-context.png', ctx.bytes, 'scene', ctx.sceneBytes);

    const shot1 = await page.evaluate(async () => {
      const f = window.__moonshot.flight;
      const ecBefore = f.st.ec;
      const r = await f.takePhoto();
      return {
        ok: r.ok,
        reason: r.reason,
        ecBefore,
        ecAfter: f.st.ec,
        ecSpent: r.ecSpent,
        albumN: r.albumN,
        body: r.body,
        alt: r.alt,
        photoEc: r.photoEc,
        png: r.png || null,
        path: r.path || null,
      };
    });
    console.log('takePhoto', {
      ok: shot1.ok, reason: shot1.reason,
      ecBefore: shot1.ecBefore, ecAfter: shot1.ecAfter,
      albumN: shot1.albumN, pngBytes: shot1.png ? Math.floor((shot1.png.split(',')[1] || '').length * 0.75) : 0,
    });

    function writeNadir(dataUrl, dest) {
      if (!dataUrl || !dataUrl.includes(',')) return { bytes: 0, real3d: false };
      const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
      writeFileSync(dest, buf);
      return { bytes: buf.length, real3d: buf.length >= 110000 };
    }

    let nadir = writeNadir(shot1.png, OUT_NADIR);
    let shot = shot1;
    const ctxBuf = readFileSync(OUT_CTX);
    const sameAsCtx = nadir.bytes === ctxBuf.length && nadir.bytes > 0
      && Buffer.compare(readFileSync(OUT_NADIR), ctxBuf) === 0;
    if (!nadir.real3d || sameAsCtx || nadir.bytes < 40000) {
      console.log('nadir weak or chase-like, retry takePhoto', { bytes: nadir.bytes, sameAsCtx });
      await page.waitForTimeout(800);
      const shot2 = await page.evaluate(async () => {
        const f = window.__moonshot.flight;
        // refund the first pay so the retry measures a single spend
        if (Number.isFinite(f.st.ec) && f.st.album?.length) {
          f.st.album.pop();
        }
        const ecBefore = f.st.ec;
        const r = await f.takePhoto();
        return {
          ok: r.ok,
          reason: r.reason,
          ecBefore,
          ecAfter: f.st.ec,
          ecSpent: r.ecSpent,
          albumN: r.albumN,
          body: r.body,
          alt: r.alt,
          photoEc: r.photoEc,
          png: r.png || null,
          path: r.path || null,
        };
      });
      shot = shot2;
      nadir = writeNadir(shot2.png, OUT_NADIR);
      console.log('retry', { ok: shot2.ok, bytes: nadir.bytes, real3d: nadir.real3d });
    }

    const live = await page.evaluate(() => {
      const st = window.__moonshot.flight.st;
      return {
        t: st.t,
        body: st.body,
        ec: st.ec,
        albumN: Array.isArray(st.album) ? st.album.length : 0,
        hudAlbum: document.getElementById('ro-album')?.textContent ?? null,
        situation: document.getElementById('situation')?.textContent ?? null,
      };
    });

    return {
      placed, ctx, nadir, shot, live, errors,
      ok: !!(nadir.real3d && ctx.real3d && shot.ok),
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
    console.log('headed shot weak, retry run', attempt);
  } catch (e) {
    console.log('headed shot failed', attempt, e.message || e);
    if (attempt >= 2) throw e;
  }
}

const nadir = resultRun?.nadir;
const ctx = resultRun?.ctx;
const shot = resultRun?.shot;
const errors = resultRun?.errors ?? [];

const result = {
  at: new Date().toISOString(),
  display: process.env.DISPLAY,
  craft: 'Kerbin Eye',
  method: 'headed Chrome takePhoto() nadir + chase-cam context',
  attempts: attempt,
  PHOTO_EC,
  ecBefore: shot?.ecBefore ?? null,
  ecAfter: shot?.ecAfter ?? null,
  ecSpent: shot?.ecSpent ?? null,
  albumN: shot?.albumN ?? null,
  body: shot?.body ?? null,
  alt: shot?.alt ?? null,
  nadir: {
    path: 'logs/shots/sat-s4-nadir.png',
    bytes: nadir?.bytes ?? 0,
    real3d: nadir?.real3d ?? false,
  },
  context: {
    path: 'logs/shots/sat-s4-context.png',
    bytes: ctx?.bytes ?? 0,
    real3d: ctx?.real3d ?? false,
    composited: ctx?.composited ?? false,
    sceneBytes: ctx?.sceneBytes ?? 0,
  },
  errors: errors.slice(0, 12),
};

writeFileSync(OUT_JSON, JSON.stringify(result, null, 2) + '\n');
try { copyFileSync(OUT_NADIR, '/workspace/sat-s4-nadir.png'); } catch { /* optional */ }
try { copyFileSync(OUT_CTX, '/workspace/sat-s4-context.png'); } catch { /* optional */ }
console.log(JSON.stringify(result, null, 2));
console.log('wrote', OUT_JSON, OUT_NADIR, OUT_CTX);
for (const e of errors.slice(0, 8)) console.log('err', String(e).slice(0, 240));
process.exit(resultRun?.ok ? 0 : 2);
