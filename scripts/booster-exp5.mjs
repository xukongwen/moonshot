// R5: agent path — Mun Express ascent then 回收助推 node.
// Same boostback+suicide muscles as R4. No teleport. No invented telemetry.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SimSession } from '../mcp/session.mjs';
import { serializeSnapshot, writeSnapshot } from '../mcp/snapshot.mjs';
import { orbitCheck, fuelLeft } from '../src/agent-muscles.js';
import { padDistanceM, isTitanVessel } from '../src/agent-burns.js';
import { viewAgent } from '../mcp/agent.mjs';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
mkdirSync(join(ROOT, 'logs'), { recursive: true });
mkdirSync(join(ROOT, 'logs/snapshots'), { recursive: true });

function vesselBrief(v) {
  if (!v?.st) return null;
  const orb = orbitCheck(v.st);
  return {
    id: v.id,
    name: v.name,
    held: !!v.held,
    titan: isTitanVessel(v),
    body: v.st.body,
    landed: !!v.st.landed,
    dead: !!v.st.dead,
    fuel_kg: fuelLeft(v.st),
    pad_m: padDistanceM(v.st),
    orbitText: orb.text,
    peKm: orb.peKm,
    apKm: orb.apKm,
    bound: orb.ok,
    parts: (v.st.parts ?? []).filter((p) => p.alive !== false).map((p) => p.def?.name).filter(Boolean),
  };
}

const session = new SimSession();
session.setLang('zh');
session.newFlight('Mun Express');
const planned = session.agentPlan('登月回来');
console.log('plan', JSON.stringify({
  missionId: planned.missionId,
  nodes: planned.nodes?.map((n) => n.id),
  current: planned.current?.id,
  thought: planned.thought,
}));

console.log('=== step ascent ===');
const t0 = Date.now();
const ascent = session.agentStep();
console.log('ascent', JSON.stringify({
  ok: ascent.ok,
  nodeId: ascent.nodeId,
  nextId: ascent.nextId,
  thought: ascent.thought,
  ms: Date.now() - t0,
  vessels: session.vessels.map(vesselBrief),
  active: session.activeId,
}));

const afterAscent = {
  thought: ascent.thought,
  nextId: ascent.nextId,
  vessels: session.vessels.map(vesselBrief),
  heldTitans: session.vessels.filter((v) => v.held && isTitanVessel(v)).map((v) => v.id),
};

console.log('=== step recover ===');
const t1 = Date.now();
const recover = session.agentStep();
console.log('recover', JSON.stringify({
  ok: recover.ok,
  nodeId: recover.nodeId,
  nextId: recover.nextId,
  thought: recover.thought,
  pad_m: recover.pad_m,
  speed: recover.speed,
  water: recover.water,
  crashed: recover.crashed,
  landed: recover.landed,
  fuel_kg: recover.fuel_kg,
  reason: recover.reason,
  ms: Date.now() - t1,
  vessels: session.vessels.map(vesselBrief),
  active: session.activeId,
}));

const booster = session.vessels.find((v) => isTitanVessel(v));
const upper = session.vessels.find((v) => v.id !== booster?.id) ?? session.activeVessel();

if (booster) session.setActive(booster.id);
const boosterSnap = serializeSnapshot(session.st, { tag: 'booster-exp5-booster', craft: booster?.name || 'Titan' });
const boosterSnapPath = writeSnapshot(boosterSnap);

if (upper) session.setActive(upper.id);
const upperSnap = serializeSnapshot(session.st, { tag: 'booster-exp5-upper', craft: upper?.name || 'Mun Express' });
const upperSnapPath = writeSnapshot(upperSnap);

const agent = viewAgent(session.agent);
const result = {
  craft: 'Mun Express',
  missionId: 'mun-roundtrip',
  node: 'recover',
  nodeLabel: '回收助推',
  plan: {
    nodes: planned.nodes?.map((n) => ({ id: n.id, label: n.label })),
    thought: planned.thought,
  },
  ascent: {
    ok: ascent.ok,
    thought: ascent.thought,
    nextId: ascent.nextId,
    vessels: afterAscent.vessels,
    heldTitans: afterAscent.heldTitans,
  },
  recover: {
    ok: recover.ok,
    thought: recover.thought,
    nextId: recover.nextId,
    pad_m: recover.pad_m,
    speed: recover.speed,
    water: recover.water,
    crashed: recover.crashed,
    landed: recover.landed,
    fuel_kg: recover.fuel_kg,
    reason: recover.reason,
    boosterId: recover.boosterId,
    upperId: recover.upperId,
  },
  vessels: session.vessels.map(vesselBrief),
  bothLive: session.vessels.length >= 2
    && session.vessels.some((v) => isTitanVessel(v) && !v.st.dead)
    && session.vessels.some((v) => !isTitanVessel(v) && !v.st.dead),
  claimedPad: !!(recover.ok && recover.pad_m != null && recover.pad_m < 200),
  agent: {
    thought: agent.thought,
    thoughts: agent.thoughts,
    current: agent.current,
    nodes: agent.nodes,
  },
  snapshots: {
    booster: boosterSnapPath,
    upper: upperSnapPath,
  },
  design: {
    name: 'Mun Express',
    stack: session.lastDesign?.stack,
    radials: session.lastDesign?.radials,
  },
  boosterDesign: booster?.design ? {
    name: booster.name,
    stack: booster.design.stack,
    radials: booster.design.radials,
  } : null,
};

writeFileSync(join(ROOT, 'logs/booster-exp5.json'), JSON.stringify(result, null, 2));
console.log('\nwrote logs/booster-exp5.json');
console.log('booster snap', boosterSnapPath);
console.log('upper snap', upperSnapPath);
const padKm = recover.pad_m != null ? (recover.pad_m / 1000).toFixed(2) : null;
console.log(`RECOVER ok=${recover.ok} thought=${recover.thought}`);
console.log(`  pad=${padKm} km speed=${recover.speed} water=${recover.water} crashed=${recover.crashed} fuel=${recover.fuel_kg} claimedPad=${result.claimedPad}`);
console.log(`  bothLive=${result.bothLive} vessels=${session.vessels.length} active=${session.activeId}`);
console.log(`  upper ${vesselBrief(upper)?.orbitText} fuel=${vesselBrief(upper)?.fuel_kg}`);
