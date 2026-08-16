// Gate a landing test through planMission. If the budget fails, redesign
// in-memory. Fly that clone when it closes the budget (or actually patches
// lander/transfer). Never writes src/stock.js.

import { STOCK } from '../../src/stock.js';
import { planMission, redesignForBudget, formatPlan, cloneDesign } from '../../src/plan.js';

export function gatedStockDesign(stockName, missionId, log = console.log) {
  const design = cloneDesign(STOCK[stockName]);
  design.name = stockName;
  const before = planMission(design, missionId);
  log(`0. Δv budget ${stockName} / ${missionId}`);
  log(formatPlan(before));
  if (before.ok) return { design, plan: before, redesigned: false, steps: [] };
  const red = redesignForBudget(design, missionId);
  log(`   redesign ${red.ok ? 'ok' : 'still short'} after ${red.steps.length} steps`);
  for (const s of red.steps) log(`     - ${s.reason}: ${s.change}`);
  log(formatPlan(red.plan));
  red.design.name = stockName;
  const patchedUpper = red.steps.some((s) => /lander|transfer/.test(s.reason) || /tank-s|tank-m|tank-l/.test(s.change));
  if (red.ok || patchedUpper) {
    return { design: red.design, plan: red.plan, redesigned: true, steps: red.steps };
  }
  // Lifter-only shortfall that still did not close (rare after XL-first).
  log('   flying stock (redesign did not close; not clearly better)');
  return { design, plan: before, redesigned: false, steps: red.steps };
}
