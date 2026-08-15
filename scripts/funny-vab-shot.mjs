// Screenshot the MCP-built funny craft in the VAB (headed Chrome + WebGPU).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
const CRAFT_PATH = join(ROOT, 'logs/funny-craft.json');
mkdirSync(SHOT_DIR, { recursive: true });

process.env.DISPLAY = process.env.DISPLAY || ':3';

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

async function boot() {
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
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__moonshot?.vab, { timeout: 25000 });
  await page.waitForTimeout(2500);
  return { server, browser, page, errors };
}

if (!existsSync(CRAFT_PATH)) {
  console.error('missing', CRAFT_PATH, '— run scripts/mcp-funny-craft.mjs first');
  process.exit(2);
}

const craft = JSON.parse(readFileSync(CRAFT_PATH, 'utf8'));
const design = craft.design ?? { name: craft.name, stack: craft.stack, radials: craft.radials };
console.log('injecting', design.name, 'stack', design.stack.length, 'radials', design.radials.length);

const { server, browser, page, errors } = await boot();
const results = [];
try {
  await page.evaluate((design) => {
    window.__moonshot.setLang('zh');
    const vab = window.__moonshot.vab;
    vab.design = structuredClone(design);
    vab.selected = 0;
    document.getElementById('craft-name').value = design.name;
    vab.refresh();
  }, { name: design.name, stack: design.stack, radials: design.radials });

  await page.waitForTimeout(2000);
  let shot = await grabFrame(page, join(SHOT_DIR, 'funny-vab.png'));
  results.push({ name: 'funny-vab.png', attempt: 1, ...shot });
  console.log('attempt 1', shot);

  if (!shot.real3d || shot.sceneBytes < 110000) {
    console.log('weak/black canvas — wait longer and re-frame');
    await page.evaluate(() => {
      const vab = window.__moonshot.vab;
      const h = vab.group?.userData?.geom?.totalLength ?? 20;
      vab.ctx.frame?.(h);
      vab.refresh();
    });
    await page.waitForTimeout(4000);
    shot = await grabFrame(page, join(SHOT_DIR, 'funny-vab.png'));
    results.push({ name: 'funny-vab.png', attempt: 2, ...shot });
    console.log('attempt 2', shot);
  }

  if (!shot.composited || !shot.real3d) {
    const hudPath = join(SHOT_DIR, 'funny-vab-hud.png');
    await page.screenshot({ path: hudPath, type: 'png' });
    results.push({ name: 'funny-vab-hud.png', fallback: true, ...looks3d(hudPath) });
    console.log('wrote HUD fallback', hudPath);
  }

  const live = await page.evaluate(() => {
    const vab = window.__moonshot.vab;
    return {
      lang: window.__moonshot.getLang(),
      name: vab.design.name,
      stack: [...vab.design.stack],
      radials: vab.design.radials.map((r) => ({ part: r.part, sym: r.sym, host: r.host })),
      craftNameField: document.getElementById('craft-name')?.value,
      launch: document.getElementById('btn-launch')?.textContent,
    };
  });
  console.log('live vab', JSON.stringify(live, null, 2));
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

writeFileSync(join(SHOT_DIR, 'funny-vab-index.json'), JSON.stringify({
  at: new Date().toISOString(),
  results,
  errors: errors.slice(0, 20),
}, null, 2));

for (const r of results) {
  console.log(`  ${r.real3d ? '3D   ' : 'WEAK '}  ${r.name}  ${r.bytes} B  scene=${r.sceneBytes ?? '-'}  comp=${r.composited}`);
}
console.log('console errors:', errors.length);
for (const e of errors.slice(0, 8)) console.log('  •', String(e).slice(0, 240));

const last = [...results].reverse().find((r) => r.name === 'funny-vab.png');
process.exit(last?.real3d ? 0 : 2);
