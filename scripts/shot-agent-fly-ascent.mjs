// Headed shot of the real ascent-fail snapshot. No invented telemetry.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
const SNAP_DIR = join(ROOT, 'logs/snapshots');
mkdirSync(SHOT_DIR, { recursive: true });
process.env.DISPLAY = process.env.DISPLAY || ':3';

const result = JSON.parse(readFileSync(join(ROOT, 'logs/agent-fly-duna-result.json'), 'utf8'));
const snap = JSON.parse(readFileSync(join(SNAP_DIR, 'agent-fly-ascent.json'), 'utf8'));
const rec = result.nodes.find((n) => n.nodeId === 'ascent');

const server = await createServer({
  root: ROOT,
  server: { port: 5221, strictPort: false, host: '127.0.0.1' },
});
await server.listen();
const url = server.resolvedUrls.local[0];
console.log('serving', url, 'DISPLAY', process.env.DISPLAY);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [
    '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist',
    '--window-position=0,0', '--window-size=1500,900',
  ],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__moonshot?.flight && window.__moonshot?.agent, { timeout: 25000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__moonshot.setLang('zh'));
  await page.click('#btn-stock-duna');
  await page.waitForTimeout(600);
  await page.click('#btn-launch');
  await page.waitForFunction(() => window.__moonshot?.flight?.active, { timeout: 15000 });
  await page.waitForTimeout(1800);

  const patch = {
    open: true,
    goal: '去火星再回来',
    missionId: 'duna-roundtrip',
    nodeId: 'ascent',
    nodes: [
      { id: 'ascent', label: '入轨', status: 'current' },
      { id: 'window', label: '等窗口', status: 'pending' },
      { id: 'escape', label: '逃逸', status: 'pending' },
      { id: 'coast', label: '滑行', status: 'pending' },
      { id: 'capture', label: '捕获', status: 'pending' },
      { id: 'jettison', label: '丢掉转移级', status: 'pending' },
      { id: 'land', label: '着陆', status: 'pending' },
      { id: 'rise', label: '上升', status: 'pending' },
      { id: 'home', label: '回家', status: 'pending' },
    ],
    thought: rec?.thought || '',
    thoughts: (result.nodes || []).map((n) => n.thought).filter(Boolean),
    running: false,
    snapshots: { ascent: { tag: 'agent-ascent' } },
  };

  const probe = await page.evaluate(({ snap, patch }) => {
    const m = window.__moonshot;
    m.setLang('zh');
    m.agent.toggle(true);
    const ok = !!m.flight.applySnapshot(snap);
    if (m.flight.mapOpen) m.flight.toggleMap();
    m.flight.camCtl.dist = 180;
    m.flight.camCtl.el = -0.35;
    m.flight.camCtl.az = 0.85;
    m.flight.refreshHUD?.();
    m.flight.refreshViz?.();
    m.agent.set(patch);
    const panel = document.getElementById('agent-panel');
    const th = document.getElementById('agent-thought');
    th?.scrollIntoView({ block: 'nearest' });
    return {
      ok,
      body: m.flight.st?.body,
      thought: th?.textContent ?? '',
      hidden: panel?.classList.contains('hidden'),
      situation: document.getElementById('situation')?.textContent,
    };
  }, { snap, patch });
  console.log('ascent', JSON.stringify(probe));
  await page.locator('#agent-panel').waitFor({ state: 'visible' });
  await page.waitForTimeout(700);
  const out = join(SHOT_DIR, 'agent-fly-ascent.png');
  await page.screenshot({ path: out, type: 'png' });
  console.log('wrote', out, readFileSync(out).length);
  writeFileSync(join(SHOT_DIR, 'agent-fly-ascent-index.json'), JSON.stringify({
    at: new Date().toISOString(),
    probe,
    errors: errors.slice(0, 12),
    thought: rec?.thought,
    body: rec?.body,
    orbitText: rec?.orbitText,
  }, null, 2));
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}
console.log('errors', errors.length);
