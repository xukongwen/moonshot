import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readSnapshot } from '../mcp/snapshot.mjs';

const ROOT = '/workspace/moonshot';
const SHOT_DIR = join(ROOT, 'logs/shots');
mkdirSync(SHOT_DIR, { recursive: true });

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
    return { composited: false };
  }
  return { composited: true };
}

async function grabFrame(page, path) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(300);
  const b64 = await page.evaluate(() => {
    const c = document.querySelector('#app > canvas') || document.querySelector('canvas');
    return c.toDataURL('image/png').split(',')[1];
  });
  const scenePath = path.replace(/\.png$/, '.__scene.png');
  const hudPath = path.replace(/\.png$/, '.__hud.png');
  writeFileSync(scenePath, Buffer.from(b64, 'base64'));
  await page.screenshot({ path: hudPath, type: 'png' });
  const scene = looks3d(scenePath);
  if (scene.real3d) {
    composite(scenePath, hudPath, path);
    try { unlinkSync(scenePath); unlinkSync(hudPath); } catch { /* */ }
    return { ...looks3d(path), sceneBytes: scene.bytes };
  }
  if (scene.bytes >= readFileSync(hudPath).length) copyFileSync(scenePath, path);
  else copyFileSync(hudPath, path);
  try { unlinkSync(scenePath); unlinkSync(hudPath); } catch { /* */ }
  return { ...looks3d(path), sceneBytes: scene.bytes };
}

process.env.DISPLAY = process.env.DISPLAY || ':3';
const snap = readSnapshot(join(ROOT, 'logs/snapshots/duna-landed.json'));

const server = await createServer({
  root: ROOT,
  server: { port: 5216, strictPort: false, host: '127.0.0.1' },
});
await server.listen();
const url = server.resolvedUrls.local[0];
console.log('serving', url, 'DISPLAY', process.env.DISPLAY);

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
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__moonshot?.flight && window.__moonshot?.setLang, { timeout: 25000 });
await page.waitForTimeout(2000);
await page.click('#btn-stock-duna');
await page.waitForTimeout(800);
await page.click('#btn-launch');
await page.waitForFunction(() => window.__moonshot?.flight?.active, { timeout: 15000 });
await page.waitForTimeout(2500);

const applied = await page.evaluate((snap) => {
  const f = window.__moonshot.flight;
  const ok = f.applySnapshot(snap);
  if (f.mapOpen) f.toggleMap();
  // Warp MET until the landing site faces Kerbol (daylight).
  const st = f.st;
  const up = st.pos.clone().normalize();
  const BODIES = window.__moonshot.BODIES || null;
  // getBodyState may be on constants; try flight helpers
  const getBody = window.__moonshot.getBodyState;
  let sunDot = null;
  let dtUsed = 0;
  if (typeof getBody === 'function') {
    for (let i = 0; i < 400; i++) {
      const duna = getBody('duna', st.t);
      const toSun = duna.pos.clone().negate().normalize();
      sunDot = up.dot(toSun);
      if (sunDot > 0.25) break;
      st.t += 3600 * 6; // +6 h
      dtUsed += 3600 * 6;
    }
  } else {
    // Fallback: step t by ~1/4 Duna year chunks using known omega
    for (let i = 0; i < 24; i++) {
      st.t += 800_000;
      dtUsed += 800_000;
    }
  }
  f.camCtl.dist = 28;
  f.camCtl.el = 0.38;
  f.camCtl.az = 1.2;
  f.refreshHUD?.();
  f.refreshViz?.();
  return {
    ok, body: st.body, landed: st.landed, dead: st.dead,
    parts: st.parts.filter((p) => p.alive).map((p) => p.def.name),
    sunDot, dtUsed, t: st.t,
    situation: document.getElementById('situation')?.textContent,
  };
}, snap);
console.log('apply', JSON.stringify(applied));

await page.waitForTimeout(4000);
const out = join(SHOT_DIR, 'duna-landed.png');
let last = await grabFrame(page, out);
for (let i = 0; i < 6 && !last.real3d; i++) {
  console.log('retry', last.bytes, 'scene', last.sceneBytes);
  // nudge camera
  await page.evaluate((i) => {
    const f = window.__moonshot.flight;
    f.camCtl.az = 0.4 + i * 0.5;
    f.camCtl.el = 0.22 + (i % 3) * 0.12;
    f.camCtl.dist = 22 + i * 4;
    f.refreshViz?.();
  }, i);
  await page.waitForTimeout(1800);
  last = await grabFrame(page, out);
}
console.log('final', last);

await Promise.race([
  (async () => { await browser.close(); await server.close(); })(),
  new Promise((r) => setTimeout(r, 5000)),
]);
process.exit(last.real3d ? 0 : 2);
