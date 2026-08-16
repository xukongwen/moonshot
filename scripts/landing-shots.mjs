// Landing proof shots. Headed Chrome + canvas.toDataURL (rdv-shots pattern).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readSnapshot } from '../mcp/snapshot.mjs';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
mkdirSync(SHOT_DIR, { recursive: true });

const RADII = { mun: 200_000, duna: 320_000, kerbin: 600_000 };

const JOBS = [
  { snap: 'mun-landed', out: 'mun-landed.png', stock: '#btn-stock-mun', body: 'mun' },
  { snap: 'mun-kerbin-return', out: 'mun-kerbin-return.png', stock: '#btn-stock-mun', body: 'kerbin' },
  { snap: 'duna-landed', out: 'duna-landed.png', stock: '#btn-stock-duna', body: 'duna' },
  { snap: 'duna-kerbin-return', out: 'duna-kerbin-return.png', stock: '#btn-stock-duna', body: 'kerbin' },
].filter((j) => existsSync(join(ROOT, 'logs/snapshots', `${j.snap}.json`)));

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

async function grabWithRetry(page, path) {
  let last = await grabFrame(page, path);
  for (let i = 0; i < 4 && !last.real3d; i++) {
    console.log('  retry', path.split('/').pop(), 'bytes', last.bytes, 'scene', last.sceneBytes);
    await page.waitForTimeout(1500);
    last = await grabFrame(page, path);
  }
  return last;
}

async function boot() {
  const server = await createServer({
    root: ROOT,
    server: { port: 5214, strictPort: false, host: '127.0.0.1' },
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

process.env.DISPLAY = process.env.DISPLAY || ':3';

if (!JOBS.length) {
  console.error('no snapshots found');
  process.exit(2);
}

const { server, browser, page, errors } = await boot();
const results = [];
try {
  for (const job of JOBS) {
    const snap = readSnapshot(join(ROOT, 'logs/snapshots', `${job.snap}.json`));
    console.log('\n==', job.out, 'snap', snap.tag, 'body', snap.body, 'landed', snap.landed);
    await page.goto((await server.resolvedUrls).local[0], { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__moonshot?.flight && window.__moonshot?.setLang, { timeout: 25000 });
    await page.waitForTimeout(800);
    await page.click(job.stock);
    await page.waitForTimeout(800);
    await page.click('#btn-launch');
    await page.waitForFunction(() => window.__moonshot?.flight?.active, { timeout: 15000 });
    await page.waitForTimeout(3000);

    const applied = await page.evaluate((snap) => {
      const f = window.__moonshot.flight;
      const ok = f.applySnapshot(snap);
      if (f.mapOpen) f.toggleMap();
      f.camCtl.dist = snap.body === 'kerbin' ? 55 : 42;
      f.camCtl.el = 0.28;
      f.camCtl.az = 0.9;
      f.refreshHUD?.();
      f.refreshViz?.();
      const st = f.st;
      return {
        ok, body: st.body, landed: st.landed, dead: st.dead,
        alt: st.pos.length(),
        situation: document.getElementById('situation')?.textContent,
      };
    }, snap);
    console.log('  apply', JSON.stringify(applied));
    if (!applied.ok) throw new Error(`applySnapshot failed for ${job.snap}`);
    await page.waitForTimeout(2500);
    const out = join(SHOT_DIR, job.out);
    const grab = await grabWithRetry(page, out);
    results.push({ name: job.out, body: applied.body, landed: applied.landed, ...grab });
    console.log('  grab', grab.bytes, 'real3d', grab.real3d, 'scene', grab.sceneBytes);
  }
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

console.log('\nConsole errors:', errors.length);
for (const e of errors.slice(0, 8)) console.log('  •', String(e).slice(0, 240));
for (const r of results) {
  console.log(`  ${r.real3d ? '3D   ' : 'WEAK '}  ${r.name}  ${r.bytes} B  scene=${r.sceneBytes}  landed=${r.landed} body=${r.body}`);
}
writeFileSync(join(SHOT_DIR, 'landing-index.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
const need = ['mun-landed.png'];
const missing = need.filter((n) => !results.some((r) => r.name === n && r.real3d));
process.exit(missing.length ? 2 : 0);
