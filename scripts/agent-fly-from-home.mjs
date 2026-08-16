// Re-fly home from the Kerbin encounter snapshot: capture + chute land.
// One agent node. Appends logs/agent-fly-duna-result.json. Never lights Raven.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callTool, session } from '../mcp/server.mjs';
import { completeNode, createState } from '../src/agent-plan.js';
import { readFlightCheck, roleEngines, transferFuelKg, vInfEst, fuelLeft } from '../src/agent-muscles.js';
import { runCaptureMuscle } from '../src/agent-burns.js';
import { serializeSnapshot, writeSnapshot } from '../mcp/snapshot.mjs';
import { heightAt } from '../src/terrain.js';
import { BODIES } from '../src/constants.js';
import { hohmannTransfer } from '../src/orbits.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const LOG_DIR = join(ROOT, 'logs');
const SNAP_DIR = join(ROOT, 'logs/snapshots');
const HOME_SNAP = join(SNAP_DIR, 'agent-fly-home.json');
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

function aglNow(st) {
  if (!st?.pos) return null;
  const body = BODIES[st.body];
  if (!body) return null;
  const u = st.pos.clone().normalize();
  const alt = st.pos.length() - body.radius;
  const terrainH = alt < 95_000 ? heightAt(st.body, u) : 0;
  return alt - terrainH - (st.massProps?.comY ?? 0);
}

function chuteState(st) {
  const p = (st?.parts ?? []).find((x) => x.def?.chute);
  return p ? { name: p.def.name, state: p.chuteState, alive: p.alive !== false } : null;
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
const kept = (priorFile?.nodes ?? []).filter((n) => n.ok && n.nodeId !== 'home');
const priorHome = (priorFile?.nodes ?? []).find((n) => n.nodeId === 'home') ?? priorFile?.priorHome ?? null;
const homeXfer = hohmannTransfer('duna', 'kerbin');

const result = {
  startedAt: nowIso(),
  snapshot: 'home (Kerbin encounter → capture + chute land; do not light jettisoned Raven)',
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
  change: 'Home from Kerbin encounter: lander capture at Pe, drop Pe into atmo, chute+pod land. No Raven.',
  llm: false,
  invented: false,
  nodes: [...kept],
  snapshots: { ...(priorFile?.snapshots ?? {}) },
  stopped: null,
  verdict: null,
  priorHome,
  priorRise: priorFile?.priorRise ?? null,
  prior: priorFile?.prior ?? null,
};

console.log('== agent-fly-from-home', result.startedAt);
console.log('kept nodes', kept.map((n) => n.nodeId).join(','));

callTool('ksp_lang', { lang: 'zh' });
callTool('ksp_new_flight', { craft: 'Duna Hauler' });
session.loadSnapshot(HOME_SNAP, { craft: 'Duna Hauler' });
const tlm0 = session.telemetry();
const check0 = readFlightCheck(session.st, { stageIdx: session.stageIdx ?? 0 });
const names0 = (session.st.parts ?? []).filter((p) => p.alive !== false).map((p) => p.def?.name);
console.log('loaded home', JSON.stringify({
  body: tlm0.body,
  situation: tlm0.situation,
  landed: tlm0.landed,
  fuel_kg: tlm0.fuel_kg,
  mass_t: tlm0.mass_t,
  orbit: check0.orbitText,
  names: names0,
  transferFuelKg: transferFuelKg(session.st),
  ignited: ignitedNames(session.st),
  t: session.st.t,
  alt_m: tlm0.alt_m,
}));

// Capture-only pass for a real mid-home snap (same physics as the home muscle).
const tCap = Date.now();
const capOut = runCaptureMuscle(session.st, session, {
  dest: 'kerbin',
  allowLander: true,
  peFloor: 45_000,
  apAim: 2_000_000,
  fuelReserve: 160,
  nodeId: 'home',
  missionId: 'duna-roundtrip',
});
const capCheck = readFlightCheck(session.st);
result.capture = {
  ok: !!capOut.ok,
  reason: capOut.reason ?? null,
  orbitText: capCheck.orbitText,
  peKm: capCheck.peKm,
  apKm: capCheck.apKm,
  fuelKg: capCheck.fuelKg,
  body: capCheck.body,
  landed: capCheck.landed,
  dead: capCheck.dead,
  ignited: ignitedNames(session.st),
  wallMs: wallMs(tCap),
};
result.snapshots.kerbinCapture = dumpSnap('agent-fly-kerbin-capture');
console.log('capture', JSON.stringify(result.capture, null, 2));
writeFileSync(OUT, JSON.stringify(result, null, 2));

// Full home node from the encounter snap.
session.loadSnapshot(HOME_SNAP, { craft: 'Duna Hauler' });
const planned = callTool('ksp_agent_plan', { text: '去火星再回来' });
console.log('plan', planned.missionId, planned.current?.id, planned.thought);

let agent = session.agent;
for (const id of ['ascent', 'window', 'escape', 'coast', 'capture', 'jettison', 'land', 'rise']) {
  agent = completeNode(agent, id);
}
session.agent = createState({
  ...agent,
  snapshots: {
    ...(agent.snapshots ?? {}),
    home: serializeSnapshot(session.st, { tag: 'agent-home', craft: session.craftName }),
  },
});
console.log('current node', session.agent.nodeId);

console.log('== ksp_agent_step home');
const t0 = Date.now();
let out;
try {
  out = callTool('ksp_agent_step');
} catch (err) {
  console.error('home THREW', err);
  out = { ok: false, thought: String(err?.stack || err), reason: 'threw' };
}

const tlm = session.st ? session.telemetry() : null;
const chute = session.st ? chuteState(session.st) : null;
const extra = {
  wallMs: wallMs(t0),
  vInfTarget: homeXfer.vInfDep,
  captureOrbit: result.capture?.orbitText ?? null,
  captureFuelKg: result.capture?.fuelKg ?? null,
  agl_m: session.st ? aglNow(session.st) : null,
  speed_ms: tlm?.speed_ms ?? null,
  mass_t: tlm?.mass_t ?? null,
  chute,
  landerOnly: !!(session.st && !roleEngines(session.st).transfer),
  touchdownSpeed: out?.touchdownSpeed ?? null,
};
// ksp_agent_step view may not pass muscle extras; read from live state.
if (session.st?.landed) {
  extra.touchdownSpeed = extra.touchdownSpeed ?? tlm?.speed_ms ?? 0;
}
const rec = nodeRecord('home', out, extra);
result.nodes.push(rec);
if (session.st?.landed && session.st.body === 'kerbin' && !session.st.dead) {
  result.snapshots.kerbinLand = dumpSnap('agent-fly-kerbin-land');
} else {
  result.snapshots.homeAfter = dumpSnap('agent-fly-home-after');
}
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log('home', JSON.stringify({
  ok: rec.ok,
  thought: rec.thought,
  body: rec.body,
  orbitText: rec.orbitText,
  fuelKg: rec.fuelKg,
  ignited: rec.ignited,
  vInf: rec.vInf,
  landed: rec.landed,
  dead: rec.dead,
  nextId: rec.nextId,
  wallMs: rec.wallMs,
  agl_m: rec.agl_m,
  speed_ms: rec.speed_ms,
  chute: rec.chute,
  captureOrbit: rec.captureOrbit,
  captureFuelKg: rec.captureFuelKg,
}, null, 2));

if (!out?.ok && !rec.landed) {
  result.stopped = { nodeId: 'home', reason: rec.thought };
}

const home = result.nodes.find((n) => n.nodeId === 'home');
const rise = result.nodes.find((n) => n.nodeId === 'rise');
const land = result.nodes.find((n) => n.nodeId === 'land');
const captured = !!(result.capture?.ok && Number.isFinite(result.capture?.apKm));
const kerbinLanded = !!(home?.ok && home.body === 'kerbin' && home.landed && !home.dead
  && home.agl_m != null && Math.abs(home.agl_m) < 5);

if (kerbinLanded) {
  const td = Number.isFinite(home.touchdownSpeed) ? home.touchdownSpeed : home.speed_ms;
  result.verdict = `home: landed on kerbin AGL ${Math.abs(home.agl_m) < 0.05 ? 0 : home.agl_m.toFixed(2)} m, touchdown ${Number(td).toFixed(2)} m/s, fuel ${Math.round(home.fuelKg)} kg, capture ${result.capture?.orbitText}, lander-only.`;
} else if (captured && home?.body === 'kerbin' && !home.landed) {
  result.verdict = `home: captured ${result.capture?.orbitText}, ${Math.round(result.capture?.fuelKg ?? 0)} kg. Not landed.`;
} else if (home?.body === 'kerbin') {
  result.verdict = `home: Kerbin encounter, not captured. ${home.orbitText}, ${Math.round(home.fuelKg ?? 0)} kg.`;
} else {
  result.verdict = `failed on home: ${home?.thought || rec.thought}`;
}

result.howFar = {
  dunaBody: land?.body === 'duna' || rise?.body === 'duna',
  landerOnlyTouchdown: !!(land?.ok && land.landed && land.body === 'duna'),
  riseOrbit: rise?.ok ? rise.orbitText : null,
  kerbinReturn: !!(home?.ok && home.body === 'kerbin') || captured,
  kerbinCaptured: captured,
  kerbinLanded,
  captureOrbit: result.capture?.orbitText ?? null,
  stopped: result.stopped?.nodeId ?? (kerbinLanded ? null : 'home'),
};
result.finishedAt = nowIso();
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log('wrote', OUT);
console.log('verdict', result.verdict);
console.log('howFar', JSON.stringify(result.howFar));
