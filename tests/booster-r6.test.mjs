// R6: MCP can switch vessels and command booster recovery.
import { setLang } from '../src/i18n.js';
import { TOOLS, callTool, session } from '../mcp/server.mjs';
import { freshAgent } from '../mcp/agent.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

function reset() {
  session.revert();
  session.agent = freshAgent();
  session.setLang('zh');
  setLang('zh');
}

const hop = {
  name: 'Booster Hop',
  stack: [
    'pod-mk1', 'tank-s', 'eng-kestrel',
    'decoupler-l', 'adapter',
    'tank-xl', 'eng-titan',
  ],
  radials: [
    { part: 'legs-xl', sym: 1, host: 5 },
    { part: 'fins', sym: 1, host: 5 },
  ],
};

const names = TOOLS.map((t) => t.name);

console.log('1. tool names');
{
  check('ksp_set_active', names.includes('ksp_set_active'));
  check('ksp_recover', names.includes('ksp_recover'));
  check('ksp_vessels still there', names.includes('ksp_vessels'));
}

console.log('2. recover with no booster fails honestly');
{
  reset();
  callTool('ksp_new_flight', { craft: 'Mun Express' });
  const r = callTool('ksp_recover');
  check('not ok', r.ok === false);
  check('reason no-booster', r.reason === 'no-booster', String(r.reason));
  check('no invented pad', r.pad_m == null, String(r.pad_m));
  check('no invented speed', r.speed == null, String(r.speed));
}

console.log('3. set_active unknown id throws');
{
  reset();
  callTool('ksp_new_flight', { craft: 'Mun Express' });
  let threw = false;
  try { callTool('ksp_set_active', { id: 'no-such-ship' }); }
  catch (e) { threw = /Unknown vessel/.test(String(e.message)); }
  check('throws unknown', threw);
}

console.log('4. stage drop, list, switch, command booster');
{
  reset();
  session.newFlightFromDesign(hop);
  callTool('ksp_stage');
  callTool('ksp_throttle', { value: 1 });
  callTool('ksp_step', { seconds: 1 });
  const sep = callTool('ksp_stage');
  check('dropped id', typeof sep.droppedId === 'string', String(sep.droppedId));

  const listed = callTool('ksp_vessels');
  check('two vessels', listed.vessels.length === 2, String(listed.vessels.length));
  const booster = listed.vessels.find((v) => v.titan && !v.active);
  const upper = listed.vessels.find((v) => v.active);
  check('listed titan flag', !!booster, JSON.stringify(listed.vessels));
  check('upper not titan', upper && upper.titan === false, JSON.stringify(upper));
  check('active is upper', listed.activeId === upper.id, listed.activeId);

  const sw = callTool('ksp_set_active', { id: booster.id });
  check('switched', sw.activeId === booster.id, String(sw.activeId));
  const after = callTool('ksp_vessels');
  check('active flag flipped', after.vessels.find((v) => v.id === booster.id)?.active === true);
  check('st is titan', session.st.parts.some((p) => /Titan/.test(p.def.name)));

  const legs = callTool('ksp_legs', { down: true });
  check('legs on booster', session.st.parts.some((p) => p.def?.legs && p.legsDown), JSON.stringify(legs));
  callTool('ksp_throttle', { value: 0.3 });
  callTool('ksp_step', { seconds: 0.4 });
  check('booster still alive', !session.st.dead);
  check('time advanced', session.st.t > 1, String(session.st.t));
}

console.log('5. recover already-landed booster does not invent km');
{
  reset();
  session.newFlightFromDesign(hop);
  callTool('ksp_stage');
  callTool('ksp_throttle', { value: 1 });
  callTool('ksp_step', { seconds: 1 });
  const sep = callTool('ksp_stage');
  const booster = session.vesselById(sep.droppedId);
  booster.st.landed = true;
  booster.st.dead = false;
  const r = callTool('ksp_recover', { id: sep.droppedId });
  check('already', r.already === true && r.ok === true, JSON.stringify({ ok: r.ok, already: r.already, reason: r.reason }));
  check('boosterId', r.boosterId === sep.droppedId, String(r.boosterId));
  check('pad is a number or null, not a slogan', r.pad_m == null || Number.isFinite(r.pad_m), String(r.pad_m));
  check('focus back on upper if flying', session.activeId === 'active' || session.activeId === sep.droppedId, session.activeId);
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nbooster-r6 tests passed');
