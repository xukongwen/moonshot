#!/usr/bin/env node
// Dry print of stock mission budgets (no flight, no stock rewrite).

import { STOCK } from '../src/stock.js';
import { planMission, redesignForBudget, formatPlan, cloneDesign } from '../src/plan.js';

const JOBS = [
  ['Mun Express', 'mun-roundtrip'],
  ['Duna Hauler', 'duna-roundtrip'],
];

for (const [name, mission] of JOBS) {
  const design = cloneDesign(STOCK[name]);
  design.name = name;
  const before = planMission(design, mission);
  console.log(`\n======== ${name} / ${mission} ========`);
  console.log(formatPlan(before));
  if (!before.ok) {
    const red = redesignForBudget(design, mission);
    console.log(`\n-- after redesign (${red.ok ? 'ok' : 'still short'}, ${red.steps.length} steps) --`);
    for (const s of red.steps) console.log(`  ${s.reason}: ${s.change}`);
    console.log(formatPlan(red.plan));
    console.log('stock.js not written');
  }
}
