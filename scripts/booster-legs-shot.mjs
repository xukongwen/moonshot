// Headed close-up of recovered Titan legs (or pad booster, legsDown).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { STOCK } from '../src/stock.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
const SNAP = join(ROOT, 'logs/snapshots/booster-exp5-booster.json');
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

const snap = existsSync(SNAP) ? JSON.parse(readFileSync(SNAP, 'utf8')) : null;
const design = structuredClone(STOCK['Mun Express']);

process.env.DISPLAY = process.env.DISPLAY || ':3';

const server = await createServer({
  root: ROOT,
  server: { port: 5227, strictPort: false, host: '127.0.0.1' },
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
    if (snap) m.flight.applySnapshot(snap);
    for (const p of m.flight.st.parts) {
      if (p.def?.legs) p.legsDown = true;
    }
    m.flight.legsDeployed = true;
    m.flight.refreshViz();
    // Close-up on the engine / legs so all four long LT-25 struts read.
    m.flight.camCtl.dist = 10;
    m.flight.camCtl.el = -0.22;
    m.flight.camCtl.az = 0.72;
    m.flight.refreshHUD?.();
    document.getElementById('agent-panel')?.classList.add('hidden');

    const hostR = 1.25;
    const attach = [];
    const feet = [];
    m.flight.vGroup?.updateMatrixWorld(true);
    m.flight.vGroup?.traverse((o) => {
      if (!o.name?.startsWith('leg') || !o.userData?.axis) return;
      const origin = o.getWorldPosition(new m.flight.vGroup.position.constructor());
      attach.push({
        r: Math.hypot(origin.x, origin.z),
        y: origin.y,
        deploy: o.userData.deployAngle,
        strutLen: o.userData.strutLen,
        attachR: o.userData.attachR,
        footR: o.userData.footR,
      });
      o.traverse((c) => {
        if (!c.isMesh) return;
        const h = c.geometry?.parameters?.height;
        const isFoot = c.geometry?.type === 'CylinderGeometry' && h != null && h <= 0.14;
        const isOldFoot = c.geometry?.type === 'BoxGeometry' && h != null && h < 0.2;
        if (!isFoot && !isOldFoot) return;
        const p = c.getWorldPosition(origin.clone());
        feet.push({ r: Math.hypot(p.x, p.z), y: p.y });
      });
    });
    const names = m.flight.st.parts.filter((p) => p.alive !== false).map((p) => p.def.name);
    const xl = m.flight.st.parts.filter((p) => p.def?.legs && p.def.size === 2.5).map((p) => ({
      name: p.def.name, idShape: p.def.shape, mass: p.def.mass, length: p.def.length,
      safeSpeed: p.def.legs.safeSpeed, legsDown: p.legsDown,
    }));
    return {
      body: m.flight.st.body,
      landed: m.flight.st.landed,
      dead: m.flight.st.dead,
      nParts: m.flight.st.parts.length,
      names,
      xl,
      legsDown: m.flight.st.parts.filter((p) => p.def?.legs).map((p) => p.legsDown),
      hostR,
      attach,
      feet,
      feetPastTank: feet.filter((f) => f.r > hostR + 0.5).length,
    };
  }, { design, snap });
  console.log('probe', JSON.stringify(probe, null, 2));
  await page.waitForTimeout(4000);

  const out = join(SHOT_DIR, 'booster-legs.png');
  last = await grabFrame(page, out);
  for (let i = 0; i < 4 && !last.real3d; i++) {
    console.log('  retry bytes', last.bytes);
    await page.waitForTimeout(1500);
    last = await grabFrame(page, out);
  }
  console.log(last.real3d ? '3D' : 'WEAK', 'booster-legs.png', last.bytes, 'scene', last.sceneBytes, 'comp', last.composited);

  await page.evaluate(() => {
    const m = window.__moonshot;
    m.flight.camCtl.dist = 11;
    m.flight.camCtl.el = 0.08;
    m.flight.camCtl.az = 0.28;
    m.flight.refreshHUD?.();
  });
  await page.waitForTimeout(800);
  const alt = join(SHOT_DIR, 'booster-legs-alt.png');
  const altShot = await grabFrame(page, alt);
  console.log(altShot.real3d ? '3D' : 'WEAK', 'booster-legs-alt.png', altShot.bytes);
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

for (const e of errors.slice(0, 8)) console.log('err', String(e).slice(0, 240));
process.exit(last.real3d ? 0 : 2);
