// Headed shots of real Mun Reuser snapshots (recover / mun-land / home as they happened).
// booster-legs-shot / shot-agent-fly-duna pattern. DISPLAY=:3, real3d ≥110000.
// Skip events that never flew. Do not invent telemetry.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { STOCK } from '../src/stock.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
const SNAP_DIR = join(ROOT, 'logs/snapshots');
const RESULT = join(ROOT, 'logs/mun-reuser-result.json');
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

const result = existsSync(RESULT) ? JSON.parse(readFileSync(RESULT, 'utf8')) : {};
const nodes = result.nodes || [];
const snaps = result.snapshots || {};
const kerbinHome = join(SNAP_DIR, 'mun-reuser-home-kerbin.json');
if (existsSync(kerbinHome)) snaps.home = { ...(snaps.home || {}), path: kerbinHome };


function nodeHappened(id) {
  return nodes.some((n) => n.nodeId === id);
}

const JOBS = [
  {
    key: 'recover',
    nodeId: 'recover',
    snapKey: 'recover',
    snapFile: 'mun-reuser-recover.json',
    out: 'mun-reuser-recover.png',
    dist: 12,
    el: -0.18,
    az: 0.72,
    legs: true,
    hideAgent: true,
  },
  {
    key: 'munLand',
    nodeId: 'land',
    snapKey: 'land',
    snapFile: 'mun-reuser-land.json',
    out: 'mun-reuser-mun-land.png',
    dist: 11,
    el: 0.12,
    az: 1.15,
    legs: true,
    hideAgent: true,
  },
  {
    key: 'home',
    nodeId: 'home',
    snapKey: 'home',
    snapFile: 'mun-reuser-home.json',
    out: 'mun-reuser-home.png',
    dist: 14,
    el: 0.18,
    az: 0.85,
    legs: true,
    hideAgent: true,
  },
].filter((j) => {
  const snapPath = snaps[j.snapKey]?.path || join(SNAP_DIR, j.snapFile);
  return nodeHappened(j.nodeId) && existsSync(snapPath);
});

const skipped = ['mun-reuser-recover.png', 'mun-reuser-mun-land.png', 'mun-reuser-home.png']
  .filter((name) => !JOBS.some((j) => j.out === name));

console.log('jobs', JOBS.map((j) => j.key).join(',') || '(none)', 'skipped', skipped.join(','));

if (JOBS.length === 0) {
  const shots = {
    recover: null,
    munLand: null,
    home: null,
    skipped,
    skipReason: 'recover / mun-land / home never happened on this flight (or snapshots missing).',
  };
  if (existsSync(RESULT)) {
    result.shots = shots;
    writeFileSync(RESULT, JSON.stringify(result, null, 2));
  }
  console.log('no events to shoot');
  process.exit(0);
}

const design = { name: 'Mun Reuser', ...structuredClone(STOCK['Mun Reuser']) };
process.env.DISPLAY = process.env.DISPLAY || ':3';

const server = await createServer({
  root: ROOT,
  server: { port: 5233, strictPort: false, host: '127.0.0.1' },
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

const shotMeta = { recover: null, munLand: null, home: null, skipped, skipReason: null };
let anyWeak = false;

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__moonshot?.flight && window.__moonshot?.enterFlight, { timeout: 25000 });
  await page.waitForTimeout(2000);

  for (const job of JOBS) {
    const snapPath = snaps[job.snapKey]?.path || join(SNAP_DIR, job.snapFile);
    const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
    const probe = await page.evaluate(({ design, snap, job }) => {
      const m = window.__moonshot;
      m.setLang('zh');
      m.enterFlight(design);
      const ok = !!m.flight.applySnapshot(snap);
      if (job.legs) {
        for (const p of m.flight.st.parts) {
          if (p.def?.legs) p.legsDown = true;
        }
        m.flight.legsDeployed = true;
      }
      m.flight.refreshViz();
      m.flight.camCtl.dist = job.dist;
      m.flight.camCtl.el = job.el;
      m.flight.camCtl.az = job.az;
      m.flight.refreshHUD?.();
      if (job.hideAgent) document.getElementById('agent-panel')?.classList.add('hidden');
      const names = m.flight.st.parts.filter((p) => p.alive !== false).map((p) => p.def?.name);
      return {
        ok,
        body: m.flight.st.body,
        landed: !!m.flight.st.landed,
        dead: !!m.flight.st.dead,
        t: m.flight.st.t,
        nParts: m.flight.st.parts.length,
        names,
        situation: document.getElementById('situation')?.textContent,
      };
    }, { design, snap, job });
    console.log(job.key, JSON.stringify(probe, null, 2));
    await page.waitForTimeout(4000);

    const out = join(SHOT_DIR, job.out);
    let last = await grabFrame(page, out);
    for (let i = 0; i < 4 && !last.real3d; i++) {
      console.log('  retry', job.out, 'bytes', last.bytes, 'scene', last.sceneBytes);
      await page.waitForTimeout(1500);
      last = await grabFrame(page, out);
    }
    console.log(last.real3d ? '3D' : 'WEAK', job.out, last.bytes, 'scene', last.sceneBytes, 'comp', last.composited);
    if (!last.real3d) anyWeak = true;
    shotMeta[job.key] = {
      path: `logs/shots/${job.out}`,
      bytes: last.bytes,
      real3d: last.real3d,
      composited: last.composited,
      sceneBytes: last.sceneBytes,
      body: probe.body,
      landed: probe.landed,
      dead: probe.dead,
      t: probe.t,
      names: probe.names,
      situation: probe.situation,
      note: `headed DISPLAY=:3 canvas+HUD composite of ${job.snapFile}.`,
    };
  }
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

if (skipped.length) {
  shotMeta.skipReason = `skipped ${skipped.join(', ')} — those nodes never happened (or snapshot missing).`;
}

if (existsSync(RESULT)) {
  const fresh = JSON.parse(readFileSync(RESULT, 'utf8'));
  fresh.shots = shotMeta;
  writeFileSync(RESULT, JSON.stringify(fresh, null, 2));
}

for (const e of errors.slice(0, 8)) console.log('err', String(e).slice(0, 240));
process.exit(anyWeak ? 2 : 0);
