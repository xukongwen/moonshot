// Headed shots of the real Raven Hauler campaign snapshots. No invented telemetry.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
const SNAP_DIR = join(ROOT, 'logs/snapshots');
mkdirSync(SHOT_DIR, { recursive: true });
process.env.DISPLAY = process.env.DISPLAY || ':3';

const result = JSON.parse(readFileSync(join(ROOT, 'logs/agent-fly-duna-result.json'), 'utf8'));

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
    snapshots: { [nodeId]: { tag: `agent-${nodeId}` } },
  };
}

const JOBS = [
  { name: 'ascent', out: 'agent-fly-ascent.png', map: false, dist: 180, el: -0.35 },
  { name: 'escape', out: 'agent-fly-escape.png', map: false, dist: 160, el: -0.45 },
  { name: 'coast', out: 'agent-fly-coast.png', map: true, dist: 220, el: 0.85 },
  { name: 'capture', out: 'agent-fly-capture.png', map: true, dist: 200, el: 0.7 },
  { name: 'land', out: 'agent-fly-land.png', map: false, dist: 40, el: -0.25 },
  { name: 'rise', out: 'agent-fly-rise.png', map: false, dist: 80, el: -0.3 },
  { name: 'home', out: 'agent-fly-home.png', map: true, dist: 220, el: 0.7 },
].filter((j) => existsSync(join(SNAP_DIR, `agent-fly-${j.name}.json`)));

const server = await createServer({
  root: ROOT,
  server: { port: 5224, strictPort: false, host: '127.0.0.1' },
});
await server.listen();
const url = server.resolvedUrls.local[0];
console.log('serving', url, 'DISPLAY', process.env.DISPLAY, 'jobs', JOBS.map((j) => j.name).join(','));

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
    const snap = JSON.parse(readFileSync(join(SNAP_DIR, `agent-fly-${job.name}.json`), 'utf8'));
    const patch = panelFor(job.name);
    const probe = await page.evaluate(({ snap, patch, map, dist, el }) => {
      const m = window.__moonshot;
      m.setLang('zh');
      m.agent.toggle(true);
      const ok = !!m.flight.applySnapshot(snap);
      if (map && !m.flight.mapOpen) m.flight.toggleMap();
      if (!map && m.flight.mapOpen) m.flight.toggleMap();
      m.flight.camCtl.dist = dist;
      m.flight.camCtl.el = el;
      m.flight.camCtl.az = 0.85;
      m.flight.refreshHUD?.();
      m.flight.refreshViz?.();
      m.agent.set(patch);
      const panel = document.getElementById('agent-panel');
      const th = document.getElementById('agent-thought');
      th?.scrollIntoView({ block: 'nearest' });
      const names = (m.flight.st?.parts ?? [])
        .filter((p) => p.alive !== false)
        .map((p) => p.def?.name)
        .filter(Boolean);
      return {
        ok,
        body: m.flight.st?.body,
        landed: !!m.flight.st?.landed,
        dead: !!m.flight.st?.dead,
        thought: th?.textContent ?? '',
        hidden: panel?.classList.contains('hidden'),
        situation: document.getElementById('situation')?.textContent,
        names,
      };
    }, { snap, patch, map: job.map, dist: job.dist, el: job.el });
    console.log(job.name, JSON.stringify(probe));
    await page.locator('#agent-panel').waitFor({ state: 'visible' });
    await page.waitForTimeout(800);
    const out = join(SHOT_DIR, job.out);
    await page.screenshot({ path: out, type: 'png' });
    shots.push({
      name: job.out,
      bytes: readFileSync(out).length,
      body: probe.body,
      landed: probe.landed,
      thought: probe.thought,
      situation: probe.situation,
      names: probe.names,
    });
    console.log('wrote', out, readFileSync(out).length);
  }
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 8000)),
  ]);
}

writeFileSync(join(SHOT_DIR, 'agent-fly-duna-index.json'), JSON.stringify({
  at: new Date().toISOString(),
  shots,
  errors: errors.slice(0, 12),
}, null, 2));
console.log('errors', errors.length);
for (const s of shots) console.log(s.name, s.bytes, s.body, s.landed, (s.thought || '').slice(0, 80));
