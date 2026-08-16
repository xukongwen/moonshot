// Agent panel state: pure helpers, no document.
import {
  createState, setState, pushThought, setNode, toggle, demoPlan,
  DEMO_GOAL_ZH, DEMO_THOUGHT_ZH, DEMO_NODES_ZH,
} from '../src/agent-plan.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

console.log('1. createState / setState');
{
  const s = createState();
  check('default open', s.open === true);
  check('empty goal', s.goal === '');
  check('empty nodes', Array.isArray(s.nodes) && s.nodes.length === 0);
  check('thoughts array', Array.isArray(s.thoughts) && s.thoughts.length === 0);
  check('nodeId null', s.nodeId === null);

  const t = setState(s, { goal: '去火星再回来', open: false });
  check('set goal', t.goal === '去火星再回来');
  check('set open false', t.open === false);
  check('input not mutated', s.goal === '' && s.open === true);
}

console.log('2. pushThought');
{
  let s = createState();
  s = pushThought(s, '第一句');
  check('thought is last', s.thought === '第一句');
  check('log has one', s.thoughts.length === 1 && s.thoughts[0] === '第一句');
  s = pushThought(s, '第二句');
  check('newest last', s.thoughts[1] === '第二句' && s.thought === '第二句');
  for (let i = 0; i < 20; i++) s = pushThought(s, `n${i}`);
  check('cap 12', s.thoughts.length === 12, String(s.thoughts.length));
  check('newest kept', s.thought === 'n19' && s.thoughts[11] === 'n19');
  const before = s.thoughts.length;
  s = pushThought(s, '   ');
  check('blank ignored', s.thoughts.length === before && s.thought === 'n19');
}

console.log('3. setNode');
{
  let s = createState({
    nodes: [
      { id: 'ascent', label: '入轨', status: 'current' },
      { id: 'window', label: '等窗口', status: 'pending' },
    ],
    nodeId: 'ascent',
  });
  s = setNode(s, 'window');
  check('nodeId updated', s.nodeId === 'window');
  check('new current', s.nodes.find((n) => n.id === 'window').status === 'current');
  check('old demoted', s.nodes.find((n) => n.id === 'ascent').status === 'pending');
  s = setNode(s, 'ascent', 'done');
  check('mark done', s.nodes.find((n) => n.id === 'ascent').status === 'done');
  check('window still current', s.nodes.find((n) => n.id === 'window').status === 'current');
  s = setNode(s, 'window', 'failed');
  check('mark failed', s.nodes.find((n) => n.id === 'window').status === 'failed');
}

console.log('4. toggle');
{
  let s = createState({ open: true });
  s = toggle(s);
  check('flip closed', s.open === false);
  s = toggle(s, true);
  check('force open', s.open === true);
  s = toggle(s, false);
  check('force closed', s.open === false);
}

console.log('5. demo duna-roundtrip');
{
  const s = demoPlan('zh');
  check('goal zh', s.goal === DEMO_GOAL_ZH);
  check('nine nodes', s.nodes.length === 9, String(s.nodes.length));
  check('labels', DEMO_NODES_ZH.every((n, i) => s.nodes[i].id === n.id && s.nodes[i].label === n.label));
  check('ascent current', s.nodes[0].status === 'current' && s.nodeId === 'ascent');
  check('rest pending', s.nodes.slice(1).every((n) => n.status === 'pending'));
  check('thought', s.thought === DEMO_THOUGHT_ZH);
  check('thoughts log', s.thoughts[s.thoughts.length - 1] === DEMO_THOUGHT_ZH);
  check('open', s.open === true);

  const en = demoPlan('en');
  check('en goal', en.goal === 'Go to Duna and back');
  check('en first label', en.nodes[0].label === 'Insertion');
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nagent-ui tests passed');
