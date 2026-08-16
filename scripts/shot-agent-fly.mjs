// Headed Chrome page shots of the agent panel after a real pad flight.
// Loads session snapshots + recorded panel state. No invented telemetry.

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
const padSnap = JSON.parse(readFileSync(join(SNAP_DIR, 'agent-fly-pad.json'), 'utf8'));
const orbitSnap = JSON.parse(readFileSync(join(SNAP_DIR, 'agent-fly-orbit.json'), 'utf8'));
const stuckSnap = JSON.parse(readFileSync(join(SNAP_DIR, 'agent-fly-stuck.json'), 'utf8'));

function panelPatch(kind) {
  const p = result.panels[kind];
  if (!p) throw new Error('missing panel ' + kind);
  const snaps = {};
  for (const id of p.snapshotIds ?? []) snaps[id] = { tag: 'agent-' + id };
  let thought = p.thought;
  if (kind === 'orbit') {
    thought = result.nodes.find((n) => n.id === 'ascent')?.thought || p.thought;
  }
  if (kind === 'stuck') {
    thought = result.nodes.find((n) => n.id === 'escape')?.thought
      || result.nodes.find((n) => n.id === 'window')?.thought
      || p.thought;
  }
  return {
    open: true,
    goal: p.goal,
    missionId: p.missionId,
    nodeId: p.nodeId,
    nodes: p.nodes,
    thought,
    thoughts: p.thoughts,
    running: false,
    snapshots: snaps,
  };
}

const JOBS = [
  { name: 'plan', out: 'agent-fly-plan.png', snap: padSnap, panel: 'plan', applySnap: false },
  { name: 'orbit', out: 'agent-fly-orbit.png', snap: orbitSnap, panel: 'orbit', applySnap: true },
  { name: 'stuck', out: 'agent-fly-stuck.png', snap: stuckSnap, panel: 'stuck', applySnap: true },
];

const server = await createServer({
  root: ROOT,
  server: { port: 5216, strictPort: false, host: '127.0.0.1' },
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
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

const shots = [];

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__moonshot?.flight && window.__moonshot?.agent, { timeout: 25000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__moonshot.setLang('zh'));
  await page.click('#btn-stock-duna');
  await page.waitForTimeout(800);
  await page.click('#btn-launch');
  await page.waitForFunction(() => window.__moonshot?.flight?.active, { timeout: 15000 });
  await page.waitForTimeout(2500);

  for (const job of JOBS) {
    console.log('\n==', job.out);
    const patch = panelPatch(job.panel);
    const applied = await page.evaluate(({ snap, patch, applySnap }) => {
      const m = window.__moonshot;
      m.setLang('zh');
      m.agent.toggle(true);
      let snapOk = true;
      if (applySnap) {
        snapOk = !!m.flight.applySnapshot(snap);
        if (m.flight.mapOpen) m.flight.toggleMap();
        const alt = m.flight.st.pos.length() - 600000;
        m.flight.camCtl.dist = snap.landed ? 36 : (alt > 50000 ? 180 : 80);
        m.flight.camCtl.el = snap.landed ? 0.28 : -0.45;
        m.flight.camCtl.az = 0.85;
        m.flight.refreshHUD?.();
        m.flight.refreshViz?.();
      } else {
        m.flight.camCtl.dist = 36;
        m.flight.camCtl.el = 0.28;
        m.flight.camCtl.az = 0.55;
        m.flight.refreshHUD?.();
      }
      m.agent.set(patch);
      const st = m.agent.get();
      const panel = document.getElementById('agent-panel');
      return {
        snapOk,
        body: m.flight.st?.body,
        landed: m.flight.st?.landed,
        t: m.flight.st?.t,
        hidden: panel?.classList.contains('hidden'),
        text: panel?.innerText ?? '',
        goal: st.goal,
        nodeId: st.nodeId,
        thought: st.thought,
        nodes: st.nodes.map((n) => n.status + ':' + n.label),
        situation: document.getElementById('situation')?.textContent,
      };
    }, { snap: job.snap, patch, applySnap: job.applySnap });
    console.log('probe', JSON.stringify(applied, null, 2));

    await page.locator('#agent-panel').waitFor({ state: 'visible' });
    await page.waitForTimeout(800);

    const out = join(SHOT_DIR, job.out);
    await page.screenshot({ path: out, type: 'png' });
    const bytes = readFileSync(out).length;
    const readable = !applied.hidden
      && /入轨/.test(applied.text)
      && /去火星再回来/.test(applied.text);
    shots.push({
      name: job.out,
      bytes,
      readable,
      hidden: applied.hidden,
      thought: applied.thought,
      nodeId: applied.nodeId,
      nodes: applied.nodes,
      situation: applied.situation,
      snapOk: applied.snapOk,
    });
    console.log('wrote', out, bytes, 'readable', readable);
  }
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

writeFileSync(join(SHOT_DIR, 'agent-fly-index.json'), JSON.stringify({
  at: new Date().toISOString(),
  shots,
  errors: errors.slice(0, 20),
}, null, 2));

console.log('\nConsole errors:', errors.length);
for (const e of errors.slice(0, 8)) console.log('  •', String(e).slice(0, 240));
for (const s of shots) {
  console.log((s.readable ? 'OK   ' : 'WEAK ') + s.name + '  ' + s.bytes + ' B  node=' + s.nodeId);
}
if (shots.length < 3 || shots.some((s) => s.bytes < 20000 || !s.readable)) {
  process.exit(2);
}
process.exit(0);
