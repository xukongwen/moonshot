// Isolated rise from the land snapshot. No LLM. Prints real check only.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callTool, session } from '../mcp/server.mjs';
import { readFlightCheck, fuelLeft, roleEngines } from '../src/agent-muscles.js';
import { runRiseMuscle } from '../src/agent-burns.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const LAND = join(ROOT, 'logs/snapshots/agent-fly-land.json');

callTool('ksp_lang', { lang: 'zh' });
callTool('ksp_new_flight', { craft: 'Duna Hauler' });
session.loadSnapshot(LAND, { craft: 'Duna Hauler' });
const before = readFlightCheck(session.st, { stageIdx: session.stageIdx ?? 0 });
const names = (session.st.parts ?? []).filter((p) => p.alive !== false).map((p) => p.def?.name);
console.log('before', JSON.stringify({
  body: before.body,
  landed: before.landed,
  fuelKg: before.fuelKg,
  orbitText: before.orbitText,
  names,
  lander: roleEngines(session.st).lander?.def?.name ?? null,
  transfer: roleEngines(session.st).transfer?.def?.name ?? null,
}));

const t0 = Date.now();
const out = runRiseMuscle(session.st, session, {});
const after = readFlightCheck(session.st, { stageIdx: session.stageIdx ?? 0 });
console.log('rise', JSON.stringify({
  ok: out.ok,
  reason: out.reason ?? null,
  body: after.body,
  landed: after.landed,
  dead: after.dead,
  orbitText: after.orbitText,
  peKm: after.peKm,
  apKm: after.apKm,
  fuelKg: after.fuelKg,
  fuelLeft: fuelLeft(session.st),
  wallMs: Date.now() - t0,
}, null, 2));
