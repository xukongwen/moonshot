// Mission Δv budget + redesign. Pure; no flight.

import { STOCK } from '../src/stock.js';
import { PARTS } from '../src/parts.js';
import {
  MISSIONS, assignStages, planMission, redesignForBudget, cloneDesign,
} from '../src/plan.js';
import { callTool, TOOLS } from '../mcp/server.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

function stock(name) {
  const d = cloneDesign(STOCK[name]);
  d.name = name;
  return d;
}

check('28 parts', Object.keys(PARTS).length === 28, String(Object.keys(PARTS).length));
check('missions listed', 'mun-roundtrip' in MISSIONS && 'duna-roundtrip' in MISSIONS);

// ---- Hopper vs mun-roundtrip: too small ----
{
  console.log('1. Hopper vs mun-roundtrip');
  const hopper = stock('Suborbital Hopper');
  const assigned = assignStages(hopper);
  check('1-stage is lander', assigned.n === 1 && assigned.roles[0] === 'lander',
    JSON.stringify(assigned.roles));
  const plan = planMission(hopper, 'mun-roundtrip');
  check('hopper not ok', plan.ok === false);
  check('hopper fails something', plan.fail.length > 0);
  check('hopper suggestion', typeof plan.suggestion === 'string' && plan.suggestion.length > 0);
}

// ---- redesign Hopper: ok or honest fail ----
{
  console.log('2. redesign Hopper');
  const hopper = stock('Suborbital Hopper');
  const red = redesignForBudget(hopper, 'mun-roundtrip');
  check('returns design', Array.isArray(red.design.stack) && red.design.stack.length >= hopper.stack.length);
  check('input not mutated', hopper.stack.join() === STOCK['Suborbital Hopper'].stack.join());
  if (red.ok) {
    check('redesign closed budget', red.plan.ok === true);
    check('has steps', red.steps.length > 0);
  } else {
    check('honest fail after maxSteps', red.ok === false && red.plan.ok === false);
    check('reported fail list', red.plan.fail.length > 0);
    console.log(`   hopper still short after ${red.steps.length} steps: ${red.plan.suggestion}`);
  }
}

// ---- Mun Express vs mun-roundtrip ----
{
  console.log('3. Mun Express vs mun-roundtrip');
  const craft = stock('Mun Express');
  const assigned = assignStages(craft);
  check('3-stage roles', assigned.n === 3
    && assigned.roles[0] === 'lifter'
    && assigned.roles[1] === 'transfer'
    && assigned.roles[2] === 'lander', JSON.stringify(assigned.roles));
  const plan = planMission(craft, 'mun-roundtrip');
  console.log('   phases:');
  for (const p of plan.phases) {
    const paid = p.paid
      ? ` paid=${Object.entries(p.paid).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(',')}`
      : '';
    console.log(`     ${p.margin >= 0 ? 'ok' : '!!'} ${p.id} ${p.role} need=${p.need} have=${p.have.toFixed(0)} margin=${p.margin.toFixed(0)}${paid}`);
  }
  const ascent = plan.phases.find((p) => p.id === 'kerbin_ascent');
  const need = ascent.need;
  const fromLifter = Math.min(assigned.pots.lifter, need);
  const fromTransfer = need - fromLifter;
  check('Mun Express ok', plan.ok === true, plan.suggestion ?? '');
  check('kerbin_ascent does not fail',
    ascent.margin >= 0 && !plan.fail.some((f) => f.id === 'kerbin_ascent'),
    `margin=${ascent.margin.toFixed(0)}`);
  check('ascent have is lifter+transfer',
    Math.abs(ascent.have - (assigned.pots.lifter + assigned.pots.transfer)) < 1e-6,
    `have=${ascent.have.toFixed(0)}`);
  check('ascent paid lifter then transfer',
    ascent.paid
      && Math.abs(ascent.paid.lifter - fromLifter) < 1e-6
      && Math.abs(ascent.paid.transfer - fromTransfer) < 1e-6,
    JSON.stringify(ascent.paid));
  check('ascent not paid from lander',
    ascent.paid.lander == null || ascent.paid.lander === 0);
  const leftoverXfer = assigned.pots.transfer - fromTransfer;
  check('transfer leftover covers 900+350', leftoverXfer >= 900 + 350,
    `leftover=${leftoverXfer.toFixed(0)}`);
  check('lander covers 650+650+350', assigned.pots.lander >= 650 + 650 + 350,
    `lander=${assigned.pots.lander.toFixed(0)}`);
  check('did not rewrite STOCK', STOCK['Mun Express'].stack.join() === craft.stack.join());
}

// ---- tiny lander vs duna-roundtrip fails duna_ascent ----
{
  console.log('4. tiny lander vs duna-roundtrip');
  const tiny = {
    name: 'Tiny Lander',
    stack: ['pod-mk1', 'tank-s', 'eng-kestrel'],
    radials: [],
  };
  const plan = planMission(tiny, 'duna-roundtrip');
  check('tiny not ok', plan.ok === false);
  check('fails duna_ascent', plan.fail.some((f) => f.id === 'duna_ascent'),
    plan.fail.map((f) => f.id).join(','));
}

// ---- Duna Hauler vs duna-roundtrip: lifter covers ascent ----
{
  console.log('5. Duna Hauler vs duna-roundtrip');
  const craft = stock('Duna Hauler');
  const assigned = assignStages(craft);
  const plan = planMission(craft, 'duna-roundtrip');
  console.log('   phases:');
  for (const p of plan.phases) {
    const paid = p.paid
      ? ` paid=${Object.entries(p.paid).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(',')}`
      : '';
    console.log(`     ${p.margin >= 0 ? 'ok' : '!!'} ${p.id} ${p.role} need=${p.need} have=${p.have.toFixed(0)} margin=${p.margin.toFixed(0)}${paid}`);
  }
  check('Duna Hauler ok', plan.ok === true, plan.suggestion ?? '');
  const kerbin = plan.phases.find((p) => p.id === 'kerbin_ascent');
  check('kerbin_ascent does not fail',
    kerbin.margin >= 0 && !plan.fail.some((f) => f.id === 'kerbin_ascent'),
    `margin=${kerbin.margin.toFixed(0)}`);
  check('ascent not paid from lander',
    kerbin.paid.lander == null || kerbin.paid.lander === 0);
  const paidXfer = kerbin.paid.transfer ?? 0;
  check('transfer pays ≲850 of ascent', paidXfer <= 850,
    `paid.transfer=${paidXfer.toFixed(0)}`);
  const leftoverXfer = assigned.pots.transfer - paidXfer;
  check('transfer leftover covers 1200+450', leftoverXfer >= 1200 + 450,
    `leftover=${leftoverXfer.toFixed(0)}`);
  check('lander covers 900+1800+800', assigned.pots.lander >= 900 + 1800 + 800,
    `lander=${assigned.pots.lander.toFixed(0)}`);
  check('no lander_twr fail', !plan.fail.some((f) => f.id === 'lander_twr'));
  check('STOCK Duna Hauler unchanged',
    STOCK['Duna Hauler'].stack.join() === craft.stack.join());
}

// ---- stripped Hauler: redesign adds lifter fuel first, not 8 transfer tanks ----
{
  console.log('5b. stripped Duna Hauler redesign');
  const hauler = stock('Duna Hauler');
  const stripped = cloneDesign(hauler);
  let nXl = stripped.stack.filter((id) => id === 'tank-xl').length;
  while (nXl > 3) {
    const i = stripped.stack.indexOf('tank-xl');
    stripped.stack.splice(i, 1);
    for (const r of stripped.radials) {
      if (r.host >= i) r.host--;
    }
    nXl--;
  }
  const before = planMission(stripped, 'duna-roundtrip');
  check('stripped fails transfer phase',
    before.ok === false && before.fail.some((f) => f.id === 'duna_ejection' || f.id === 'duna_capture'),
    before.fail.map((f) => f.id).join(','));
  const red = redesignForBudget(stripped, 'duna-roundtrip');
  console.log(`   redesign steps (${red.steps.length}):`);
  for (const s of red.steps) console.log(`     - ${s.reason}: ${s.change}`);
  const xlAdds = red.steps.filter((s) => /tank-xl/.test(s.change) || /lifter/.test(s.reason));
  const xferAdds = red.steps.filter((s) => /tank-l/.test(s.change) || /transfer/.test(s.reason));
  const srbAdds = red.steps.filter((s) => /\bsrb\b/i.test(s.change));
  check('adds lifter fuel first',
    xlAdds.length > 0 && (xferAdds.length === 0 || red.steps.findIndex((s) => /tank-xl/.test(s.change)) < red.steps.findIndex((s) => /tank-l/.test(s.change))),
    `xl=${xlAdds.length} xfer=${xferAdds.length} first=${red.steps[0]?.change}`);
  check('not 8 transfer tanks', xferAdds.length < 8,
    `xferAdds=${xferAdds.length}`);
  check('no pile of SRBs as primary fix',
    srbAdds.length === 0 || srbAdds.length < xlAdds.length,
    `srb=${srbAdds.length} xl=${xlAdds.length}`);
  if (red.ok) {
    check('stripped redesign closed budget', red.plan.ok === true);
  } else {
    check('honest fail after redesign', red.ok === false && red.plan.ok === false && red.plan.fail.length > 0);
    console.log(`   still short: ${red.plan.suggestion}`);
  }
  check('stripped input not mutated',
    stripped.stack.filter((id) => id === 'tank-xl').length === 3);
}

// ---- planMission never mutates ----
{
  console.log('6. no mutate');
  const craft = stock('Mun Express');
  const snap = JSON.stringify(craft);
  planMission(craft, 'mun-roundtrip');
  planMission(craft, 'duna-roundtrip');
  redesignForBudget(craft, 'duna-roundtrip');
  check('design JSON unchanged', JSON.stringify(craft) === snap);
}

// ---- 2-stage: transfer charged to lander ----
{
  console.log('7. 2-stage transfer → lander');
  const two = {
    name: 'Two Stage',
    stack: [
      'pod-mk1', 'tank-m', 'eng-kestrel',
      'decoupler-s', 'tank-xl', 'eng-titan',
    ],
    radials: [],
  };
  const assigned = assignStages(two);
  check('2 roles', assigned.n === 2 && assigned.roles[0] === 'lifter' && assigned.roles[1] === 'lander',
    JSON.stringify(assigned.roles));
  const plan = planMission(two, 'mun-roundtrip');
  const xfer = plan.phases.find((p) => p.id === 'mun_transfer');
  check('transfer billed to lander', xfer && xfer.role === 'lander', xfer?.role);
  const ascent = plan.phases.find((p) => p.id === 'kerbin_ascent');
  check('2-stage ascent paid lifter first',
    ascent.paid && ascent.paid.lifter > 0 && ascent.paid.lander > 0,
    JSON.stringify(ascent.paid));
  check('2-stage ascent not from a transfer pot',
    ascent.paid.transfer == null || ascent.paid.transfer === 0);
}

// ---- MCP ksp_plan / ksp_redesign ----
{
  console.log('8. MCP tools');
  const names = TOOLS.map((t) => t.name);
  check('ksp_plan listed', names.includes('ksp_plan'));
  check('ksp_redesign listed', names.includes('ksp_redesign'));
  const plan = callTool('ksp_plan', { mission: 'mun-roundtrip', craft: 'Mun Express' });
  check('ksp_plan stock source', plan.source === 'stock');
  check('ksp_plan has phases', Array.isArray(plan.phases) && plan.phases.length >= 6);
  const red = callTool('ksp_redesign', { mission: 'duna-roundtrip', craft: 'Duna Hauler' });
  check('ksp_redesign does not write stock', red.stockUnchanged === true);
  check('ksp_redesign not applied to VAB', red.appliedToVab === false);
  const hop = callTool('ksp_plan', { mission: 'mun-roundtrip', craft: 'Suborbital Hopper' });
  check('ksp_plan hopper fail', hop.ok === false);
}


if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nplan tests passed');
