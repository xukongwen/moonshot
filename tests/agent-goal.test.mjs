// A2: coarse goal → mission id + planMission budget. Pure; no document.
import { STOCK } from '../src/stock.js';
import { planMission, cloneDesign } from '../src/plan.js';
import { setLang } from '../src/i18n.js';
import { parseGoal, applyGoal } from '../src/agent-goal.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

setLang('zh');

console.log('1. parseGoal');
{
  const duna = parseGoal('去火星再回来');
  check('去火星再回来 → duna-roundtrip', duna?.missionId === 'duna-roundtrip', JSON.stringify(duna));

  const mun = parseGoal('登月回来');
  check('登月回来 → mun-roundtrip', mun?.missionId === 'mun-roundtrip', JSON.stringify(mun));

  check('你好 → null', parseGoal('你好') === null);

  check('duna and back', parseGoal('duna and back')?.missionId === 'duna-roundtrip');
  check('land on the mun', parseGoal('land on the mun')?.missionId === 'mun-roundtrip');
  check('empty → null', parseGoal('   ') === null);
  check('Duna capital', parseGoal('Go to Duna')?.missionId === 'duna-roundtrip');
  check('缪恩', parseGoal('去缪恩再回来')?.missionId === 'mun-roundtrip');
  check('月球', parseGoal('飞去月球')?.missionId === 'mun-roundtrip');
}

console.log('2. applyGoal Duna Hauler');
{
  const design = STOCK['Duna Hauler'];
  const before = JSON.stringify(design);
  const r = applyGoal('去火星再回来', design);
  const expected = planMission(cloneDesign(design), 'duna-roundtrip');

  check('missionId', r.missionId === 'duna-roundtrip');
  check('goal is raw text', r.goal === '去火星再回来');
  check('plan from plan.js', r.plan && r.plan.mission === 'duna-roundtrip' && r.plan.ok === expected.ok);
  check('plan phases match', r.plan.phases.length === expected.phases.length);
  check('nodes length ≥ 7', r.nodes.length >= 7, String(r.nodes.length));
  check('thought mentions 预算', typeof r.thought === 'string' && r.thought.includes('预算'), r.thought);
  check('does not mutate design', JSON.stringify(design) === before);
  check('duna nodes have escape not tli',
    r.nodes.some((n) => n.id === 'escape') && !r.nodes.some((n) => n.id === 'tli'));
  check('first node current', r.nodes[0].status === 'current' && r.nodes[0].id === 'ascent');
}

console.log('3. applyGoal Mun + unknown + stock fallback');
{
  const mun = applyGoal('登月回来', STOCK['Mun Express']);
  check('mun mission', mun.missionId === 'mun-roundtrip');
  check('mun nodes ≥ 7', mun.nodes.length >= 7, String(mun.nodes.length));
  check('mun has TLI', mun.nodes.some((n) => n.id === 'tli' || n.label === 'TLI'));
  check('mun thought 预算', mun.thought.includes('预算'), mun.thought);

  const unknown = applyGoal('你好', STOCK['Duna Hauler']);
  check('unknown missionId null', unknown.missionId === null && unknown.plan === null);
  check('unknown thought', unknown.thought.includes('听不懂'));
  check('unknown nodes empty', unknown.nodes.length === 0);

  const fallback = applyGoal('去火星再回来', null);
  check('empty design uses Duna Hauler stock', fallback.missionId === 'duna-roundtrip' && fallback.plan);
  check('fallback nodes ≥ 7', fallback.nodes.length >= 7);
}

console.log('4. thought cites real fail fields');
{
  const hopper = applyGoal('去火星再回来', STOCK['Suborbital Hopper']);
  const plan = planMission(cloneDesign(STOCK['Suborbital Hopper']), 'duna-roundtrip');
  check('hopper not ok', hopper.plan.ok === false && plan.ok === false);
  const f = plan.fail[0];
  check('thought has fail id', hopper.thought.includes(f.id), hopper.thought);
  const shown = String(Math.round(Math.abs(f.margin)));
  check('thought has abs(margin)', hopper.thought.includes(shown), `${hopper.thought} vs ${shown}`);
  check('thought says 预算不过', hopper.thought.includes('预算不过'));
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nagent-goal tests passed');
