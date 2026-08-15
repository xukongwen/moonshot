// Rendezvous / docking proof shots. Headed Chrome + canvas.toDataURL.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
mkdirSync(SHOT_DIR, { recursive: true });

const DOCK_CRAFT = {
  name: 'Docker',
  stack: ['dock-port-s', 'pod-mk1', 'rcs-block', 'tank-s', 'eng-kestrel'],
  radials: [],
};

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
  await page.waitForTimeout(200);
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

async function boot() {
  const server = await createServer({
    root: ROOT,
    server: { port: 5212, strictPort: false, host: '127.0.0.1' },
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

async function grabWithRetry(page, path) {
  let last = await grabFrame(page, path);
  for (let i = 0; i < 3 && !last.real3d; i++) {
    console.log('  retry', path.split('/').pop(), 'bytes', last.bytes);
    await page.waitForTimeout(1500);
    last = await grabFrame(page, path);
  }
  return last;
}

process.env.DISPLAY = process.env.DISPLAY || ':3';

const { server, browser, page, errors } = await boot();
const results = [];
try {
  await page.evaluate((craft) => {
    const m = window.__moonshot;
    m.setLang('zh');
    m.enterFlight(craft);
    m.flight.putInOrbit({ body: 'kerbin', ap_m: 80_000, pe_m: 80_000, ta_deg: 0 });
    const tgt = m.flight.spawnOrbital(craft, {
      body: 'kerbin', ap_m: 100_000, pe_m: 100_000, ta_deg: 25, name: '目标',
    });
    m.flight.setTarget(tgt.id);
    m.flight.camCtl.dist = 90;
    m.flight.camCtl.el = -0.15;
    m.flight.camCtl.az = 0.8;
    m.flight.refreshHUD?.();
  }, DOCK_CRAFT);
  await page.waitForFunction(() => window.__moonshot?.flight?.active, { timeout: 10000 });
  await page.waitForTimeout(4000);

  const hud1 = await page.evaluate(() => ({
    target: document.getElementById('ro-target')?.textContent,
    range: document.getElementById('ro-range')?.textContent,
    closing: document.getElementById('ro-closing')?.textContent,
    dock: document.getElementById('ro-dock')?.textContent,
    hidden: document.getElementById('rdv-panel')?.classList.contains('hidden'),
    situation: document.getElementById('situation')?.textContent,
    vessels: window.__moonshot.flight.vessels?.length,
    range_m: window.__moonshot.flight.relativeNav()?.range_m,
  }));
  console.log('hud probe 1', JSON.stringify(hud1));

  // map with two ships
  await page.evaluate(() => {
    const f = window.__moonshot.flight;
    if (!f.mapOpen) f.toggleMap();
    f.map.cam.dist = 2.2e6;
    f.map.cam.el = 0.85;
    f.map.cam.az = 0.4;
    f.refreshMapNow();
  });
  await page.waitForTimeout(1500);
  results.push({ name: 'rdv-map.png', ...(await grabWithRetry(page, join(SHOT_DIR, 'rdv-map.png'))) });

  // HUD flight view
  await page.evaluate(() => {
    const f = window.__moonshot.flight;
    if (f.mapOpen) f.toggleMap();
    f.camCtl.dist = 70;
    f.camCtl.el = 0.2;
    f.refreshHUD?.();
  });
  await page.waitForTimeout(900);
  results.push({ name: 'rdv-hud.png', ...(await grabWithRetry(page, join(SHOT_DIR, 'rdv-hud.png'))) });

  // close approach
  await page.evaluate((craft) => {
    const f = window.__moonshot.flight;
    f.putInOrbit({ body: 'kerbin', ap_m: 90_000, pe_m: 90_000, ta_deg: 10 });
    const tgt = f.vesselById(f.targetId);
    if (tgt) {
      tgt.st.pos.copy(f.st.pos).add(new f.st.pos.constructor(18, 6, 4));
      tgt.st.vel.copy(f.st.vel);
      tgt.st.quat.copy(f.st.quat);
      tgt.st.body = f.st.body;
    }
    f.camCtl.dist = 28;
    f.camCtl.el = 0.18;
    f.camCtl.az = 0.9;
    f.refreshHUD?.();
  }, DOCK_CRAFT);
  await page.waitForTimeout(1000);
  results.push({ name: 'rdv-close.png', ...(await grabWithRetry(page, join(SHOT_DIR, 'rdv-close.png'))) });

  // hard dock
  await page.evaluate(() => {
    const f = window.__moonshot.flight;
    f.placeFacingForShot(0.7);
    const r = f.dock();
    window.__dockResult = r;
    f.camCtl.dist = 16;
    f.camCtl.el = 0.25;
    f.camCtl.az = 1.1;
    f.refreshHUD?.();
  });
  await page.waitForTimeout(1000);
  const dockProbe = await page.evaluate(() => ({
    result: window.__dockResult,
    dockState: window.__moonshot.flight.dockState,
    hudDock: document.getElementById('ro-dock')?.textContent,
    range: document.getElementById('ro-range')?.textContent,
  }));
  console.log('dock probe', JSON.stringify(dockProbe));
  results.push({ name: 'dock-hard.png', ...(await grabWithRetry(page, join(SHOT_DIR, 'dock-hard.png'))) });
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

for (const r of results) {
  console.log(`  ${r.real3d ? '3D   ' : 'WEAK '}  ${r.name}  ${r.bytes} B  scene=${r.sceneBytes}  comp=${r.composited}`);
}

writeFileSync(join(SHOT_DIR, 'rdv-index.json'), JSON.stringify({
  at: new Date().toISOString(),
  results: results.map(({ path, ...rest }) => rest),
  errors: errors.slice(0, 20),
}, null, 2));

console.log('\nConsole errors:', errors.length);
for (const e of errors.slice(0, 8)) console.log('  •', String(e).slice(0, 240));
process.exit(results.length >= 4 ? 0 : 2);
