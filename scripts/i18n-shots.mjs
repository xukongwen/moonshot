// Capture Chinese-UI screenshots. Headed Chrome + canvas.toDataURL + HUD composite.
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
  if (scene.bytes >= readFileSync(hudPath).length) copyFileSync(scenePath, path);
  else copyFileSync(hudPath, path);
  try { unlinkSync(scenePath); unlinkSync(hudPath); } catch { /* keep */ }
  return { ...looks3d(path), composited: false, sceneBytes: scene.bytes };
}

function pickSnap(available, tags) {
  const byTag = new Map(available.map((s) => [String(s.tag).toUpperCase(), s]));
  const byFile = new Map(available.map((s) => [s.file.replace(/\.json$/i, '').toUpperCase(), s]));
  for (const t of tags) {
    const k = t.toUpperCase();
    if (byTag.has(k)) return byTag.get(k);
    if (byFile.has(k)) return byFile.get(k);
  }
  return null;
}

async function boot() {
  const server = await createServer({
    root: ROOT,
    server: { port: 5211, strictPort: false, host: '127.0.0.1' },
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
  await page.waitForFunction(() => window.__moonshot?.flight && window.__moonshot?.setLang, { timeout: 25000 });
  await page.waitForTimeout(2500);
  return { server, browser, page, errors };
}

async function applySnap(page, snap, { map = false, cam = null } = {}) {
  await page.evaluate(({ snap, cam, openMap }) => {
    const f = window.__moonshot.flight;
    f.applySnapshot(snap);
    if (window.__moonshot.getLang() !== 'zh') window.__moonshot.setLang('zh');
    f.refreshHUD?.();
    if (cam) {
      if (cam.dist != null) f.camCtl.dist = cam.dist;
      if (cam.el != null) f.camCtl.el = cam.el;
      if (cam.az != null) f.camCtl.az = cam.az;
    }
    if (openMap) {
      if (!f.mapOpen) f.toggleMap();
      if (f.st.body === 'duna') f.map.cam.dist = 8e7;
      else if (f.st.body === 'mun') f.map.cam.dist = 1.6e7;
      else if (f.st.body === 'kerbol') f.map.cam.dist = 3.2e10;
      else f.map.cam.dist = 1.1e8;
      if (f.st.body === 'kerbol') f.map.cam.el = 0.55;
      f.refreshMapNow();
    } else if (f.mapOpen) {
      f.toggleMap();
    }
  }, { snap, cam, openMap: map });
  await page.waitForTimeout(800);
}

process.env.DISPLAY = process.env.DISPLAY || ':3';

const available = listSnapshots();
console.log('snapshots:', available.map((s) => s.tag).join(', ') || '(none)');

const { server, browser, page, errors } = await boot();
const results = [];
try {
  // Prove toggle works both ways, end on zh.
  const langs = await page.evaluate(() => {
    const m = window.__moonshot;
    const a = m.getLang();
    m.setLang('en');
    const b = m.getLang();
    const launchEn = document.getElementById('btn-launch')?.textContent;
    m.setLang('zh');
    const c = m.getLang();
    const launchZh = document.getElementById('btn-launch')?.textContent;
    const langBtn = document.getElementById('btn-lang')?.textContent;
    return { a, b, c, launchEn, launchZh, langBtn };
  });
  console.log('lang toggle:', JSON.stringify(langs));
  if (langs.b !== 'en' || langs.c !== 'zh') throw new Error('setLang did not persist/toggle');
  if (!/发射/.test(langs.launchZh || '')) throw new Error(`Launch button not Chinese: ${langs.launchZh}`);
  if (langs.langBtn !== 'EN') throw new Error(`Lang button should show EN when zh: ${langs.langBtn}`);

  // 1) VAB with stock Mun Express
  await page.click('#btn-stock-mun');
  await page.waitForTimeout(1500);
  results.push({ name: 'i18n-zh-vab.png', ...(await grabFrame(page, join(SHOT_DIR, 'i18n-zh-vab.png'))) });

  // 2) Enter flight / pad
  await page.click('#btn-launch');
  await page.waitForFunction(() => window.__moonshot?.flight?.active, { timeout: 10000 });
  await page.waitForTimeout(4000);
  const pre = pickSnap(available, ['PRELAUNCH', 'pad', 'prelaunch']);
  if (pre) {
    await applySnap(page, pre.snap, { map: false, cam: { dist: 32, el: 0.28, az: 0.55 } });
  }
  results.push({ name: 'i18n-zh-pad.png', ...(await grabFrame(page, join(SHOT_DIR, 'i18n-zh-pad.png'))) });

  // 3) LKO map
  const lko = pickSnap(available, ['MECO_ORBIT', 'MECO', 'LKO']);
  if (lko) {
    await applySnap(page, lko.snap, { map: true, cam: { dist: 160, el: -0.12, az: 0.85 } });
    results.push({ name: 'i18n-zh-lko-map.png', ...(await grabFrame(page, join(SHOT_DIR, 'i18n-zh-lko-map.png'))) });
  } else {
    console.log('  skip i18n-zh-lko-map: no MECO_ORBIT snapshot');
  }

  // 4) Duna map
  const duna = pickSnap(available, ['DUNA_ORBIT']);
  if (duna) {
    await applySnap(page, duna.snap, { map: true, cam: { dist: 600, el: -0.28, az: 0.7 } });
    results.push({ name: 'i18n-zh-duna-map.png', ...(await grabFrame(page, join(SHOT_DIR, 'i18n-zh-duna-map.png'))) });
  } else {
    console.log('  skip i18n-zh-duna-map: no DUNA_ORBIT snapshot');
  }

  // HUD chrome probe
  const chrome = await page.evaluate(() => ({
    lang: window.__moonshot.getLang(),
    launch: document.getElementById('btn-launch')?.textContent,
    revert: document.getElementById('btn-revert')?.textContent,
    situation: document.getElementById('situation')?.textContent,
    alt: document.getElementById('ro-alt')?.textContent,
    orbit: document.getElementById('orbit-title')?.textContent,
    stages: document.querySelector('#stage-panel h3')?.textContent,
    map: document.getElementById('btn-map')?.textContent,
  }));
  console.log('hud chrome:', JSON.stringify(chrome, null, 2));
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

for (const r of results) {
  console.log(`  ${r.real3d ? '3D   ' : 'WEAK '}  ${r.name}  ${r.bytes} B  scene=${r.sceneBytes}  comp=${r.composited}`);
}

writeFileSync(join(SHOT_DIR, 'i18n-index.json'), JSON.stringify({
  at: new Date().toISOString(),
  results: results.map(({ path, ...rest }) => rest),
  errors: errors.slice(0, 20),
}, null, 2));

console.log('\nConsole errors:', errors.length);
for (const e of errors.slice(0, 8)) console.log('  •', String(e).slice(0, 240));
process.exit(results.length >= 3 ? 0 : 2);
