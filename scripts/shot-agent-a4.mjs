// A4: panel with 回退 visible + a plan loaded. Do not wait for a full ascent.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
mkdirSync(SHOT_DIR, { recursive: true });

process.env.DISPLAY = process.env.DISPLAY || ':3';

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
    const step = document.getElementById('btn-agent-step');
    const rev = document.getElementById('btn-agent-revert');
    const panel = document.getElementById('agent-panel');
    const st = window.__moonshot.agent.get();
    return {
      stepText: step?.textContent ?? null,
      revertText: rev?.textContent ?? null,
      revertDisabled: rev?.disabled ?? null,
      panelHidden: panel?.classList.contains('hidden') ?? null,
      panelText: panel?.innerText ?? '',
      goal: st.goal,
      nodeId: st.nodeId,
      nodes: st.nodes.length,
      thought: st.thought,
      hasRevertApi: typeof window.__moonshot.agent.revert === 'function',
    };
  });
  console.log('panel', JSON.stringify(info));
  if (!info.revertText || !/回退/.test(info.revertText)) {
    throw new Error('回退 button not visible: ' + JSON.stringify(info));
  }
  if (!info.hasRevertApi) throw new Error('agent.revert missing');
  const out = join(SHOT_DIR, 'agent-revert-a4.png');
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
