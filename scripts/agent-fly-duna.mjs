// Honest pad→LKO flight of the agent MCP path. No LLM. No invented telemetry.
// Uses ksp_new_flight / ksp_agent_plan / ksp_agent_get / ksp_agent_step.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callTool, session } from '../mcp/server.mjs';
import { readFlightCheck } from '../src/agent-muscles.js';
import { serializeSnapshot, writeSnapshot } from '../mcp/snapshot.mjs';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const LOG_DIR = join(ROOT, 'logs');
const SNAP_DIR = join(ROOT, 'logs/snapshots');
mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(SNAP_DIR, { recursive: true });

function nowIso() {
  return new Date().toISOString();
}

function wallS(t0) {
  return (Date.now() - t0) / 1000;
}

function checkNow() {
  if (!session.st) return null;
  return readFlightCheck(session.st, { stageIdx: session.stageIdx ?? 0 });
}

function agentPanel() {
  const a = session.agent;
  return {
    goal: a?.goal ?? '',
    missionId: a?.missionId ?? null,
    nodeId: a?.nodeId ?? null,
    thought: a?.thought ?? '',
    thoughts: [...(a?.thoughts ?? [])],
    nodes: (a?.nodes ?? []).map((n) => ({ id: n.id, label: n.label, status: n.status })),
    running: !!a?.running,
    snapshotIds: a?.snapshots && typeof a.snapshots === 'object'
      ? Object.keys(a.snapshots).filter((id) => a.snapshots[id])
      : [],
  };
}

function dumpSnap(tag) {
  if (!session.st) return null;
  const snap = serializeSnapshot(session.st, { tag, craft: session.craftName });
  const path = writeSnapshot(snap, SNAP_DIR);
  return { tag, path, t: snap.t, body: snap.body, landed: snap.landed, dead: snap.dead };
}

function nodeRecord(id, stepOut, extra = {}) {
  const check = checkNow();
  const tlm = session.st ? session.telemetry() : null;
  return {
    id,
    ok: !!stepOut?.ok,
    stub: !!stepOut?.stub,
    reason: stepOut?.reason ?? null,
    thought: stepOut?.thought ?? session.agent?.thought ?? '',
    current: stepOut?.current ?? null,
    nextId: stepOut?.nextId ?? session.agent?.nodeId ?? null,
    peKm: check?.peKm ?? null,
    apKm: check?.apKm ?? null,
    orbitText: check?.orbitText ?? null,
    fuelKg: check?.fuelKg ?? null,
    stage: check?.stageIdx ?? null,
    body: check?.body ?? null,
    altKm: check?.altKm ?? null,
    landed: check?.landed ?? null,
    dead: check?.dead ?? null,
    met_s: session.st?.t ?? null,
    tlm_pe_m: tlm?.pe_m ?? null,
    tlm_ap_m: tlm?.ap_m ?? null,
    tlm_fuel_kg: tlm?.fuel_kg ?? null,
    ...extra,
  };
}

const wall0 = Date.now();
const result = {
  at: nowIso(),
  craft: 'Duna Hauler',
  goal: '去火星再回来',
  path: 'mcp/callTool ksp_agent_*',
  llm: false,
  invented: false,
  plan: null,
  nodes: [],
  circularized: false,
  escapeStubbed: false,
  escapeAdvanced: null,
  wallClock_s: null,
  bugFixed: null,
  snapshots: {},
  panels: {},
  verdict: null,
};

console.log('== agent-fly-duna  start', nowIso());

callTool('ksp_lang', { lang: 'zh' });
const flight = callTool('ksp_new_flight', { craft: 'Duna Hauler' });
console.log('pad', JSON.stringify({
  craft: flight.craft,
  situation: flight.situation,
  landed: flight.landed,
  body: flight.body,
  fuel_kg: flight.fuel_kg,
  alt_m: flight.alt_m,
}));

const planned = callTool('ksp_agent_plan', { text: '去火星再回来' });
const got = callTool('ksp_agent_get');
result.plan = {
  missionId: got.missionId,
  goal: got.goal,
  thought: got.thought,
  thoughts: got.thoughts,
  nodes: got.nodes,
  current: got.current,
  plan: got.plan,
  visible: got.visible,
};
result.panels.plan = agentPanel();
result.snapshots.plan = dumpSnap('agent-fly-pad');
console.log('plan', JSON.stringify({
  missionId: got.missionId,
  current: got.current,
  nodes: got.nodes,
  thought: got.thought,
  planOk: got.plan,
}, null, 2));

// Progress logger around the real 0.05s physics loop (does not change physics).
const origStep = session.step.bind(session);
let lastLogT = -999;
session.step = (seconds, dt) => {
  const out = origStep(seconds, dt);
  const st = session.st;
  if (st && st.t - lastLogT >= 25) {
    lastLogT = st.t;
    const c = readFlightCheck(st, { stageIdx: session.stageIdx });
    console.log(
      `  ascent MET ${st.t.toFixed(1)}s  ${c.orbitText}  alt=${c.altKm != null ? c.altKm.toFixed(1) : '—'} km`
      + `  fuel=${c.fuelKg != null ? c.fuelKg.toFixed(0) : '—'} kg  stage=${session.stageIdx}`
      + `  landed=${st.landed} dead=${!!st.dead} wall=${wallS(wall0).toFixed(0)}s`,
    );
  }
  return out;
};

console.log('== ksp_agent_step 入轨  (ASCENT_MAX_S=800, dt=0.05)');
const tAscent = Date.now();
let ascent;
try {
  ascent = callTool('ksp_agent_step');
} catch (err) {
  console.error('ascent THREW', err);
  ascent = { ok: false, thought: String(err?.stack || err), reason: 'threw' };
}
session.step = origStep;

const ascentRec = nodeRecord('ascent', ascent, { wallClock_s: wallS(tAscent) });
result.nodes.push(ascentRec);
result.circularized = !!(ascentRec.ok && ascentRec.peKm != null && ascentRec.peKm > 70
  && ascentRec.apKm != null && Number.isFinite(ascentRec.apKm));
result.panels.orbit = agentPanel();
result.snapshots.orbit = dumpSnap('agent-fly-orbit');
console.log('ascent result', JSON.stringify({
  ok: ascent.ok,
  stub: ascent.stub,
  reason: ascent.reason,
  thought: ascent.thought,
  current: ascent.current,
  nextId: ascent.nextId,
  nodes: ascent.nodes,
  peKm: ascentRec.peKm,
  apKm: ascentRec.apKm,
  fuelKg: ascentRec.fuelKg,
  met_s: ascentRec.met_s,
  wallClock_s: ascentRec.wallClock_s,
}, null, 2));

if (ascent.ok) {
  console.log('== ksp_agent_step 等窗口');
  const tWin = Date.now();
  let windowOut;
  try {
    windowOut = callTool('ksp_agent_step');
  } catch (err) {
    console.error('window THREW', err);
    windowOut = { ok: false, thought: String(err?.stack || err), reason: 'threw' };
  }
  const winRec = nodeRecord('window', windowOut, { wallClock_s: wallS(tWin) });
  result.nodes.push(winRec);
  result.panels.window = agentPanel();
  result.snapshots.window = dumpSnap('agent-fly-window');
  console.log('window result', JSON.stringify({
    ok: windowOut.ok,
    stub: windowOut.stub,
    thought: windowOut.thought,
    current: windowOut.current,
    nextId: windowOut.nextId,
    peKm: winRec.peKm,
    apKm: winRec.apKm,
    fuelKg: winRec.fuelKg,
    met_s: winRec.met_s,
    wallClock_s: winRec.wallClock_s,
  }, null, 2));

  console.log('== ksp_agent_step 逃逸  (expect honest stub)');
  const tEsc = Date.now();
  const beforeNode = session.agent?.nodeId;
  let escapeOut;
  try {
    escapeOut = callTool('ksp_agent_step');
  } catch (err) {
    console.error('escape THREW', err);
    escapeOut = { ok: false, thought: String(err?.stack || err), reason: 'threw' };
  }
  const afterNode = session.agent?.nodeId;
  const escRec = nodeRecord('escape', escapeOut, {
    wallClock_s: wallS(tEsc),
    nodeBefore: beforeNode,
    nodeAfter: afterNode,
    advanced: beforeNode !== afterNode,
  });
  result.nodes.push(escRec);
  result.escapeStubbed = !!escapeOut.stub || /还没肌肉/.test(escapeOut.thought || '');
  result.escapeAdvanced = beforeNode !== afterNode;
  result.panels.stuck = agentPanel();
  result.snapshots.stuck = dumpSnap('agent-fly-stuck');
  console.log('escape result', JSON.stringify({
    ok: escapeOut.ok,
    stub: escapeOut.stub,
    thought: escapeOut.thought,
    current: escapeOut.current,
    nodeBefore: beforeNode,
    nodeAfter: afterNode,
    advanced: beforeNode !== afterNode,
  }, null, 2));
} else {
  result.panels.stuck = agentPanel();
  result.snapshots.stuck = dumpSnap('agent-fly-stuck');
  console.log('skip window/escape — 入轨 did not succeed');
}

result.wallClock_s = wallS(wall0);
const ascentOk = result.nodes.find((n) => n.id === 'ascent')?.ok === true;
const windowOk = result.nodes.find((n) => n.id === 'window')?.ok === true;
const escapeHonest = result.escapeStubbed && result.escapeAdvanced === false;
if (ascentOk && windowOk && escapeHonest) {
  result.verdict = 'agent path can reach LKO and the Duna window, then honest-stops at 逃逸 (no muscle). Cannot yet go to Duna.';
} else if (ascentOk && !windowOk) {
  result.verdict = 'agent path circularized but 等窗口 failed. Cannot yet go to Duna.';
} else if (!ascentOk) {
  result.verdict = 'agent path cannot yet go to Duna: 入轨 from the pad did not circularize.';
} else {
  result.verdict = 'agent path cannot yet go to Duna (escape did not refuse honestly, or unexpected state).';
}

const outPath = join(LOG_DIR, 'agent-fly-duna-result.json');
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log('wrote', outPath);
console.log('verdict', result.verdict);
console.log('wall', result.wallClock_s.toFixed(1), 's');
