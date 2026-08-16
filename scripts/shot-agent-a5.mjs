// Pad panel + injected dry-transfer thought. No full TDI.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const OUT = join(ROOT, 'logs/shots/agent-check-a5.png');
mkdirSync(join(ROOT, 'logs/shots'), { recursive: true });

const server = await createServer({
  root: ROOT,
  server: { port: 5215, strictPort: false, host: '127.0.0.1' },
});
await server.listen();
const url = server.resolvedUrls.local[0];
console.log('serving at', url);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__moonshot?.flight, { timeout: 25000 });
await page.evaluate(() => window.__moonshot.setLang('zh'));
await page.click('#btn-stock-duna');
await page.waitForTimeout(800);
await page.click('#btn-launch');
await page.waitForFunction(() => window.__moonshot?.flight?.active, { timeout: 15000 });
await page.waitForTimeout(1500);

const injected = await page.evaluate(() => {
  window.__moonshot.agent.plan('去火星再回来');
  const flight = window.__moonshot.flight;
  const parts = flight.st?.parts ?? [];
  const raven = parts.find((p) => /Raven/.test(p.def?.name || ''));
  const sparrow = parts.find((p) => /Sparrow/.test(p.def?.name || ''));
  let zeroed = 0;
  if (raven && sparrow) {
    for (const p of parts) {
      if (p.stackIndex > sparrow.stackIndex && p.stackIndex <= raven.stackIndex && p.fuel) {
        zeroed += p.fuel;
        p.fuel = 0;
      }
    }
  }
  const s = window.__moonshot.agent.get();
  const done = new Set(['ascent', 'window', 'escape', 'coast']);
  window.__moonshot.agent.set({
    nodeId: 'capture',
    nodes: s.nodes.map((n) => ({
      ...n,
      status: n.id === 'capture' ? 'current' : (done.has(n.id) ? 'done' : 'pending'),
    })),
  });
  const out = window.__moonshot.agent.check();
  return {
    thought: out.thought,
    thoughts: out.thoughts,
    flags: out.flags,
    transferFuelKg: out.transferFuelKg,
    raven: raven?.def?.name ?? null,
    sparrow: sparrow?.def?.name ?? null,
    zeroed,
    node: window.__moonshot.agent.get().nodeId,
  };
});
console.log('injected', JSON.stringify(injected, null, 2));

await page.waitForTimeout(400);
await page.locator('#agent-panel').waitFor({ state: 'visible' });
await page.screenshot({ path: OUT, type: 'png' });
console.log('wrote', OUT);

await Promise.race([
  (async () => { await browser.close(); await server.close(); })(),
  new Promise((r) => setTimeout(r, 5000)),
]);

if (!injected.thoughts?.some((t) => /Raven|Falcon|转移级/.test(t) && t.includes('着陆器'))) {
  console.error('screenshot thought missing dry-transfer warning', injected.thoughts);
  process.exit(2);
}
console.log('Console errors:', errors.length);
for (const e of errors.slice(0, 6)) console.log('  •', String(e).slice(0, 200));
process.exit(0);
