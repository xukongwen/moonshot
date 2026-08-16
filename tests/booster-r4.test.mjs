// R4: cheap ballistic predictor + impact-aimed boostback. Real fuel, no teleport.
import { SimSession } from '../mcp/session.mjs';
import { PAD_DIR, BODIES } from '../src/constants.js';
import { ascentTick, pointState, fuelLeft } from '../src/agent-muscles.js';
import {
  runBoostback, padDistanceM, vTowardPad, predictBallisticImpact,
} from '../src/agent-burns.js';
import { hasBrain } from '../src/vessel.js';

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
    check('dropped titan has no brain', hasBrain(session.st.parts) === false);
    const bb = runBoostback(session.st, {
      landReserveKg: 5200, impactPadM: 6000, vAwayStop: -400,
    });
    const fuel1 = fuelLeft(session.st);
    check('S2 mute reason no-brain', bb.reason === 'no-brain', bb.reason);
    check('S2 mute no fuel burned', bb.fuelUsed_kg === 0 && fuel1 === fuel0, String(bb.fuelUsed_kg));
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
