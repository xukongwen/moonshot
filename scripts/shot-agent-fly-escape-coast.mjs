// Headed shots of the real escape / coast snapshots. No invented telemetry.
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
const escapeSnap = JSON.parse(readFileSync(join(SNAP_DIR, 'agent-fly-escape.json'), 'utf8'));
const coastSnap = JSON.parse(readFileSync(join(SNAP_DIR, 'agent-fly-coast.json'), 'utf8'));

function nodesFromResult(upTo) {
  const order = ['ascent', 'window', 'escape', 'coast', 'capture', 'jettison', 'land', 'rise', 'home'];
  const labels = {
    ascent: '入轨', window: '等窗口', escape: '逃逸', coast: '滑行',
    capture: '捕获', jettison: '丢掉转移级', land: '着陆', rise: '上升', home: '回家',
  };
  const done = new Set(result.nodes.filter((n) => n.ok).map((n) => n.nodeId));
  const failed = result.nodes.find((n) => !n.ok)?.nodeId;
  return order.map((id) => {
    let status = 'pending';
    if (done.has(id)) status = 'done';
    else if (id === upTo) status = 'current';
    else if (id === failed && upTo === failed) status = 'current';
    return { id, label: labels[id], status };
  });
}

function panelFor(nodeId) {
  const rec = result.nodes.find((n) => n.nodeId === nodeId);
  const thoughts = result.nodes.map((n) => n.thought).filter(Boolean);
  return {
    open: true,
    goal: '去火星再回来',
    missionId: 'duna-roundtrip',
    nodeId,
    nodes: nodesFromResult(nodeId),
    thought: rec?.thought || '',
    thoughts,
    running: false,
    snapshots: { window: { tag: 'agent-window' }, escape: { tag: 'agent-escape' } },
  };
}

const JOBS = [
  { name: 'escape', out: 'agent-fly-escape.png', snap: escapeSnap, map: false, dist: 160 },
  { name: 'coast', out: 'agent-fly-coast.png', snap: coastSnap, map: true, dist: 220 },
];

const server = await createServer({
  root: ROOT,
  server: { port: 5220, strictPort: false, host: '127.0.0.1' },
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
const shots = [];

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

  for (const job of JOBS) {
    const patch = panelFor(job.name);
    const probe = await page.evaluate(({ snap, patch, map, dist }) => {
      const m = window.__moonshot;
      m.setLang('zh');
      m.agent.toggle(true);
      const ok = !!m.flight.applySnapshot(snap);
      if (map && !m.flight.mapOpen) m.flight.toggleMap();
      if (!map && m.flight.mapOpen) m.flight.toggleMap();
      m.flight.camCtl.dist = dist;
      m.flight.camCtl.el = map ? 0.85 : -0.45;
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
        text: panel?.innerText ?? '',
        hidden: panel?.classList.contains('hidden'),
        situation: document.getElementById('situation')?.textContent,
      };
    }, { snap: job.snap, patch, map: job.map, dist: job.dist });
    console.log(job.name, JSON.stringify(probe));
    await page.locator('#agent-panel').waitFor({ state: 'visible' });
    await page.waitForTimeout(700);
    const out = join(SHOT_DIR, job.out);
    await page.screenshot({ path: out, type: 'png' });
    shots.push({
      name: job.out,
      bytes: readFileSync(out).length,
      body: probe.body,
      thought: probe.thought,
      situation: probe.situation,
      hidden: probe.hidden,
    });
    console.log('wrote', out, readFileSync(out).length);
  }
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

writeFileSync(join(SHOT_DIR, 'agent-fly-escape-coast-index.json'), JSON.stringify({
  at: new Date().toISOString(),
  shots,
  errors: errors.slice(0, 12),
}, null, 2));
console.log('errors', errors.length);
for (const s of shots) console.log(s.name, s.bytes, s.body, (s.thought || '').slice(0, 80));
