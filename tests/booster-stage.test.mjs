// R1: a decoupled stack becomes a flyable vessel (engine, fuel, attitude).
import { SimSession } from '../mcp/session.mjs';
import { BODIES } from '../src/constants.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

const hop = {
  name: 'Booster Hop',
  stack: [
    'pod-mk1', 'tank-s', 'eng-kestrel',
    'decoupler-l', 'adapter',
    'tank-xl', 'eng-titan',
  ],
  radials: [
    { part: 'legs', sym: 1, host: 5 },
    { part: 'fins', sym: 1, host: 5 },
  ],
};

const session = new SimSession();
session.newFlightFromDesign(hop);
check('one vessel on pad', session.vessels.length === 1, String(session.vessels.length));

const ign = session.stage();
check('ignition', ign.staged === 'Ignition', String(ign.staged));
check('no drop on ignition', ign.droppedId == null, String(ign.droppedId));
check('titan lit on active', session.st.parts.some((p) => /Titan/.test(p.def.name) && p.ignited));

session.setThrottle(1);
session.step(1);
check('still one vessel after 1s', session.vessels.length === 1);

const fuelBefore = session.st.parts
  .filter((p) => p.stackIndex >= 3)
  .reduce((s, p) => s + (p.fuel || 0), 0);
check('titan section still has fuel', fuelBefore > 1000, String(fuelBefore));

const sep = session.stage();
check('decouple event', sep.decouple != null, String(sep.decouple));
check('dropped id', typeof sep.droppedId === 'string' && sep.droppedId.startsWith('stage-'), String(sep.droppedId));
check('two vessels', session.vessels.length === 2, String(session.vessels.length));
check('active still upper', session.activeId === 'active', session.activeId);
check('upper has no titan', !session.st.parts.some((p) => /Titan/.test(p.def.name)));
check('kestrel lit on upper', session.st.parts.some((p) => /Kestrel/.test(p.def.name) && p.ignited));

const booster = session.vesselById(sep.droppedId);
check('booster exists', !!booster);
check('booster has titan', booster.st.parts.some((p) => /Titan/.test(p.def.name)));
check('booster titan still ignited', booster.st.parts.some((p) => /Titan/.test(p.def.name) && p.ignited));
const bFuel = booster.st.parts.reduce((s, p) => s + (p.fuel || 0), 0);
check('booster kept fuel', bFuel > 1000, String(bFuel));
check('booster has legs', booster.st.parts.some((p) => p.def.legs));
check('booster has fins', booster.st.parts.some((p) => p.def.fins));
check('booster not landed', booster.st.landed === false);
check('booster has pos', booster.st.pos.length() > BODIES.kerbin.radius);

session.setActive(sep.droppedId);
check('switched', session.activeId === sep.droppedId, session.activeId);
check('st is booster', session.st.parts.some((p) => /Titan/.test(p.def.name)));
check('fuel via session', session.fuelLeft() > 1000, String(session.fuelLeft()));

session.setThrottle(0.4);
session.step(0.5);
check('booster still alive after command', !session.st.dead);
check('booster time advanced', session.st.t > 1, String(session.st.t));

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nbooster-stage tests passed');
