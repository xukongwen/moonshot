// R5: recover node exists; step can run booster recovery without inventing distance.
import { STOCK } from '../src/stock.js';
import { setLang } from '../src/i18n.js';
import { applyGoal } from '../src/agent-goal.js';
import { nodesForMission, createState, completeNode } from '../src/agent-plan.js';
import { muscleKind, runStep, thoughtFromCheck, currentNode } from '../src/agent-step.js';
import {
  findBoosterVessel, isTitanVessel, markHeldTitans, runRecoverMuscle,
} from '../src/agent-burns.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

setLang('zh');

console.log('1. mun-roundtrip has 回收助推 after 入轨');
{
  const nodes = nodesForMission('mun-roundtrip', 'zh');
  const ids = nodes.map((n) => n.id);
  check('has recover', ids.includes('recover'));
  check('label 回收助推', nodes.find((n) => n.id === 'recover')?.label === '回收助推');
  check('after ascent', ids.indexOf('recover') === ids.indexOf('ascent') + 1, ids.join(','));
  check('before window', ids.indexOf('recover') === ids.indexOf('window') - 1);
  check('muscle real', muscleKind('recover') === 'real');
  const duna = nodesForMission('duna-roundtrip', 'zh');
  check('duna has no recover (mun is enough)', !duna.some((n) => n.id === 'recover'));
}

console.log('2. applyGoal 登月回来 includes recover');
{
  const r = applyGoal('登月回来', STOCK['Mun Express']);
  check('mission mun', r.missionId === 'mun-roundtrip');
  check('nodes have recover', r.nodes.some((n) => n.id === 'recover' && n.label === '回收助推'));
  let s = createState({ nodes: r.nodes, nodeId: 'ascent', missionId: r.missionId, goal: r.goal });
  s = completeNode(s, 'ascent');
  check('next is recover', currentNode(s).id === 'recover');
}

console.log('3. thoughtFromCheck does not invent pad distance');
{
  const ok = thoughtFromCheck('recover-ok', {}, { pad_m: 2170, speed: 9.31, fuel_kg: 0 }, 'zh');
  check('uses 2.17', ok.includes('2.17'), ok);
  check('uses 9.31', ok.includes('9.31'), ok);
  check('not 上垫', !ok.includes('上垫'), ok);
  const bare = thoughtFromCheck('recover-ok', {}, {}, 'zh');
  check('empty extra no km', !/\d+(\.\d+)?\s*km/.test(bare), bare);
  const fail = thoughtFromCheck('recover-fail', {}, { reason: 'no-booster' }, 'zh');
  check('no-booster no km', !/\d+(\.\d+)?\s*km/.test(fail) && fail.includes('没有扔下的助推'), fail);
}

console.log('4. runStep recover with mocked muscle advances, uses given thought');
{
  const nodes = nodesForMission('mun-roundtrip', 'zh');
  let s = createState({ nodes, nodeId: 'ascent', missionId: 'mun-roundtrip' });
  s = completeNode(s, 'ascent');
  const thought = thoughtFromCheck('recover-ok', {}, { pad_m: 2170, speed: 9.31, fuel_kg: 0 }, 'zh');
  const r = runStep(s, {
    muscle(id) {
      check('muscle id recover', id === 'recover');
      return { ok: true, thought, snapshot: { tag: 'agent-recover' } };
    },
  });
  check('step ok', r.ok === true);
  check('thought is the real one', r.thought === thought && r.thought.includes('2.17'), r.thought);
  check('advances to window', r.state.nodeId === 'window', r.state.nodeId);
  check('recover done', r.state.nodes.find((n) => n.id === 'recover').status === 'done');
  check('snapshot stored', r.state.snapshots.recover?.tag === 'agent-recover');
}

console.log('5. runRecoverMuscle without a dropped Titan fails honestly');
{
  const out = runRecoverMuscle({
    vessels: [],
    activeId: null,
    st: null,
    setActive() { throw new Error('should not switch'); },
  });
  check('no-booster', out.ok === false && out.reason === 'no-booster', JSON.stringify(out));
  check('no invented pad', out.pad_m == null, String(out.pad_m));
  check('no invented speed', out.speed == null, String(out.speed));
  const thought = thoughtFromCheck('recover-fail', {}, out, 'zh');
  check('fail thought no km', !/\d+(\.\d+)?\s*km/.test(thought), thought);
}

console.log('6. find / hold helpers');
{
  const titan = { id: 'stage-1', st: { parts: [{ def: { name: 'RE-M3 "Titan"' }, alive: true }] } };
  const upper = { id: 'active', st: { parts: [{ def: { name: 'LV-T45 "Sparrow"' }, alive: true }] } };
  check('isTitan', isTitanVessel(titan) && !isTitanVessel(upper));
  check('find booster', findBoosterVessel([upper, titan], 'active')?.id === 'stage-1');
  check('find none if only upper', findBoosterVessel([upper], 'active') == null);
  const n = markHeldTitans([upper, titan], 'active');
  check('held count 1', n === 1 && titan.held === true);
  check('upper not held', upper.held !== true);
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nbooster-r5 tests passed');
