// Surface + map shots of the real Kerbin capture/land snapshots. No invented telemetry.
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
  return order.map((id) => {
    let status = 'pending';
    if (done.has(id)) status = 'done';
    else if (id === upTo) status = 'current';
    return { id, label: labels[id], status };
  });
}

function panelFor(nodeId, thought) {
  const rec = result.nodes.find((n) => n.nodeId === nodeId);
  const thoughts = result.nodes.map((n) => n.thought).filter(Boolean);
  return {
    open: true,
    goal: '去火星再回来',
    missionId: 'duna-roundtrip',
    nodeId,
    nodes: nodesFromResult(nodeId),
    thought: thought || rec?.thought || '',
    thoughts,
    running: false,
    snapshots: { [nodeId]: { tag: `agent-${nodeId}` } },
  };
}

const JOBS = [
  {
    snap: 'agent-fly-kerbin-capture.json',
    out: 'agent-fly-kerbin-capture.png',
    map: true,
    dist: 220,
    el: 0.7,
    thought: result.capture?.ok
      ? `捕获到 kerbin。轨道 ${result.capture.orbitText}，剩油 ${Math.round(result.capture.fuelKg)} kg。`
      : '',
  },
  {
    snap: 'agent-fly-kerbin-land.json',
    out: 'agent-fly-kerbin-land.png',
    map: false,
    dist: 14,
    el: 0.18,
    thought: result.nodes.find((n) => n.nodeId === 'home')?.thought || '',
  },
].filter((j) => existsSync(join(SNAP_DIR, j.snap)));

const server = await createServer({
  root: ROOT,
  server: { port: 5226, strictPort: false, host: '127.0.0.1' },
});
await server.listen();
const url = server.resolvedUrls.local[0];
console.log('serving', url, 'DISPLAY', process.env.DISPLAY, 'jobs', JOBS.map((j) => j.out).join(','));

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
    const snap = JSON.parse(readFileSync(join(SNAP_DIR, job.snap), 'utf8'));
    const patch = panelFor('home', job.thought);
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
      const sit = document.getElementById('situation')?.textContent;
      const agl = document.getElementById('agl')?.textContent
        || document.getElementById('alt')?.textContent;
      return {
        ok,
        body: m.flight.st?.body,
        landed: !!m.flight.st?.landed,
        dead: !!m.flight.st?.dead,
        thought: th?.textContent ?? '',
        hidden: panel?.classList.contains('hidden'),
        situation: sit,
        agl,
        mapOpen: !!m.flight.mapOpen,
        names,
      };
    }, { snap, patch, map: job.map, dist: job.dist, el: job.el });
    console.log(job.out, JSON.stringify(probe));
    await page.locator('#agent-panel').waitFor({ state: 'visible' });
    await page.waitForTimeout(1000);
    const out = join(SHOT_DIR, job.out);
    await page.screenshot({ path: out, type: 'png' });
    shots.push({
      name: job.out,
      bytes: readFileSync(out).length,
      body: probe.body,
      landed: probe.landed,
      mapOpen: probe.mapOpen,
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

writeFileSync(join(SHOT_DIR, 'agent-fly-kerbin-home-index.json'), JSON.stringify({
  at: new Date().toISOString(),
  shots,
  errors: errors.slice(0, 12),
}, null, 2));
console.log('errors', errors.length);
for (const s of shots) console.log(s.name, s.bytes, s.body, s.landed, s.mapOpen, (s.thought || '').slice(0, 80));
