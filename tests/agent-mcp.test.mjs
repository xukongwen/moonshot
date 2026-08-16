// A6: MCP agent tools. Cheap handlers; no 10-minute pad ascent.
import { setLang } from '../src/i18n.js';
import { createState } from '../src/agent-plan.js';
import { identifyRoles } from '../src/agent-check.js';
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

const names = TOOLS.map((t) => t.name);

console.log('1. tool names');
{
  for (const n of [
    'ksp_agent_get', 'ksp_agent_toggle', 'ksp_agent_plan',
    'ksp_agent_step', 'ksp_agent_revert', 'ksp_agent_check',
  ]) {
    check(n, names.includes(n));
  }
  check('not a second session prefix', names.includes('ksp_agent_get') && !names.includes('agent_get'));
}

console.log('2. plan 去火星再回来 → get');
{
  reset();
  const planned = callTool('ksp_agent_plan', { text: '去火星再回来' });
  check('plan missionId', planned.missionId === 'duna-roundtrip', String(planned.missionId));
  check('plan 9 nodes', planned.nodes?.length === 9, String(planned.nodes?.length));
  check('plan budget thought', typeof planned.thought === 'string' && planned.thought.includes('预算'), planned.thought);
  check('plan visible', planned.visible === true);

  const g = callTool('ksp_agent_get');
  check('get missionId', g.missionId === 'duna-roundtrip', String(g.missionId));
  check('get 9 nodes', g.nodes?.length === 9, String(g.nodes?.length));
  check('get current ascent', g.current?.id === 'ascent', JSON.stringify(g.current));
  check('get budget thought', g.thought.includes('预算'), g.thought);
  check('get thoughts has budget', g.thoughts.some((t) => t.includes('预算')));
  check('get plan.ok present', g.plan && typeof g.plan.ok === 'boolean', JSON.stringify(g.plan));
  check('get no fuel_kg', !('fuel_kg' in g) && g.fuel_kg == null, JSON.stringify(Object.keys(g)));
  check('get no alt_m', !('alt_m' in g) && !('ap_m' in g) && !('pe_m' in g));
  check('get no invented Δv field', !('dv' in g) && !('deltaV' in g) && !('delta_v' in g));
  if (g.plan?.ok) {
    check('ok plan has no fail', g.plan.fail == null);
  } else {
    check('fail summary is plan.fail[0]', g.plan.fail && g.plan.fail.id, JSON.stringify(g.plan));
  }
}

console.log('3. plan 你好 → 听不懂, no fake mission');
{
  reset();
  const r = callTool('ksp_agent_plan', { text: '你好' });
  check('thought 听不懂', r.thought.includes('听不懂'), r.thought);
  check('missionId null', r.missionId == null, String(r.missionId));
  check('no nodes', Array.isArray(r.nodes) && r.nodes.length === 0, String(r.nodes?.length));
  check('plan null', r.plan == null, JSON.stringify(r.plan));
  const g = callTool('ksp_agent_get');
  check('get still no mission', g.missionId == null && g.nodes.length === 0);
  check('get no fake duna', g.missionId !== 'duna-roundtrip' && g.missionId !== 'mun-roundtrip');
}

console.log('4. step with no plan refuses');
{
  reset();
  const r = callTool('ksp_agent_step');
  check('step not ok', r.ok === false);
  check('reason no-plan', r.reason === 'no-plan', String(r.reason));
  check('thought 没有计划', r.thought.includes('没有计划'), r.thought);
  check('node stays empty', !r.current && r.nodes.length === 0);
}

console.log('5. revert with no snapshot refuses');
{
  reset();
  callTool('ksp_agent_plan', { text: '去火星再回来' });
  const r = callTool('ksp_agent_revert');
  check('revert not ok', r.ok === false);
  check('reason no-snapshot', r.reason === 'no-snapshot', String(r.reason));
  check('thought 没有快照', r.thought.includes('没有快照'), r.thought);
  check('still on ascent', r.current?.id === 'ascent', JSON.stringify(r.current));
}

console.log('6. check dry-transfer fixture → Raven / 转移级');
{
  reset();
  callTool('ksp_new_flight', { craft: 'Duna Hauler' });
  callTool('ksp_agent_plan', { text: '去火星再回来' });
  const roles = identifyRoles(session.activeVessel().design);
  check('hauler has Raven transfer', roles.transfer?.nickname === 'Raven', JSON.stringify(roles.transfer));
  for (const p of session.st.parts) {
    if (p.fuel == null) continue;
    if (roles.transfer.sections.some((s) => p.stackIndex >= s.start && p.stackIndex <= s.end)) {
      p.fuel = 0;
    }
  }
  const done = new Set(['ascent', 'window', 'escape', 'coast']);
  session.agent = createState({
    ...session.agent,
    nodeId: 'capture',
    nodes: session.agent.nodes.map((n) => ({
      ...n,
      status: n.id === 'capture' ? 'current' : (done.has(n.id) ? 'done' : 'pending'),
    })),
  });
  const r = callTool('ksp_agent_check');
  const text = (r.thoughts ?? []).join('\n');
  console.log('   check thoughts:', JSON.stringify(r.thoughts));
  check('warns Raven or 转移级', /Raven|转移级/.test(text), text);
  check('mentions 着陆器', text.includes('着陆器'), text);
  check('cites 0 kg', text.includes('0 kg'), text);
  check('flag transferDry', r.flags?.transferDry === true, JSON.stringify(r.flags));
}

console.log('7. toggle flag + get still invents nothing');
{
  reset();
  const open = callTool('ksp_agent_get');
  check('starts visible', open.visible === true);
  const closed = callTool('ksp_agent_toggle', { open: false });
  check('closed', closed.visible === false);
  const toggled = callTool('ksp_agent_toggle');
  check('toggled open', toggled.visible === true);
  const g = callTool('ksp_agent_get');
  check('toggle get no fuel', !('fuel_kg' in g) && !('dv' in g));
}

console.log('8. already-in-orbit ascent is a real muscle, not a fake number');
{
  reset();
  session.spawnOrbital('Duna Hauler', { ap_m: 80_000, pe_m: 80_000, ta_deg: 0 });
  callTool('ksp_agent_plan', { text: '去火星再回来' });
  const r = callTool('ksp_agent_step');
  check('ascent ok via LKO', r.ok === true, JSON.stringify({ ok: r.ok, thought: r.thought, reason: r.reason }));
  check('ascent done', r.nodes.find((n) => n.id === 'ascent')?.status === 'done');
  check('now window', r.current?.id === 'window' || r.nextId === 'window', JSON.stringify(r.current));
  check('thought has orbit from check', /轨道|Orbit/.test(r.thought) && r.thought.includes('km'), r.thought);
  check('snapshot recorded', r.snapshots.includes('ascent'), JSON.stringify(r.snapshots));
  check('pad ascent not claimed here', session.st.landed === false);
}

console.log('9. pad ascent is not faked in cheap tests (refuse/stub honesty)');
{
  reset();
  callTool('ksp_new_flight', { craft: 'Duna Hauler' });
  callTool('ksp_agent_plan', { text: '去火星再回来' });
  check('on pad', session.st.landed === true);
  check('current is ascent', session.agent.nodeId === 'ascent');
  // Cheap test does not fly pad→LKO (minutes of physics). Window from the pad
  // must refuse honestly — do not invent an orbit.
  session.agent = createState({
    ...session.agent,
    nodeId: 'window',
    nodes: session.agent.nodes.map((n) => ({
      ...n,
      status: n.id === 'window' ? 'current' : (n.id === 'ascent' ? 'done' : 'pending'),
    })),
  });
  const r = callTool('ksp_agent_step');
  check('window on pad not ok', r.ok === false, JSON.stringify({ ok: r.ok, thought: r.thought }));
  check('window stays current', r.current?.id === 'window', JSON.stringify(r.current));
  check('no window snapshot', !r.snapshots.includes('window'), JSON.stringify(r.snapshots));
  check('thought cites pe or 入轨', /近拱点|入轨|Pe/.test(r.thought), r.thought);
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nagent-mcp tests passed');
