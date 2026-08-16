// A4: revert to a finished node snapshot. Cheap; no long flight.
import { setLang } from '../src/i18n.js';
import { createState, demoPlan, completeNode } from '../src/agent-plan.js';
import {
  canRevert, revertTo, revertPrev, revertThought, refuseRevertThought,
} from '../src/agent-revert.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

setLang('zh');

console.log('1. revertPrev with no snapshots refuses');
{
  const empty = createState();
  const r0 = revertPrev(empty, { applySnapshot: () => true });
  check('empty refuses', r0.ok === false && r0.reason === 'no-snapshot');
  check('empty thought', r0.thought.includes('这一刀没有快照'), r0.thought);

  const demo = demoPlan('zh');
  const r1 = revertPrev(demo, { applySnapshot: () => true });
  check('fresh plan refuses', r1.ok === false && r1.reason === 'no-snapshot');
  check('fresh thought', r1.thought.includes('这一刀没有快照'));
  check('node stays ascent', r1.state.nodeId === 'ascent');

  let done = completeNode(demo, 'ascent');
  const r2 = revertPrev(done, { applySnapshot: () => true });
  check('done but no snap refuses', r2.ok === false && r2.reason === 'no-snapshot');
  check('still on window', r2.state.nodeId === 'window');
  check('ascent still done', r2.state.nodes.find((n) => n.id === 'ascent').status === 'done');
}

console.log('2. completeNode(ascent) + fake snapshot → revertPrev');
{
  let s = demoPlan('zh');
  s = completeNode(s, 'ascent');
  const snap = { tag: 'agent-ascent', t: 180, body: 'kerbin' };
  s = createState({ ...s, snapshots: { ascent: snap } });
  check('before: window current', s.nodeId === 'window');
  check('before: ascent done', s.nodes.find((n) => n.id === 'ascent').status === 'done');

  let applied = null;
  const r = revertPrev(s, {
    applySnapshot: (got) => { applied = got; return true; },
    check: { orbitText: '72 × 85 km', fuelKg: 1200 },
  });
  check('ok', r.ok === true);
  check('applySnapshot got stored snap', applied === snap, JSON.stringify(applied));
  check('ascent current', r.state.nodeId === 'ascent' && r.nodeId === 'ascent');
  check('ascent status current', r.state.nodes.find((n) => n.id === 'ascent').status === 'current');
  check('later pending', r.state.nodes.filter((n) => n.id !== 'ascent').every((n) => n.status === 'pending'));
  check('window not done', r.state.nodes.find((n) => n.id === 'window').status === 'pending');
  check('snap kept', r.state.snapshots.ascent === snap || r.state.snapshots.ascent?.tag === 'agent-ascent');
  check('thought uses given check', r.thought.includes('72 × 85') && r.thought.includes('1200'), r.thought);
  check('input not mutated', s.nodeId === 'window' && s.nodes.find((n) => n.id === 'ascent').status === 'done');
}

console.log('3. revert to a node without snapshot refuses');
{
  let s = demoPlan('zh');
  s = completeNode(s, 'ascent');
  s = completeNode(s, 'window');
  s = createState({ ...s, snapshots: { ascent: { tag: 'agent-ascent' } } });
  let called = false;
  const r = revertTo(s, 'window', { applySnapshot: () => { called = true; return true; } });
  check('window no snap refuses', r.ok === false && r.reason === 'no-snapshot');
  check('thought 没有快照', r.thought.includes('这一刀没有快照'), r.thought);
  check('did not apply', called === false);
  check('still on escape', r.state.nodeId === 'escape', r.state.nodeId);
}

console.log('4. revert while running refuses');
{
  let s = demoPlan('zh');
  s = completeNode(s, 'ascent');
  s = createState({
    ...s,
    running: true,
    snapshots: { ascent: { tag: 'agent-ascent' } },
  });
  let called = false;
  const r = revertPrev(s, { applySnapshot: () => { called = true; return true; } });
  check('running reason', r.ok === false && r.reason === 'running');
  check('running thought', r.thought.includes('还在飞'), r.thought);
  check('did not apply', called === false);
  check('canRevert running', canRevert(s).ok === false && canRevert(s).reason === 'running');
  check('node unchanged', r.state.nodeId === 'window');
}

console.log('5. thought helper formats what it is given — does not invent');
{
  const blank = revertThought('入轨', {}, 'zh');
  check('blank has 回到 入轨', blank.includes('回到 入轨'), blank);
  check('blank orbit emdash', blank.includes('轨道 —'), blank);
  check('blank fuel emdash', blank.includes('剩油 —'), blank);
  check('blank no invented km pair', !/\d+\s*×/.test(blank), blank);
  check('blank no invented kg', !/\d+\s*kg/.test(blank), blank);

  const given = revertThought('入轨', { orbitText: '71 × 88 km', fuelKg: 654 }, 'zh');
  check('given orbit', given.includes('71 × 88 km'), given);
  check('given fuel', given.includes('654 kg'), given);

  const fuelOnly = revertThought('入轨', { fuelKg: 12 }, 'zh');
  check('fuel only orbit —', fuelOnly.includes('轨道 —') && fuelOnly.includes('12 kg'), fuelOnly);
  check('fuel only no 72×85', !fuelOnly.includes('72') && !fuelOnly.includes('1200'), fuelOnly);

  const en = revertThought('Insertion', { orbitText: '80 × 80 km', fuelKg: 9 }, 'en');
  check('en formats given', en.includes('Back to Insertion') && en.includes('80 × 80 km') && en.includes('9 kg'), en);

  check('refuse no-snapshot zh', refuseRevertThought('no-snapshot', 'zh').includes('没有快照'));
}

console.log('6. applySnapshot false does not reset plan');
{
  let s = demoPlan('zh');
  s = completeNode(s, 'ascent');
  s = createState({ ...s, snapshots: { ascent: { tag: 'agent-ascent' } } });
  const r = revertPrev(s, { applySnapshot: () => false });
  check('apply-failed', r.ok === false && r.reason === 'apply-failed');
  check('still window', r.state.nodeId === 'window');
  check('ascent still done', r.state.nodes.find((n) => n.id === 'ascent').status === 'done');
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nagent-revert tests passed');
