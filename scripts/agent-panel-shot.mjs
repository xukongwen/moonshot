// Agent panel proof shot. Headed Chrome; page.screenshot of flight HUD (DOM panel).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { STOCK } from '../src/stock.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
mkdirSync(SHOT_DIR, { recursive: true });

const CRAFT = { name: 'Duna Hauler', ...STOCK['Duna Hauler'] };

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
    copyFileSync(hudPath, outPath);
    return { composited: false, err: (r.stderr || r.stdout || '').slice(0, 200) };
  }
  return { composited: true };
}

process.env.DISPLAY = process.env.DISPLAY || ':3';

const server = await createServer({
  root: ROOT,
  server: { port: 5218, strictPort: false, host: '127.0.0.1' },
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

const out = join(SHOT_DIR, 'agent-panel.png');
const hudOut = join(SHOT_DIR, 'agent-panel-hud.png');
const domOut = join(SHOT_DIR, 'agent-panel-dom.png');

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__moonshot?.flight && window.__moonshot?.agent, { timeout: 25000 });
  await page.waitForTimeout(2500);

  await page.evaluate((craft) => {
    const m = window.__moonshot;
    m.setLang('zh');
    m.enterFlight(craft);
    m.agent.toggle(true);
    m.flight.camCtl.dist = 36;
    m.flight.camCtl.el = 0.28;
    m.flight.camCtl.az = 0.55;
    m.flight.refreshHUD?.();
  }, CRAFT);

  await page.waitForFunction(() => window.__moonshot?.flight?.active, { timeout: 10000 });
  await page.waitForTimeout(3500);

  const probe = await page.evaluate(() => {
    const p = document.getElementById('agent-panel');
    const st = window.__moonshot.agent.get();
    return {
      hidden: p?.classList.contains('hidden'),
      text: p?.innerText ?? '',
      goal: st.goal,
      thought: st.thought,
      nodes: st.nodes.map((n) => `${n.status}:${n.label}`),
      nodeId: st.nodeId,
      open: st.open,
      situation: document.getElementById('situation')?.textContent,
    };
  });
  console.log('probe', JSON.stringify(probe, null, 2));

  const readable = !probe.hidden
    && /入轨/.test(probe.text)
    && /去火星再回来/.test(probe.text)
    && /总图已写/.test(probe.text);
  if (!readable) {
    throw new Error('agent panel not readable in DOM: ' + JSON.stringify(probe).slice(0, 400));
  }

  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(300);

  // Full page: canvas-as-displayed + DOM HUD (panel lives here).
  await page.screenshot({ path: hudOut, type: 'png' });
  const panel = page.locator('#agent-panel');
  await panel.screenshot({ path: domOut, type: 'png' });

  const scenePath = out.replace(/\.png$/, '.__scene.png');
  try {
    const b64 = await page.evaluate(() => {
      const c = document.querySelector('#app > canvas') || document.querySelector('canvas');
      return c.toDataURL('image/png').split(',')[1];
    });
    writeFileSync(scenePath, Buffer.from(b64, 'base64'));
    const scene = looks3d(scenePath);
    if (scene.real3d) {
      // Composite 3D + HUD, then paste the DOM panel back so colorkey cannot eat it.
      const tmp = out.replace(/\.png$/, '.__comp.png');
      composite(scenePath, hudOut, tmp);
      const r = spawnSync('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', tmp, '-i', hudOut,
        '-filter_complex',
        // keep the right-side HUD strip (orbit + agent) from the page shot
        '[1]crop=320:ih-70:iw-330:60[r];[0][r]overlay=W-320:60',
        out,
      ], { encoding: 'utf8' });
      if (r.status !== 0) copyFileSync(hudOut, out);
      try { unlinkSync(tmp); } catch { /* keep */ }
    } else {
      copyFileSync(hudOut, out);
    }
  } catch {
    copyFileSync(hudOut, out);
  }
  try { unlinkSync(scenePath); } catch { /* keep */ }

  const main = looks3d(out);
  const hud = looks3d(hudOut);
  const dom = looks3d(domOut);
  console.log(`agent-panel.png      ${main.bytes} B`);
  console.log(`agent-panel-hud.png  ${hud.bytes} B`);
  console.log(`agent-panel-dom.png  ${dom.bytes} B`);

  if (main.bytes < 20000) throw new Error('agent-panel.png too small / black frame');
  if (dom.bytes < 4000) throw new Error('agent-panel-dom.png too small');

  writeFileSync(join(SHOT_DIR, 'agent-panel-index.json'), JSON.stringify({
    at: new Date().toISOString(),
    probe,
    bytes: { main: main.bytes, hud: hud.bytes, dom: dom.bytes },
    errors: errors.slice(0, 20),
  }, null, 2));
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

console.log('\nConsole errors:', errors.length);
for (const e of errors.slice(0, 8)) console.log('  •', String(e).slice(0, 240));
process.exit(0);
