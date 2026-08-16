// Re-fly rise + home from the lander-only Duna land snapshot. No LLM.
// One agent node at a time. Appends the same result JSON. Never lights Raven.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callTool, session } from '../mcp/server.mjs';
import { completeNode, createState } from '../src/agent-plan.js';
import { readFlightCheck, roleEngines, transferFuelKg, vInfEst } from '../src/agent-muscles.js';
import { serializeSnapshot, writeSnapshot } from '../mcp/snapshot.mjs';
import { BODIES, getBodyState } from '../src/constants.js';
import { elementsFromState, findEncounter, hohmannTransfer, propagate } from '../src/orbits.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const LOG_DIR = join(ROOT, 'logs');
const SNAP_DIR = join(ROOT, 'logs/snapshots');
const LAND_SNAP = join(SNAP_DIR, 'agent-fly-land.json');
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

function closestApproach(st, childName, horizon) {
  let el;
  try {
    el = elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
  } catch {
    return { d: null, t: null };
  }
  const t0 = st.t;
  let best = { d: Infinity, t: t0 };
  const steps = 1600;
  const dt = horizon / steps;
  for (let i = 0; i <= steps; i++) {
    const tt = t0 + i * dt;
    const { pos } = propagate(el, tt);
    const d = pos.distanceTo(getBodyState(childName, tt).pos);
    if (d < best.d) best = { d, t: tt };
  }
  return best;
}

function encounterInfo(st, dest) {
  if (!st || st.body !== 'kerbol') {
    return { ca_m: null, encPe_m: null, enc: false };
  }
  const xfer = hohmannTransfer(dest === 'kerbin' ? 'duna' : 'kerbin', dest);
  const horizon = (xfer.tT || 6.5e6) * 2.2;
  const ca = closestApproach(st, dest, horizon);
  let enc = null;
  try {
    const el = elementsFromState(st.pos, st.vel, BODIES[st.body].mu, st.t);
    enc = findEncounter(el, st.t, horizon, dest);
  } catch { enc = null; }
  return {
    ca_m: Number.isFinite(ca.d) ? ca.d : null,
    encPe_m: enc?.periapsis ?? null,
    enc: !!enc,
  };
}

function nodeRecord(nodeId, stepOut, extra = {}) {
  const check = session.st ? readFlightCheck(session.st, { stageIdx: session.stageIdx ?? 0 }) : null;
  const roles = session.st ? rolesNow(session.st) : {};
  let vInf = null;
  try {
    if (session.st && (session.st.body === 'kerbin' || session.st.body === 'duna')) {
      vInf = vInfEst(session.st);
    }
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

const priorFile = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const kept = (priorFile?.nodes ?? []).filter((n) => n.ok && n.nodeId !== 'rise' && n.nodeId !== 'home');
const failedRise = (priorFile?.nodes ?? []).find((n) => n.nodeId === 'rise' && !n.ok) ?? priorFile?.priorRise ?? null;
const homeXfer = hohmannTransfer('duna', 'kerbin');

const result = {
  startedAt: nowIso(),
  snapshot: 'land (re-fly rise+home from agent-fly-land.json; do not light jettisoned Raven)',
  craft: priorFile?.craft ?? 'Duna Hauler',
  stack: priorFile?.stack ?? null,
  radials: priorFile?.radials ?? null,
  transfer: priorFile?.transfer ?? null,
  lifter: priorFile?.lifter ?? null,
  alsoStock: priorFile?.alsoStock ?? null,
  raven: priorFile?.raven ?? null,
  padTwrSL: priorFile?.padTwrSL ?? null,
  padWetKg: priorFile?.padWetKg ?? null,
  vInfTarget: homeXfer.vInfDep,
  planOk: priorFile?.planOk ?? null,
  planText: priorFile?.planText ?? null,
  planPhases: priorFile?.planPhases ?? null,
  change: 'Duna rise: loft Ap 80 km, Pe clear 58 km, stay vertical to 18 km, cut above 42 km, circularize at Ap. Home waits Duna→Kerbin window; lander mid-course if no transfer.',
  llm: false,
  invented: false,
  nodes: [...kept],
  snapshots: { ...(priorFile?.snapshots ?? {}) },
  stopped: null,
  verdict: null,
  priorRise: failedRise,
  prior: priorFile?.prior ?? null,
};

console.log('== agent-fly-from-land', result.startedAt);
console.log('kept nodes', kept.map((n) => n.nodeId).join(','));
console.log('home vInfDep', homeXfer.vInfDep.toFixed(2));

callTool('ksp_lang', { lang: 'zh' });
callTool('ksp_new_flight', { craft: 'Duna Hauler' });
session.loadSnapshot(LAND_SNAP, { craft: 'Duna Hauler' });
const tlm0 = session.telemetry();
const check0 = readFlightCheck(session.st, { stageIdx: session.stageIdx ?? 0 });
const names0 = (session.st.parts ?? []).filter((p) => p.alive !== false).map((p) => p.def?.name);
console.log('loaded land', JSON.stringify({
  body: tlm0.body,
  situation: tlm0.situation,
  landed: tlm0.landed,
  fuel_kg: tlm0.fuel_kg,
  orbit: check0.orbitText,
  names: names0,
  transferFuelKg: transferFuelKg(session.st),
  ignited: ignitedNames(session.st),
  t: session.st.t,
}));

const planned = callTool('ksp_agent_plan', { text: '去火星再回来' });
console.log('plan', planned.missionId, planned.current?.id, planned.thought);

let agent = session.agent;
for (const id of ['ascent', 'window', 'escape', 'coast', 'capture', 'jettison', 'land']) {
  agent = completeNode(agent, id);
}
session.agent = createState({
  ...agent,
  snapshots: {
    ...(agent.snapshots ?? {}),
    land: serializeSnapshot(session.st, { tag: 'agent-land', craft: session.craftName }),
  },
});
console.log('current node', session.agent.nodeId);

const ORDER = ['rise', 'home'];
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
  const extra = { wallMs: wallMs(t0) };
  if (id === 'home' && session.st) {
    extra.vInfTarget = homeXfer.vInfDep;
    if (session.st.body === 'kerbol') {
      const enc = encounterInfo(session.st, 'kerbin');
      extra.ca_m = enc.ca_m;
      extra.encPe_m = enc.encPe_m;
      extra.enc = enc.enc;
    }
  }
  const rec = nodeRecord(id, out, extra);
  result.nodes.push(rec);
  result.snapshots[id] = dumpSnap(`agent-fly-${id}`);
  writeFileSync(OUT, JSON.stringify(result, null, 2));
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
    ca_m: rec.ca_m ?? null,
    encPe_m: rec.encPe_m ?? null,
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
  const rise = result.nodes.find((n) => n.nodeId === 'rise');
  const land = result.nodes.find((n) => n.nodeId === 'land');
  if (home?.ok && home.body === 'kerbin') {
    result.verdict = home.landed
      ? 'home: landed on kerbin (real touchdown).'
      : 'home: kerbin encounter/capture.';
  } else if (rise?.ok && rise.body === 'duna') {
    result.verdict = `Duna rise ok ${rise.orbitText}; stopped after ${last?.nodeId} (body ${last?.body}). Did not reach Kerbin.`;
  } else if (land?.ok && land.body === 'duna' && land.landed) {
    result.verdict = `lander-only touchdown on duna; stopped after ${last?.nodeId}.`;
  } else {
    result.verdict = `campaign reached ${last?.nodeId} (body ${last?.body}).`;
  }
}

const home = result.nodes.find((n) => n.nodeId === 'home');
const rise = result.nodes.find((n) => n.nodeId === 'rise');
const land = result.nodes.find((n) => n.nodeId === 'land');
result.howFar = {
  dunaBody: land?.body === 'duna' || rise?.body === 'duna',
  landerOnlyTouchdown: !!(land?.ok && land.landed && land.body === 'duna'),
  riseOrbit: rise?.ok ? rise.orbitText : null,
  kerbinReturn: !!(home?.ok && home.body === 'kerbin'),
  kerbinLanded: !!(home?.ok && home.body === 'kerbin' && home.landed),
  stopped: result.stopped?.nodeId ?? (home?.ok ? null : (rise?.ok ? 'home' : 'rise')),
};
result.finishedAt = nowIso();
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log('wrote', OUT);
console.log('verdict', result.verdict);
