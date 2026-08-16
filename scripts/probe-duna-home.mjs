// Debug Duna→Kerbin ejection from the new rise snap. Real numbers only.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callTool, session } from '../mcp/server.mjs';
import { readFlightCheck, fuelLeft, vInfEst, orbitCheck } from '../src/agent-muscles.js';
import { runHomeMuscle } from '../src/agent-burns.js';
import { hohmannTransfer, planetPhaseDeg } from '../src/orbits.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const RISE = join(ROOT, 'logs/snapshots/agent-fly-rise.json');

callTool('ksp_lang', { lang: 'zh' });
callTool('ksp_new_flight', { craft: 'Duna Hauler' });
session.loadSnapshot(RISE, { craft: 'Duna Hauler' });
const before = readFlightCheck(session.st);
const xfer = hohmannTransfer('duna', 'kerbin');
const phase = planetPhaseDeg('duna', 'kerbin', session.st.t);
console.log('before', JSON.stringify({
  body: before.body,
  orbitText: before.orbitText,
  fuelKg: before.fuelKg,
  t: session.st.t,
  phaseDeg: phase,
  targetPhase: xfer.phaseDeg,
  vInfDep: xfer.vInfDep,
  tT_d: xfer.tT / 86400,
}));

const t0 = Date.now();
const out = runHomeMuscle(session.st, session, { missionId: 'duna-roundtrip', nodeId: 'home' });
const after = readFlightCheck(session.st);
let vinf = null;
try { if (session.st.body === 'duna' || session.st.body === 'kerbin') vinf = vInfEst(session.st); } catch {}
console.log('home', JSON.stringify({
  ok: out.ok,
  reason: out.reason ?? null,
  body: after.body,
  orbitText: after.orbitText,
  peKm: after.peKm,
  apKm: after.apKm,
  fuelKg: after.fuelKg,
  landed: after.landed,
  dead: after.dead,
  vInf: vinf,
  captured: out.captured ?? null,
  encounter: out.encounter ?? null,
  wallMs: Date.now() - t0,
}, null, 2));
