// Re-shoot orbit + stuck with #agent-thought scrolled into view + panel crop.
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
const orbitSnap = JSON.parse(readFileSync(join(SNAP_DIR, 'agent-fly-orbit.json'), 'utf8'));
const stuckSnap = JSON.parse(readFileSync(join(SNAP_DIR, 'agent-fly-stuck.json'), 'utf8'));

function panelPatch(kind) {
  const p = result.panels[kind];
  const snaps = {};
  for (const id of p.snapshotIds ?? []) snaps[id] = { tag: 'agent-' + id };
  let thought = p.thought;
  if (kind === 'orbit') thought = result.nodes.find((n) => n.id === 'ascent')?.thought || p.thought;
  if (kind === 'stuck') thought = result.nodes.find((n) => n.id === 'escape')?.thought || p.thought;
  return {
    open: true, goal: p.goal, missionId: p.missionId, nodeId: p.nodeId,
    nodes: p.nodes, thought, thoughts: p.thoughts, running: false, snapshots: snaps,
  };
}

const JOBS = [
  { name: 'orbit', out: 'agent-fly-orbit.png', snap: orbitSnap, panel: 'orbit' },
  { name: 'stuck', out: 'agent-fly-stuck.png', snap: stuckSnap, panel: 'stuck' },
];

const server = await createServer({
  root: ROOT,
  server: { port: 5217, strictPort: false, host: '127.0.0.1' },
});
await server.listen();
const url = server.resolvedUrls.local[0];
console.log('serving', url);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [
    '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist',
    '--window-position=0,0', '--window-size=1500,900',
  ],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__moonshot?.flight && window.__moonshot?.agent, { timeout: 25000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__moonshot.setLang('zh'));
  await page.click('#btn-stock-duna');
  await page.waitForTimeout(600);
  await page.click('#btn-launch');
  await page.waitForFunction(() => window.__moonshot?.flight?.active, { timeout: 15000 });
  await page.waitForTimeout(2000);

  for (const job of JOBS) {
    const patch = panelPatch(job.panel);
    const probe = await page.evaluate(({ snap, patch }) => {
      const m = window.__moonshot;
      m.setLang('zh');
      m.agent.toggle(true);
      const ok = !!m.flight.applySnapshot(snap);
      if (m.flight.mapOpen) m.flight.toggleMap();
      m.flight.camCtl.dist = 180;
      m.flight.camCtl.el = -0.45;
      m.flight.camCtl.az = 0.85;
      m.flight.refreshHUD?.();
      m.flight.refreshViz?.();
      m.agent.set(patch);
      const panel = document.getElementById('agent-panel');
      const th = document.getElementById('agent-thought');
      th?.scrollIntoView({ block: 'nearest' });
      panel?.scrollTo(0, panel.scrollHeight);
      return {
        ok,
        thought: th?.textContent ?? '',
        thoughtH: th?.getBoundingClientRect()?.height ?? 0,
        panelH: panel?.clientHeight ?? 0,
        panelScroll: panel?.scrollHeight ?? 0,
        text: panel?.innerText ?? '',
      };
    }, { snap: job.snap, patch });
    console.log(job.name, JSON.stringify(probe));
    await page.waitForTimeout(600);
    const out = join(SHOT_DIR, job.out);
    await page.screenshot({ path: out, type: 'png' });
    const crop = join(SHOT_DIR, job.out.replace('.png', '-panel.png'));
    await page.locator('#agent-panel').screenshot({ path: crop, type: 'png' });
    console.log('wrote', out, readFileSync(out).length, 'panel', readFileSync(crop).length);
  }
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}
