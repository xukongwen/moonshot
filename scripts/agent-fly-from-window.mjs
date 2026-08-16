// Re-fly Duna from the window snapshot, one agent node at a time. No LLM.
// Escape / coast / capture / jettison / land / rise / home. Stop on first fail.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callTool, session } from '../mcp/server.mjs';
import { completeNode, createState } from '../src/agent-plan.js';
import { readFlightCheck, roleEngines, transferFuelKg, vInfEst } from '../src/agent-muscles.js';
import { serializeSnapshot, writeSnapshot } from '../mcp/snapshot.mjs';
import { hohmannTransfer } from '../src/orbits.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const LOG_DIR = join(ROOT, 'logs');
const SNAP_DIR = join(ROOT, 'logs/snapshots');
const WINDOW_SNAP = join(SNAP_DIR, 'agent-fly-window.json');
const OUT = join(LOG_DIR, 'agent-fly-duna-result.json');
mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(SNAP_DIR, { recursive: true });

function nowIso() {
  return new Date().toISOString();
}

function wallMs(t0) {
  return Date.now() - t0;
}

function ignitedNames(st) {
  return (st?.parts ?? [])
    .filter((p) => p.alive !== false && p.ignited && p.def?.engine)
    .map((p) => p.def.name);
}

function rolesNow(st) {
  const { lander, transfer } = roleEngines(st);
  return {
    landerName: lander?.def?.name ?? null,
    transferName: transfer?.def?.name ?? null,
    ignited: ignitedNames(st),
    transferFuelKg: transferFuelKg(st),
  };
}

function dumpSnap(tag) {
  if (!session.st) return null;
  const snap = serializeSnapshot(session.st, { tag, craft: session.craftName });
  const path = writeSnapshot(snap, SNAP_DIR);
  return { tag, path, t: snap.t, body: snap.body, landed: snap.landed, dead: snap.dead };
}

function nodeRecord(nodeId, stepOut, extra = {}) {
  const check = session.st ? readFlightCheck(session.st, { stageIdx: session.stageIdx ?? 0 }) : null;
  const roles = session.st ? rolesNow(session.st) : {};
  let vInf = null;
  try {
    if (session.st && session.st.body === 'kerbin') vInf = vInfEst(session.st);
  } catch { vInf = null; }
  return {
    nodeId,
    ok: !!stepOut?.ok,
    stub: !!stepOut?.stub,
    thought: stepOut?.thought ?? session.agent?.thought ?? '',
    nextId: stepOut?.nextId ?? session.agent?.nodeId ?? null,
    t: session.st?.t ?? null,
    body: check?.body ?? null,
    landed: check?.landed ?? null,
    dead: check?.dead ?? null,
    peKm: check?.peKm ?? null,
    apKm: check?.apKm ?? null,
    orbitText: check?.orbitText ?? null,
    fuelKg: check?.fuelKg ?? null,
    transferFuelKg: roles.transferFuelKg ?? null,
    landerName: roles.landerName ?? null,
    transferName: roles.transferName ?? null,
    ignited: roles.ignited ?? [],
    stageIdx: session.stageIdx ?? check?.stageIdx ?? null,
    vInf,
    ...extra,
  };
}

const prior = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const xfer = hohmannTransfer('kerbin', 'duna');

const result = {
  startedAt: nowIso(),
  snapshot: 'logs/snapshots/agent-fly-window.json',
  vInfTarget: xfer.vInfDep,
  change: 'escape burns transfer to computed Hohmann v∞; no 50 kg mid-course starve; never light Sparrow',
  llm: false,
  invented: false,
  nodes: [],
  snapshots: {},
  stopped: null,
  verdict: null,
  prior: prior?.nodes ? {
    startedAt: prior.startedAt ?? null,
    finishedAt: prior.finishedAt ?? null,
    verdict: prior.verdict ?? null,
    nodes: prior.nodes,
  } : (prior?.prior ?? null),
};

console.log('== agent-fly-from-window', result.startedAt);
console.log('Hohmann vInfDep', xfer.vInfDep.toFixed(2));

callTool('ksp_lang', { lang: 'zh' });
callTool('ksp_new_flight', { craft: 'Duna Hauler' });
session.loadSnapshot(WINDOW_SNAP, { craft: 'Duna Hauler' });
const tlm0 = session.telemetry();
const check0 = readFlightCheck(session.st, { stageIdx: session.stageIdx ?? 0 });
console.log('loaded window', JSON.stringify({
  body: tlm0.body,
  situation: tlm0.situation,
  fuel_kg: tlm0.fuel_kg,
  pe_m: tlm0.pe_m,
  ap_m: tlm0.ap_m,
  orbit: check0.orbitText,
  transferFuelKg: transferFuelKg(session.st),
  ignited: ignitedNames(session.st),
  t: session.st.t,
}));

const planned = callTool('ksp_agent_plan', { text: '去火星再回来' });
console.log('plan', planned.missionId, planned.current?.id, planned.thought);

let agent = session.agent;
agent = completeNode(agent, 'ascent');
agent = completeNode(agent, 'window');
session.agent = createState({
  ...agent,
  snapshots: {
    ...(agent.snapshots ?? {}),
    window: serializeSnapshot(session.st, { tag: 'agent-window', craft: session.craftName }),
  },
});
console.log('current node', session.agent.nodeId);

const ORDER = ['escape', 'coast', 'capture', 'jettison', 'land', 'rise', 'home'];
for (const id of ORDER) {
  if (session.agent?.nodeId !== id) {
    console.log('skip', id, 'current is', session.agent?.nodeId);
    break;
  }
  console.log(`== ksp_agent_step ${id}`);
  const t0 = Date.now();
  let out;
  try {
    out = callTool('ksp_agent_step');
  } catch (err) {
    console.error(id, 'THREW', err);
    out = { ok: false, thought: String(err?.stack || err), reason: 'threw' };
  }
  const rec = nodeRecord(id, out, { wallMs: wallMs(t0) });
  result.nodes.push(rec);
  result.snapshots[id] = dumpSnap(`agent-fly-${id}`);
  console.log(id, JSON.stringify({
    ok: rec.ok,
    thought: rec.thought,
    body: rec.body,
    orbitText: rec.orbitText,
    fuelKg: rec.fuelKg,
    transferFuelKg: rec.transferFuelKg,
    ignited: rec.ignited,
    vInf: rec.vInf,
    landed: rec.landed,
    dead: rec.dead,
    nextId: rec.nextId,
    wallMs: rec.wallMs,
  }, null, 2));
  if (!out?.ok) {
    result.stopped = { nodeId: id, reason: rec.thought };
    result.verdict = `failed on ${id}: ${rec.thought}`;
    break;
  }
}

if (!result.verdict) {
  const last = result.nodes[result.nodes.length - 1];
  const home = result.nodes.find((n) => n.nodeId === 'home');
  const land = result.nodes.find((n) => n.nodeId === 'land');
  if (home?.ok && home.body === 'kerbin') {
    result.verdict = home.landed
      ? 'home: landed on kerbin (real touchdown).'
      : `home: kerbin ${home.body === 'kerbin' ? 'encounter/capture' : 'not kerbin'}.`;
  } else if (land?.ok && land.body === 'duna' && land.landed) {
    result.verdict = `campaign reached land on duna; stopped after ${last?.nodeId}.`;
  } else {
    result.verdict = `campaign reached ${last?.nodeId} (body ${last?.body}).`;
  }
}

result.finishedAt = nowIso();
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log('wrote', OUT);
console.log('verdict', result.verdict);
