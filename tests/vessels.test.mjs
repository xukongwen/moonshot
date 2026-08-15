// R1/R2: multi-vessel session, spawnOrbital, target, relative nav.
import { SimSession } from '../mcp/session.mjs';
import { TOOLS } from '../mcp/server.mjs';
import { BODIES } from '../src/constants.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

const session = new SimSession();
session.newFlight('Mun Express');
check('one vessel after newFlight', session.vessels.length === 1, String(session.vessels.length));
check('active id', session.activeId === 'active', session.activeId);
check('st alias has pos', session.st?.pos != null && session.st.pos.length() > BODIES.kerbin.radius);

const spawned = session.spawnOrbital('Mun Express', {
  body: 'kerbin',
  ap_m: 100_000,
  pe_m: 100_000,
  ta_deg: 40,
  name: 'Target',
});
check('two vessels', session.vessels.length === 2, String(session.vessels.length));
check('spawn returns id', typeof spawned.id === 'string' && spawned.id.length > 0, String(spawned.id));

const tgt = session.vesselById(spawned.id);
check('target has pos', tgt?.st?.pos != null && Number.isFinite(tgt.st.pos.length()), String(tgt?.st?.pos));
check('target altitude ~100 km', Math.abs(tgt.st.pos.length() - BODIES.kerbin.radius - 100_000) < 50,
  String(tgt.st.pos.length() - BODIES.kerbin.radius));
check('active still pad', session.activeId === 'active');

session.setTarget(spawned.id);
const tlm = session.telemetry();
check('target set', tlm.target === spawned.id, String(tlm.target));
check('range finite', Number.isFinite(tlm.range_m) && tlm.range_m > 0, String(tlm.range_m));
check('rel_speed finite', Number.isFinite(tlm.rel_speed_ms), String(tlm.rel_speed_ms));
check('closing finite', Number.isFinite(tlm.closing_ms), String(tlm.closing_ms));
check('dockState free', tlm.dockState === 'free', tlm.dockState);

const listed = session.listVessels();
check('list length 2', listed.length === 2);
check('list has body', listed.every((v) => v.body === 'kerbin'));
check('list has alt', listed.every((v) => Number.isFinite(v.alt_m)));

const names = TOOLS.map((t) => t.name);
for (const n of ['ksp_vessels', 'ksp_spawn_orbital', 'ksp_target', 'ksp_translate', 'ksp_dock', 'ksp_undock']) {
  check(`tool ${n}`, names.includes(n));
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nvessels tests passed');
