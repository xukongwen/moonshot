// A3: panel with 走一步 visible + a plan loaded. Do not wait for a full ascent.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
mkdirSync(SHOT_DIR, { recursive: true });

process.env.DISPLAY = process.env.DISPLAY || ':3';

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

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__moonshot?.flight, { timeout: 25000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__moonshot.setLang('zh'));
  await page.click('#btn-stock-duna');
  await page.waitForTimeout(800);
  await page.click('#btn-launch');
  await page.waitForFunction(() => window.__moonshot?.flight?.active, { timeout: 10000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const a = window.__moonshot.agent;
    a.toggle(true);
    a.plan('去火星再回来');
  });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const btn = document.getElementById('btn-agent-step');
    const panel = document.getElementById('agent-panel');
    const st = window.__moonshot.agent.get();
    return {
      btnText: btn?.textContent ?? null,
      btnDisabled: btn?.disabled ?? null,
      panelHidden: panel?.classList.contains('hidden') ?? null,
      goal: st.goal,
      nodeId: st.nodeId,
      nodes: st.nodes.length,
      thought: st.thought,
    };
  });
  console.log('panel', JSON.stringify(info));
  const out = join(SHOT_DIR, 'agent-step-a3.png');
  await page.screenshot({ path: out, type: 'png' });
  console.log('wrote', out);
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}
console.log('errors', errors.length);
for (const e of errors.slice(0, 8)) console.log('  •', String(e).slice(0, 240));
