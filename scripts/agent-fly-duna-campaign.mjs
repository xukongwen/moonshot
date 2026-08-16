// Pad → Duna agent nodes. Uses current STOCK Duna Hauler. No LLM. Stop on first fail.
// Never lights Sparrow for TDI / mid-course / capture (muscles refuse).

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callTool, session } from '../mcp/server.mjs';
import { STOCK } from '../src/stock.js';
import { planMission, formatPlan, cloneDesign } from '../src/plan.js';
import { stagingStats } from '../src/vessel.js';
import { BODIES, getBodyState } from '../src/constants.js';
import { elementsFromState, findEncounter, hohmannTransfer, propagate } from '../src/orbits.js';
import { readFlightCheck, roleEngines, transferFuelKg, vInfEst } from '../src/agent-muscles.js';
import { serializeSnapshot, writeSnapshot } from '../mcp/snapshot.mjs';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const LOG_DIR = join(ROOT, 'logs');
const SNAP_DIR = join(ROOT, 'logs/snapshots');
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

function countId(stack, id) {
  return stack.filter((x) => x === id).length;
}

function describeHauler(design) {
  const nL = countId(design.stack, 'tank-l');
  const nM = countId(design.stack, 'tank-m');
  const nXl = countId(design.stack, 'tank-xl');
  const srb = (design.radials ?? []).find((r) => r.part === 'srb');
  const nSrb = srb ? (srb.sym || 1) : 0;
  // lander is tank-l + tank-m; the rest of tank-l/m sit on Raven
  const xferL = Math.max(0, nL - 1);
  const xferM = Math.max(0, nM - 1);
  const transfer = `${xferL}× tank-l + ${xferM ? `${xferM}× ` : ''}tank-m Raven`;
  const lifter = `${nXl}× tank-xl Titan + ${nSrb} SRB`;
  return { transfer, lifter, xferL, nXl, nSrb };
}

const prior = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const xfer = hohmannTransfer('kerbin', 'duna');
const design = cloneDesign(STOCK['Duna Hauler']);
design.name = 'Duna Hauler';
const paper = planMission(design, 'duna-roundtrip');
const stats = stagingStats(design);
const padTwr = stats[0]?.twrSL ?? null;
const padWet = stats[0]?.wet ?? null;
const desc = describeHauler(design);

const result = {
  startedAt: nowIso(),
  snapshot: 'pad (do not reuse old window snap; fly this stock from the pad)',
  craft: 'Duna Hauler',
  stack: [...design.stack],
  radials: design.radials.map((r) => ({ ...r })),
  transfer: desc.transfer,
  lifter: desc.lifter,
  alsoStock: 'Duna Hauler Light = same 4-tank + Raven stack',
  raven: {
    id: 'eng-raven',
    name: 'R-40 "Raven"',
    size: 1.25,
    mass: 900,
    length: 1.3,
    thrustVac: 120000,
    ispVac: 360,
    ispSL: 90,
    gimbal: 3,
    throttleable: true,
    dragArea: 0.35,
    maxTemp: 2000,
    shape: 'engine',
  },
  padTwrSL: padTwr,
  padWetKg: padWet,
  vInfTarget: xfer.vInfDep,
  planOk: paper.ok,
  planText: formatPlan(paper),
  planPhases: paper.phases.map((p) => ({
    id: p.id, role: p.role, need: p.need, have: p.have, margin: p.margin, paid: p.paid ?? null,
  })),
  change: process.env.DUNA_CAMPAIGN_CHANGE
    || `Raven transfer (4×L+M), ${desc.lifter}; 83 km gravity turn; transfer-only; from pad`,
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

console.log('== agent-fly-duna-campaign', result.startedAt);
console.log('Hohmann vInfDep', xfer.vInfDep.toFixed(2));
console.log('pad twrSL', padTwr?.toFixed(3), 'wet', padWet?.toFixed(0));
console.log(result.planText);

callTool('ksp_lang', { lang: 'zh' });
const flight = callTool('ksp_new_flight', { craft: 'Duna Hauler' });
console.log('pad', JSON.stringify({
  craft: flight.craft,
  situation: flight.situation,
  landed: flight.landed,
  body: flight.body,
  fuel_kg: flight.fuel_kg,
  alt_m: flight.alt_m,
  transferFuelKg: transferFuelKg(session.st),
  nParts: session.st?.parts?.length,
}));

const planned = callTool('ksp_agent_plan', { text: '去火星再回来' });
console.log('plan', planned.missionId, planned.current?.id, planned.thought, 'planOk', planned.plan?.ok);
result.snapshots.pad = dumpSnap('agent-fly-pad');

const origStep = session.step.bind(session);
let lastLogT = -999;
const wall0 = Date.now();
session.step = (seconds, dt) => {
  const out = origStep(seconds, dt);
  const st = session.st;
  if (st && st.t - lastLogT >= 25 && st.landed === false && st.body === 'kerbin' && st.t < 900) {
    lastLogT = st.t;
    const c = readFlightCheck(st, { stageIdx: session.stageIdx });
    console.log(
      `  ascent MET ${st.t.toFixed(1)}s  ${c.orbitText}  alt=${c.altKm != null ? c.altKm.toFixed(1) : '—'} km`
      + `  fuel=${c.fuelKg != null ? c.fuelKg.toFixed(0) : '—'} kg  xfer=${transferFuelKg(st).toFixed(0)}`
      + `  stage=${session.stageIdx} wall=${((Date.now() - wall0) / 1000).toFixed(0)}s`,
    );
  }
  return out;
};

const ORDER = ['ascent', 'window', 'escape', 'coast', 'capture', 'jettison', 'land', 'rise', 'home'];
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
  if (id === 'escape' || id === 'coast' || id === 'capture') {
    extra.vInfTarget = xfer.vInfDep;
    if (session.st?.body === 'kerbol' || id === 'coast') {
      const enc = encounterInfo(session.st, 'duna');
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
    ca_m: rec.ca_m ?? null,
    encPe_m: rec.encPe_m ?? null,
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

session.step = origStep;

if (!result.verdict) {
  const last = result.nodes[result.nodes.length - 1];
  const home = result.nodes.find((n) => n.nodeId === 'home');
  const land = result.nodes.find((n) => n.nodeId === 'land');
  const coast = result.nodes.find((n) => n.nodeId === 'coast');
  if (home?.ok && home.body === 'kerbin') {
    result.verdict = home.landed
      ? 'home: landed on kerbin (real touchdown).'
      : 'home: kerbin encounter/capture.';
  } else if (land?.ok && land.body === 'duna' && land.landed) {
    result.verdict = `lander-only touchdown on duna; stopped after ${last?.nodeId}.`;
  } else if (coast?.ok && coast.body === 'duna') {
    result.verdict = `campaign reached ${last?.nodeId} (body ${last?.body}).`;
  } else {
    result.verdict = `campaign reached ${last?.nodeId} (body ${last?.body}).`;
  }
}

result.finishedAt = nowIso();
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log('wrote', OUT);
console.log('verdict', result.verdict);
