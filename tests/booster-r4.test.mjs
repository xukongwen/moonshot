// R4: cheap ballistic predictor + impact-aimed boostback. Real fuel, no teleport.
import { SimSession } from '../mcp/session.mjs';
import { PAD_DIR, BODIES } from '../src/constants.js';
import { ascentTick, pointState, fuelLeft } from '../src/agent-muscles.js';
import {
  runBoostback, padDistanceM, vTowardPad, predictBallisticImpact,
} from '../src/agent-burns.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

function flyToTitanDrop() {
  const session = new SimSession();
  session.newFlight('Mun Express');
  session.stage();
  session.setThrottle(1);
  let dropped = null;
  const t0 = session.st.t;
  for (let i = 0; i < 16_000 && !session.st.dead; i++) {
    const tick = ascentTick(session.st, { plan: session.plan, stageIdx: session.stageIdx });
    pointState(session.st, tick.dir);
    session.st.throttle = tick.throttle;
    if (tick.stage) {
      const out = session.stage();
      if (out.droppedId) {
        const v = session.vesselById(out.droppedId);
        if (v?.st.parts.some((p) => /Titan/.test(p.def?.name || ''))) {
          dropped = v;
          break;
        }
      }
    }
    session.step(0.1);
    if (tick.done || session.st.t - t0 > 500) break;
  }
  return { session, dropped };
}

{
  console.log('1. ballistic impact after Titan drop is far downrange');
  const { session, dropped } = flyToTitanDrop();
  check('titan dropped', !!dropped);
  if (dropped) {
    session.setActive(dropped.id);
    const pred = predictBallisticImpact(session.st);
    check('predictor ok', pred.ok && Number.isFinite(pred.pad_m), JSON.stringify(pred));
    check('impact well past pad', pred.pad_m > 50_000, String(pred.pad_m));
    check('no teleport', padDistanceM(session.st) > 1000);
  }
}

{
  console.log('2. impact-aimed boostback pulls predicted impact inward');
  const { session, dropped } = flyToTitanDrop();
  check('titan dropped', !!dropped);
  if (dropped) {
    session.setActive(dropped.id);
    const fuel0 = fuelLeft(session.st);
    const pred0 = predictBallisticImpact(session.st);
    const toward0 = vTowardPad(session.st);
    const bb = runBoostback(session.st, {
      landReserveKg: 5200, impactPadM: 6000, vAwayStop: -400,
    });
    const fuel1 = fuelLeft(session.st);
    const pred1 = predictBallisticImpact(session.st);
    check('burned real fuel', bb.fuelUsed_kg > 500 && fuel1 < fuel0 - 500, String(bb.fuelUsed_kg));
    check('fuel not invented', Math.abs((fuel0 - fuel1) - bb.fuelUsed_kg) < 2, `${fuel0 - fuel1} vs ${bb.fuelUsed_kg}`);
    check('predicted impact closer', pred1.ok && pred1.pad_m < pred0.pad_m - 20_000,
      `${pred0.pad_m} -> ${pred1.pad_m}`);
    check('predicted impact under 15 km', pred1.ok && pred1.pad_m < 15_000, String(pred1.pad_m));
    check('vToward improved', vTowardPad(session.st) > toward0 + 200, `${toward0} -> ${vTowardPad(session.st)}`);
    check('reason impact or reserve', bb.reason === 'impact' || bb.reason === 'reserve', bb.reason);
    check('Titan still on booster', session.st.parts.some((p) => /Titan/.test(p.def?.name || '')));
    check('no teleport', padDistanceM(session.st) > 1000, String(padDistanceM(session.st)));
    check('PAD_DIR still +X', PAD_DIR.x === 1 && PAD_DIR.y === 0 && PAD_DIR.z === 0);
    check('still on Kerbin', session.st.body === 'kerbin' && BODIES.kerbin.radius === 600_000);
  }
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nbooster-r4 tests passed');
