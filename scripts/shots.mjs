// Capture in-game screenshots at mission snapshot nodes.
// Playwright's compositor cannot see WebGPU. Headed Chrome can, and
// canvas.toDataURL() returns the real frame. We composite that under the HUD.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { listSnapshots } from '../mcp/snapshot.mjs';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
mkdirSync(SHOT_DIR, { recursive: true });

const NODES = [
  { tags: ['PRELAUNCH', 'pad', 'prelaunch'], nn: '01', tag: 'pad', map: false,
    cam: { dist: 32, el: 0.28, az: 0.55 } },
  { tags: ['MECO_ORBIT', 'MECO', 'LKO'], nn: '02', tag: 'lko', map: true,
    cam: { dist: 160, el: -0.12, az: 0.85 } },
  { tags: ['DUNA_WINDOW'], nn: '03', tag: 'window', map: true,
    cam: { dist: 180, el: -0.12, az: 0.9 } },
  { tags: ['TDI_CUTOFF'], nn: '04', tag: 'tdi', map: true,
    cam: { dist: 280, el: -0.14, az: 1.0 } },
  { tags: ['KERBOL_COAST'], nn: '05', tag: 'solar', map: true,
    cam: { dist: 900, el: -0.28, az: 1.05 } },
  { tags: ['DUNA_SOI'], nn: '06', tag: 'duna-soi', map: true,
    cam: { dist: 700, el: -0.22, az: 0.85 } },
  { tags: ['DUNA_ORBIT'], nn: '07', tag: 'duna-orbit', map: true,
    cam: { dist: 600, el: -0.28, az: 0.7 } },
  // previous tour / Mun tags — optional skip if those snapshots are still on disk
  { tags: ['MINMUS_SOI'], nn: '13', tag: 'minmus-soi', map: true,
    cam: { dist: 900, el: -0.28, az: 0.7 } },
  { tags: ['MINMUS_ORBIT'], nn: '14', tag: 'minmus-orbit', map: true,
    cam: { dist: 800, el: -0.3, az: 0.65 } },
  { tags: ['ESCAPE_BURN'], nn: '15', tag: 'escape', map: true,
    cam: { dist: 420, el: -0.16, az: 1.0 } },
  { tags: ['KERBIN_SOI_EXIT'], nn: '16', tag: 'soi-exit', map: true,
    cam: { dist: 700, el: -0.22, az: 0.95 } },
  { tags: ['SOLAR_ORBIT'], nn: '17', tag: 'solar-old', map: true,
    cam: { dist: 900, el: -0.28, az: 1.05 } },
  { tags: ['TLI_CUTOFF', 'TLI'], nn: '23', tag: 'tli', map: true,
    cam: { dist: 220, el: -0.1, az: 1.05 } },
  { tags: ['MUN_SOI'], nn: '24', tag: 'mun-soi', map: true,
    cam: { dist: 1800, el: -0.3, az: 0.7 } },
  { tags: ['MOI'], nn: '25', tag: 'mun-orbit', map: true,
    cam: { dist: 1600, el: -0.32, az: 0.6 } },
  { tags: ['MUN_ORBIT_3'], nn: '26', tag: 'mun-revs', map: true,
    cam: { dist: 1600, el: -0.3, az: 0.95 } },
  { tags: ['TKI_CUTOFF'], nn: '27', tag: 'tki', map: true,
    cam: { dist: 480, el: -0.14, az: 1.1 } },
  { tags: ['ABORT'], nn: '28', tag: 'return', map: true,
    cam: { dist: 400, el: -0.1, az: 0.8 } },
];

function pickSnap(available, node) {
  const byTag = new Map(available.map((s) => [String(s.tag).toUpperCase(), s]));
  const byFile = new Map(available.map((s) => [s.file.replace(/\.json$/i, '').toUpperCase(), s]));
  for (const t of node.tags) {
    const k = t.toUpperCase();
    if (byTag.has(k)) return byTag.get(k);
    if (byFile.has(k)) return byFile.get(k);
  }
  return null;
}

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
  // headed WebGPU didn't paint — keep whichever is larger
  if (scene.bytes >= readFileSync(hudPath).length) copyFileSync(scenePath, path);
  else copyFileSync(hudPath, path);
  try { unlinkSync(scenePath); unlinkSync(hudPath); } catch { /* keep */ }
  return { ...looks3d(path), composited: false, sceneBytes: scene.bytes };
}

async function applyAndShoot(page, snap, node, suffix) {
  await page.evaluate(({ snap, cam, openMap }) => {
    const f = window.__moonshot.flight;
    f.applySnapshot(snap);
    if (cam) {
      if (cam.dist != null) f.camCtl.dist = cam.dist;
      if (cam.el != null) f.camCtl.el = cam.el;
      if (cam.az != null) f.camCtl.az = cam.az;
    }
    if (openMap) {
      if (!f.mapOpen) f.toggleMap();
      if (f.st.body === 'minmus') f.map.cam.dist = 5e6;
      else if (f.st.body === 'mun') f.map.cam.dist = 1.6e7;
      else if (f.st.body === 'kerbol') f.map.cam.dist = 3.2e10;
      else if (f.st.body === 'duna') f.map.cam.dist = 8e7;
      else f.map.cam.dist = 1.1e8; // Kerbin system: show Mun + Minmus
      if (f.st.body === 'kerbol') f.map.cam.el = 0.55;
      f.refreshMapNow();
    } else if (f.mapOpen) {
      f.toggleMap();
    }
  }, { snap, cam: node.cam, openMap: suffix === 'map' });
  await page.waitForTimeout(700);
  const name = suffix === 'map' ? `${node.nn}-${node.tag}-map.png` : `${node.nn}-${node.tag}.png`;
  const path = join(SHOT_DIR, name);
  const stats = await grabFrame(page, path);
  return { name, path, ...stats };
}

async function boot() {
  const server = await createServer({
    root: ROOT,
    server: { port: 5210, strictPort: false, host: '127.0.0.1' },
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
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__moonshot?.flight, { timeout: 25000 });
  await page.waitForTimeout(2500);
  return { server, browser, page, errors };
}

async function enterFlight(page) {
  await page.click('#btn-stock-mun');
  await page.waitForTimeout(1500);
  await page.click('#btn-launch');
  await page.waitForFunction(() => window.__moonshot?.flight?.active, { timeout: 10000 });
  await page.waitForTimeout(4000);
}

process.env.DISPLAY = process.env.DISPLAY || ':3';

const available = listSnapshots();
console.log('snapshots:', available.map((s) => s.tag).join(', ') || '(none)');

const { server, browser, page, errors } = await boot();
const results = [];
try {
  await enterFlight(page);
  results.push({ name: '01-pad.png', live: true, ...(await grabFrame(page, join(SHOT_DIR, '01-pad.png'))) });

  for (const node of NODES) {
    const found = pickSnap(available, node);
    if (!found) {
      if (node.tag === 'pad') continue;
      console.log(`  skip ${node.nn}-${node.tag}: no snapshot`);
      continue;
    }
    console.log(`  shoot ${node.nn}-${node.tag} from ${found.file}`);
    results.push(await applyAndShoot(page, found.snap, node, 'flight'));
    if (node.map && !found.snap.landed) {
      results.push(await applyAndShoot(page, found.snap, node, 'map'));
    }
  }
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

for (const r of results) {
  console.log(`  ${r.real3d ? '3D   ' : 'WEAK '}  ${r.name}  ${r.bytes} B  scene=${r.sceneBytes}  comp=${r.composited}`);
}

writeFileSync(join(SHOT_DIR, 'index.json'), JSON.stringify({
  at: new Date().toISOString(),
  results: results.map(({ path, ...rest }) => rest),
  errors: errors.slice(0, 20),
}, null, 2));

console.log('\nConsole errors:', errors.length);
for (const e of errors.slice(0, 8)) console.log('  •', String(e).slice(0, 240));
process.exit(results.some((r) => r.real3d) ? 0 : 2);
