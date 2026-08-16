// A5: real check thoughts. Tiny fixture; no 10-minute flight.
import { STOCK } from '../src/stock.js';
import { buildVesselParts } from '../src/vessel.js';
import { planMission, cloneDesign } from '../src/plan.js';
import { setLang } from '../src/i18n.js';
import { formatBudgetFail } from '../src/agent-goal.js';
import {
  identifyRoles, fuelInRole, runChecks, shouldRefuseStep,
} from '../src/agent-check.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

setLang('zh');

// 3-stage: Sparrow lander, Falcon transfer, Titan lifter.
const FIXTURE = {
  name: 'A5 Fixture',
  stack: [
    'pod-mk1',
    'decoupler-s',
    'tank-s',
    'eng-sparrow',
    'decoupler-s',
    'tank-s',
    'eng-falcon',
    'decoupler-l',
    'tank-m',
    'eng-titan',
  ],
  radials: [],
};

const CAPTURE_NODES = [
  { id: 'ascent', label: '入轨', status: 'done' },
  { id: 'escape', label: '逃逸', status: 'done' },
  { id: 'coast', label: '滑行', status: 'done' },
  { id: 'capture', label: '捕获', status: 'current' },
  { id: 'jettison', label: '丢掉转移级', status: 'pending' },
  { id: 'land', label: '着陆', status: 'pending' },
];

function zeroTransfer(parts, roles) {
  for (const p of parts) {
    if (p.fuel == null) continue;
    if (roles.transfer.sections.some((s) => p.stackIndex >= s.start && p.stackIndex <= s.end)) {
      p.fuel = 0;
    }
  }
}

console.log('1. identifyRoles from real engines');
{
  const fix = identifyRoles(FIXTURE);
  check('fixture transfer Falcon', fix.transfer?.nickname === 'Falcon', JSON.stringify(fix.transfer));
  check('fixture lander Sparrow', fix.lander?.nickname === 'Sparrow', JSON.stringify(fix.lander));

  const duna = identifyRoles(STOCK['Duna Hauler']);
  check('Duna Hauler transfer Raven', duna.transfer?.nickname === 'Raven', JSON.stringify(duna.transfer));
  check('Duna Hauler lander Sparrow', duna.lander?.nickname === 'Sparrow', JSON.stringify(duna.lander));

  const mun = identifyRoles(STOCK['Mun Express']);
  check('Mun Express transfer Sparrow', mun.transfer?.nickname === 'Sparrow', JSON.stringify(mun.transfer));
  check('Mun Express lander Kestrel', mun.lander?.nickname === 'Kestrel', JSON.stringify(mun.lander));
}

console.log('2. transfer fuel 0 + next node capture');
{
  const roles = identifyRoles(FIXTURE);
  const parts = buildVesselParts(FIXTURE);
  const before = fuelInRole(parts, roles.transfer);
  check('fixture transfer had fuel', before != null && before > 0, String(before));
  zeroTransfer(parts, roles);
  const got = fuelInRole(parts, roles.transfer);
  check('zeroed transfer is 0', got === 0, String(got));

  const r = runChecks({
    design: FIXTURE,
    parts,
    check: { fuelKg: 2000 },
    state: { nodes: CAPTURE_NODES, nodeId: 'capture' },
    lang: 'zh',
    when: 'inspect',
  });
  const text = r.thoughts.join('\n');
  console.log('   transfer-dry thought:', JSON.stringify(r.thoughts));
  check('warns Falcon or 转移级', /Falcon|转移级/.test(text), text);
  check('mentions 着陆器', text.includes('着陆器'), text);
  check('cites real 0 kg', text.includes('0 kg'), text);
  check('flag transferDry', r.flags.transferDry === true);
  check('does not use total 2000 as transfer', !text.includes('2000'), text);
}

console.log('3. budget fail object uses real fail[0]');
{
  const plan = planMission(cloneDesign(STOCK['Suborbital Hopper']), 'duna-roundtrip');
  check('hopper budget fails', plan.ok === false && plan.fail.length > 0);
  const f = plan.fail[0];
  const expected = formatBudgetFail(f, 'zh');
  const r = runChecks({
    plan,
    state: { plan, nodes: CAPTURE_NODES.map((n, i) => ({ ...n, status: i === 0 ? 'current' : 'pending' })), nodeId: 'ascent' },
    check: { landed: true },
    lang: 'zh',
    when: 'inspect',
  });
  console.log('   budget thought:', JSON.stringify(r.thoughts));
  check('thought is formatBudgetFail', r.thoughts.includes(expected), `${r.thoughts} vs ${expected}`);
  check('has fail id', r.thoughts.some((t) => t.includes(f.id)), r.thoughts.join(' | '));
  const shown = f.id === 'lander_twr'
    ? Math.abs(f.margin).toFixed(2)
    : String(Math.round(Math.abs(f.margin)));
  check('has real margin', r.thoughts.some((t) => t.includes(shown)), `${shown} in ${r.thoughts}`);
  check('says 预算不过', r.thoughts.some((t) => t.includes('预算不过')));

  const gate = shouldRefuseStep({
    plan,
    state: { plan, nodes: [{ id: 'ascent', label: '入轨', status: 'current' }], nodeId: 'ascent' },
    check: { landed: true },
    lang: 'zh',
  });
  check('pad+fail is obvious refuse candidate', gate.refuse === true && gate.reason === 'budget-pad');
}

console.log('4. missing fuel → no invented number');
{
  const r = runChecks({
    design: FIXTURE,
    check: {},
    state: { nodes: CAPTURE_NODES, nodeId: 'capture' },
    lang: 'zh',
    when: 'inspect',
  });
  const all = r.thoughts.join('\n');
  console.log('   missing-fuel thoughts:', JSON.stringify(r.thoughts));
  check('no kg number invented', !/\d+\s*kg/.test(all), all);
  check('transferDry skipped', r.flags.transferDry === false);
  check('transferFuelKg null', r.transferFuelKg == null);

  const pre = runChecks({
    check: {},
    state: {
      nodes: [{ id: 'ascent', label: '入轨', status: 'current' }],
      nodeId: 'ascent',
    },
    lang: 'zh',
    when: 'pre-step',
  });
  const preText = pre.thoughts.join('\n');
  console.log('   pre-step missing fuel:', JSON.stringify(pre.thoughts));
  check('pre-step has 入轨', preText.includes('入轨'), preText);
  check('pre-step no invented kg', !/\d+\s*kg/.test(preText), preText);
  check('pre-step omits or uses —', !preText.includes('kg') || preText.includes('—'), preText);
}

console.log('5. lander already current stage before jettison');
{
  const parts = buildVesselParts(FIXTURE);
  const sparrow = parts.find((p) => /Sparrow/.test(p.def?.name || ''));
  check('fixture has Sparrow', !!sparrow, String(sparrow?.def?.name));
  sparrow.ignited = true;
  const r = runChecks({
    design: FIXTURE,
    parts,
    check: { fuelKg: 500, stageIdx: 2 },
    state: { nodes: CAPTURE_NODES, nodeId: 'capture' },
    lang: 'zh',
    when: 'inspect',
  });
  const text = r.thoughts.join('\n');
  console.log('   lander-early thought:', JSON.stringify(r.thoughts));
  check('warns 着陆器', text.includes('着陆器'), text);
  check('flag landerEarly', r.flags.landerEarly === true);
  check('does not invent Δv', !/m\/s/.test(text), text);
}

console.log('6. dead / suborbital cite real orbit only');
{
  const dead = runChecks({
    check: { dead: true, orbitText: '12 × 40 km', peKm: 12 },
    state: { nodes: CAPTURE_NODES, nodeId: 'capture' },
    lang: 'zh',
    when: 'inspect',
  });
  console.log('   dead thought:', JSON.stringify(dead.thoughts));
  check('dead mentions 船毁了', dead.thoughts.some((t) => t.includes('船毁了')));
  check('dead cites given orbit', dead.thoughts.some((t) => t.includes('12 × 40 km')));

  const sub = runChecks({
    check: { dead: false, landed: false, body: 'kerbin', peKm: 12, orbitText: '12 × 80 km' },
    state: { nodes: CAPTURE_NODES, nodeId: 'capture' },
    lang: 'zh',
    when: 'post-step',
  });
  console.log('   suborbital thought:', JSON.stringify(sub.thoughts));
  check('suborbital has 12 km', sub.thoughts.some((t) => t.includes('12 km')), sub.thoughts.join(' | '));
  check('suborbital has given orbit', sub.thoughts.some((t) => t.includes('12 × 80 km')));
}


console.log('7. stageIdx pointing at lander is NOT lander-live without ignition');
{
  const parts = buildVesselParts(FIXTURE);
  const sparrow = parts.find((p) => /Sparrow/.test(p.def?.name || ''));
  const falcon = parts.find((p) => /Falcon/.test(p.def?.name || ''));
  check('fixture engines', !!(sparrow && falcon));
  falcon.ignited = true;
  sparrow.ignited = false;
  const r = runChecks({
    design: FIXTURE,
    parts,
    check: { fuelKg: 500, stageIdx: 3 },
    state: { nodes: CAPTURE_NODES, nodeId: 'capture' },
    lang: 'zh',
    when: 'inspect',
  });
  console.log('   stageIdx-only thoughts:', JSON.stringify(r.thoughts));
  check('no landerEarly from stageIdx', r.flags.landerEarly === false, JSON.stringify(r.flags));
}
if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nagent-check tests passed');
