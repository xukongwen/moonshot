import { STOCK } from '../src/stock.js';
import { planMission, formatPlan, cloneDesign } from '../src/plan.js';
import { stagingStats } from '../src/vessel.js';

const d = cloneDesign(STOCK['Mun Reuser']);
d.name = 'Mun Reuser';
const paper = planMission(d, 'mun-roundtrip');
const stats = stagingStats(d);
console.log('ok', paper.ok);
console.log(formatPlan(paper));
console.log('padTwrSL', stats[0]?.twrSL);
console.log('padWet', stats[0]?.wet);
console.log('phases', JSON.stringify(paper.phases.map(p => ({
  id: p.id, role: p.role, need: p.need,
  have: Math.round(p.have), margin: Math.round(p.margin), paid: p.paid,
})), null, 2));
console.log('stack', d.stack.join(' '));
console.log('radials', JSON.stringify(d.radials));
console.log('fail', paper.fail);
console.log('suggestion', paper.suggestion);

// also check +1 transfer tank-l paper
const extra = cloneDesign(d);
const falconAt = extra.stack.lastIndexOf('eng-falcon');
extra.stack.splice(falconAt, 0, 'tank-l');
for (const r of extra.radials) if (r.host >= falconAt) r.host += 1;
const paper2 = planMission(extra, 'mun-roundtrip');
const stats2 = stagingStats(extra);
console.log('\n== +1 transfer tank-l');
console.log('ok', paper2.ok);
console.log(formatPlan(paper2));
console.log('padTwrSL', stats2[0]?.twrSL, 'wet', stats2[0]?.wet);
