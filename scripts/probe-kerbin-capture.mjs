// Probe: lander-only capture from the home encounter snap. Real numbers only.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callTool, session } from '../mcp/server.mjs';
import { readFlightCheck, fuelLeft, vInfEst, roleEngines } from '../src/agent-muscles.js';
import { runCaptureMuscle } from '../src/agent-burns.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const HOME = join(ROOT, 'logs/snapshots/agent-fly-home.json');

callTool('ksp_lang', { lang: 'zh' });
callTool('ksp_new_flight', { craft: 'Duna Hauler' });
session.loadSnapshot(HOME, { craft: 'Duna Hauler' });
const before = readFlightCheck(session.st);
const roles = roleEngines(session.st);
let vinf = null;
try { vinf = vInfEst(session.st); } catch {}
console.log('before', JSON.stringify({
  body: before.body,
  orbitText: before.orbitText,
  fuelKg: before.fuelKg,
  mass: session.st.massProps?.m,
  lander: roles.lander?.def?.name ?? null,
  transfer: roles.transfer?.def?.name ?? null,
  ignited: (session.st.parts ?? []).filter((p) => p.ignited && p.def?.engine).map((p) => p.def.name),
  vInf: vinf,
  t: session.st.t,
}));

const t0 = Date.now();
const out = runCaptureMuscle(session.st, session, {
  dest: 'kerbin',
  allowLander: true,
  peFloor: 45_000,
  apAim: 2_000_000,
  fuelReserve: 160,
});
const after = readFlightCheck(session.st);
let vinf2 = null;
try { if (session.st.body === 'kerbin') vinf2 = vInfEst(session.st); } catch {}
console.log('capture', JSON.stringify({
  ok: out.ok,
  reason: out.reason ?? null,
  body: after.body,
  orbitText: after.orbitText,
  peKm: after.peKm,
  apKm: after.apKm,
  fuelKg: after.fuelKg,
  landed: after.landed,
  dead: after.dead,
  vInf: vinf2,
  ignited: (session.st.parts ?? []).filter((p) => p.ignited && p.def?.engine).map((p) => p.def.name),
  wallMs: Date.now() - t0,
}, null, 2));
