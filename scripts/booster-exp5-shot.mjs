// Headed shot of R5: landed Titan + agent panel with real recover thought.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
const SNAP = join(ROOT, 'logs/snapshots/booster-exp5-booster.json');
const RESULT = join(ROOT, 'logs/booster-exp5.json');
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

if (!existsSync(SNAP) || !existsSync(RESULT)) {
  console.error('missing snapshot or result');
  process.exit(2);
}
const snap = JSON.parse(readFileSync(SNAP, 'utf8'));
const result = JSON.parse(readFileSync(RESULT, 'utf8'));
const design = result.design;
const agent = result.agent;
const upper = (result.vessels ?? []).find((v) => !v.titan);

process.env.DISPLAY = process.env.DISPLAY || ':3';

const server = await createServer({
  root: ROOT,
  server: { port: 5225, strictPort: false, host: '127.0.0.1' },
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

  const probe = await page.evaluate(({ design, snap, agent, upper }) => {
    const m = window.__moonshot;
    m.setLang('zh');
    m.enterFlight(design);
    m.flight.applySnapshot(snap);
    const names = m.flight.st.parts.filter((p) => p.alive !== false).map((p) => p.def.name);
    m.flight.legsDeployed = m.flight.st.parts.some((p) => p.legsDown);
    if (upper?.peKm != null && upper?.apKm != null && m.flight.spawnOrbital) {
      const stack = (m.STOCK && m.STOCK['Mun Express']?.stack)
        ? m.STOCK['Mun Express'].stack.slice(0, 12)
        : ['pod-mk1', 'chute', 'heat-shield', 'decoupler-s', 'tank-m', 'tank-s', 'eng-kestrel'];
      try {
        m.flight.spawnOrbital({ name: upper.name || 'Mun Express', stack, radials: [] }, {
          body: 'kerbin',
          pe_m: upper.peKm * 1000,
          ap_m: upper.apKm * 1000,
          name: upper.name || 'Mun Express',
        });
      } catch (e) {
        console.error('spawn upper', e.message);
      }
    }
    m.flight.refreshViz();
    m.flight.camCtl.dist = 48;
    m.flight.camCtl.el = 0.22;
    m.flight.camCtl.az = 0.85;
    m.flight.refreshHUD?.();
    const a = m.agent;
    a.toggle(true);
    a.set({
      open: true,
      goal: '登月回来',
      missionId: 'mun-roundtrip',
      nodeId: agent.current?.id || 'window',
      nodes: agent.nodes,
      thought: agent.thought,
      thoughts: agent.thoughts,
      running: false,
    });
    const panel = document.getElementById('agent-panel');
    const thoughtEl = document.getElementById('agent-thought');
    return {
      body: m.flight.st.body,
      landed: m.flight.st.landed,
      dead: m.flight.st.dead,
      nParts: m.flight.st.parts.length,
      names,
      nVessels: (m.flight.vessels ?? []).length,
      vesselNames: (m.flight.vessels ?? []).map((v) => v.name),
      panelHidden: panel?.classList.contains('hidden') ?? null,
      thought: thoughtEl?.textContent ?? a.get()?.thought,
      nodeLabels: (a.get()?.nodes ?? []).map((n) => n.label),
    };
  }, { design, snap, agent, upper });
  console.log('probe', JSON.stringify(probe));
  await page.waitForTimeout(4000);

  const out = join(SHOT_DIR, 'booster-exp5.png');
  last = await grabFrame(page, out);
  for (let i = 0; i < 4 && !last.real3d; i++) {
    console.log('  retry bytes', last.bytes);
    await page.waitForTimeout(1500);
    last = await grabFrame(page, out);
  }
  console.log(last.real3d ? '3D' : 'WEAK', 'booster-exp5.png', last.bytes, 'scene', last.sceneBytes, 'comp', last.composited);
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

for (const e of errors.slice(0, 8)) console.log('err', String(e).slice(0, 240));
process.exit(last.real3d ? 0 : 2);
