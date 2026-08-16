// Headed Chrome + canvas.toDataURL of the mun-landed snapshot.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { STOCK } from '../src/stock.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
const SNAP = join(ROOT, 'logs/snapshots/mun-landed.json');
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
    return { composited: false, err: (r.stderr || r.stdout || '').slice(0, 200) };
  }
  return { composited: true };
}

async function grabFrame(page, path) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(250);
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
    const c = composite(scenePath, hudPath, path);
    try { unlinkSync(scenePath); unlinkSync(hudPath); } catch { /* keep */ }
    return { ...looks3d(path), ...c, sceneBytes: scene.bytes };
  }
  if (scene.bytes >= readFileSync(hudPath).length) copyFileSync(scenePath, path);
  else copyFileSync(hudPath, path);
  try { unlinkSync(scenePath); unlinkSync(hudPath); } catch { /* keep */ }
  return { ...looks3d(path), composited: false, sceneBytes: scene.bytes };
}

if (!existsSync(SNAP)) {
  console.error('missing snapshot', SNAP);
  process.exit(2);
}
const snap = JSON.parse(readFileSync(SNAP, 'utf8'));
const design = { name: 'Mun Express', ...STOCK['Mun Express'] };

process.env.DISPLAY = process.env.DISPLAY || ':3';

const server = await createServer({
  root: ROOT,
  server: { port: 5213, strictPort: false, host: '127.0.0.1' },
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

let last = { bytes: 0, real3d: false };
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__moonshot?.flight && window.__moonshot?.enterFlight, { timeout: 25000 });
  await page.waitForTimeout(2000);

  const probe = await page.evaluate(({ design, snap }) => {
    const m = window.__moonshot;
    m.setLang('zh');
    m.enterFlight(design);
    m.flight.applySnapshot(snap);
    const names = m.flight.st.parts.filter((p) => p.alive).map((p) => p.def.name);
    m.flight.legsDeployed = true;
    for (const p of m.flight.st.parts) if (p.def.legs) p.legsDown = true;
    m.flight.refreshViz();
    m.flight.camCtl.dist = 11;
    m.flight.camCtl.el = 0.12;
    m.flight.camCtl.az = 1.15;
    m.flight.refreshHUD?.();
    return {
      body: m.flight.st.body,
      landed: m.flight.st.landed,
      nParts: m.flight.st.parts.length,
      names,
      length: m.flight.st.geom?.totalLength,
    };
  }, { design, snap });
  console.log('probe', JSON.stringify(probe));
  if (probe.names.some((n) => /Sparrow|Falcon|Titan|FT-3200|FT-800/.test(n))) {
    console.error('REFUSE shot: transfer/lifter still attached', probe.names);
    process.exit(3);
  }
  await page.waitForTimeout(5000);

  const out = join(SHOT_DIR, 'mun-landed.png');
  last = await grabFrame(page, out);
  for (let i = 0; i < 4 && !last.real3d; i++) {
    console.log('  retry bytes', last.bytes);
    await page.waitForTimeout(1500);
    last = await grabFrame(page, out);
  }
  console.log(last.real3d ? '3D' : 'WEAK', 'mun-landed.png', last.bytes, 'scene', last.sceneBytes, 'comp', last.composited);
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

for (const e of errors.slice(0, 8)) console.log('err', String(e).slice(0, 240));
process.exit(last.real3d ? 0 : 2);
