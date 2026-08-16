// A2 proof: type 去火星再回来, Plan, shot the agent panel.
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
    return { composited: false };
  }
  return { composited: true };
}

process.env.DISPLAY = process.env.DISPLAY || ':3';

const server = await createServer({
  root: ROOT,
  server: { port: 5220, strictPort: false, host: '127.0.0.1' },
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

const out = join(SHOT_DIR, 'agent-plan-a2.png');
const hudOut = join(SHOT_DIR, 'agent-plan-a2-hud.png');
const domOut = join(SHOT_DIR, 'agent-plan-a2-dom.png');

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__moonshot?.flight && window.__moonshot?.agent, { timeout: 25000 });
  await page.waitForTimeout(2000);

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
  await page.waitForTimeout(1500);

  const input = page.locator('#agent-goal-input');
  await input.click();
  await input.fill('');
  await input.type('去火星再回来', { delay: 20 });
  await page.locator('#btn-agent-plan').click();
  await page.waitForTimeout(400);

  const probe = await page.evaluate(() => {
    const p = document.getElementById('agent-panel');
    const st = window.__moonshot.agent.get();
    return {
      hidden: p?.classList.contains('hidden'),
      text: p?.innerText ?? '',
      goal: st.goal,
      thought: st.thought,
      nodes: st.nodes.map((n) => `${n.status}:${n.label}`),
      missionId: st.missionId,
      open: st.open,
    };
  });
  console.log('probe', JSON.stringify(probe, null, 2));

  const readable = !probe.hidden
    && /入轨/.test(probe.text)
    && /去火星再回来/.test(probe.text)
    && /预算/.test(probe.text);
  if (!readable) {
    throw new Error('agent panel not readable: ' + JSON.stringify(probe).slice(0, 400));
  }

  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(200);

  await page.screenshot({ path: hudOut, type: 'png' });
  await page.locator('#agent-panel').screenshot({ path: domOut, type: 'png' });

  const scenePath = out.replace(/\.png$/, '.__scene.png');
  try {
    const b64 = await page.evaluate(() => {
      const c = document.querySelector('#app > canvas') || document.querySelector('canvas');
      return c.toDataURL('image/png').split(',')[1];
    });
    writeFileSync(scenePath, Buffer.from(b64, 'base64'));
    const scene = looks3d(scenePath);
    if (scene.real3d) {
      const tmp = out.replace(/\.png$/, '.__comp.png');
      composite(scenePath, hudOut, tmp);
      const r = spawnSync('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', tmp, '-i', hudOut,
        '-filter_complex',
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
  const dom = looks3d(domOut);
  console.log(`agent-plan-a2.png     ${main.bytes} B`);
  console.log(`agent-plan-a2-dom.png ${dom.bytes} B`);
  if (main.bytes < 20000) throw new Error('agent-plan-a2.png too small');
  if (dom.bytes < 4000) throw new Error('agent-plan-a2-dom.png too small');
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

console.log('\nConsole errors:', errors.length);
for (const e of errors.slice(0, 8)) console.log('  •', String(e).slice(0, 240));
process.exit(0);
