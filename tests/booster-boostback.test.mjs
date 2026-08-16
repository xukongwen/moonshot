// R3: boostback burns real fuel and kills downrange velocity toward the pad.
import { SimSession } from '../mcp/session.mjs';
import { PAD_DIR, BODIES } from '../src/constants.js';
import { ascentTick, pointState, fuelLeft } from '../src/agent-muscles.js';
import { runBoostback, padDistanceM, vTowardPad } from '../src/agent-burns.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

{
  console.log('1. padDistanceM on the pad is small');
  const session = new SimSession();
  session.newFlight('Mun Express');
  const d = padDistanceM(session.st);
  check('pad distance < 20 m', d != null && d < 20, String(d));
  check('vToward on pad is ~0', Math.abs(vTowardPad(session.st)) < 1, String(vTowardPad(session.st)));
}

{
  console.log('2. boostback after Titan drop burns fuel and reduces vAway');
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
  check('titan dropped', !!dropped);
  if (dropped) {
    session.setActive(dropped.id);
    const fuel0 = fuelLeft(session.st);
    const toward0 = vTowardPad(session.st);
    const pad0 = padDistanceM(session.st);
    check('going away from pad', toward0 < -200, String(toward0));
    check('already some km downrange', pad0 > 1000, String(pad0));
    const bb = runBoostback(session.st, { landReserveKg: 3000, vAwayStop: 40 });
    const fuel1 = fuelLeft(session.st);
    const toward1 = vTowardPad(session.st);
    check('burned real fuel', bb.fuelUsed_kg > 500 && fuel1 < fuel0 - 500, String(bb.fuelUsed_kg));
    check('fuel not invented', Math.abs((fuel0 - fuel1) - bb.fuelUsed_kg) < 2, `${fuel0 - fuel1} vs ${bb.fuelUsed_kg}`);
    check('vAway reduced', toward1 > toward0 + 200, `${toward0} -> ${toward1}`);
    check('reason is v-toward or reserve', bb.reason === 'v-toward' || bb.reason === 'reserve', bb.reason);
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
console.log('\nbooster-boostback tests passed');
