// R2: stock Titan section has legs; lifter stages with reserve, not dry.
import { SimSession } from '../mcp/session.mjs';
import { STOCK } from '../src/stock.js';
import { buildVesselParts } from '../src/vessel.js';
import {
  shouldStageDry, maybeDropLaunchStage, lifterFuelKg, lifterReserveKg,
  LIFTER_RESERVE_KG, LIFTER_RESERVE_HEAVY_KG,
} from '../src/agent-muscles.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

function titanHost(design) {
  const i = design.stack.lastIndexOf('tank-xl');
  return i;
}

{
  console.log('1. stock legs on Titan section');
  for (const name of ['Mun Express', 'Duna Hauler']) {
    const d = STOCK[name];
    const host = titanHost(d);
    const boosterLegs = (d.radials ?? []).some((r) => r.part === 'legs-xl' && r.host === host);
    check(`${name} legs-xl on last XL (host ${host})`, boosterLegs, JSON.stringify(d.radials));
    const landerStillLt2 = (d.radials ?? []).some((r) => r.part === 'legs');
    check(`${name} lander still LT-2`, landerStillLt2, JSON.stringify(d.radials));
    const parts = buildVesselParts(d);
    const lastXl = [...parts].reverse().find((p) => p.def.name === 'FT-3200 Tank');
    const legsOnLastXl = parts.some((p) => p.def.legs && p.def.size === 2.5 && p.stackIndex === lastXl.stackIndex);
    check(`${name} live parts have LT-25 on last XL`, legsOnLastXl, String(lastXl?.stackIndex));
    const xl = parts.find((p) => p.def.legs && p.def.size === 2.5);
    check(`${name} LT-25 safeSpeed 12`, xl?.def.legs.safeSpeed === 12, String(xl?.def.legs?.safeSpeed));
  }
}

{
  console.log('2. reserve amounts');
  const mun = new SimSession();
  mun.newFlight('Mun Express');
  check('Mun reserve 8500', lifterReserveKg(mun.st) === LIFTER_RESERVE_KG && LIFTER_RESERVE_KG === 8500,
    String(lifterReserveKg(mun.st)));
  const duna = new SimSession();
  duna.newFlight('Duna Hauler');
  check('Hauler reserve 5000', lifterReserveKg(duna.st) === LIFTER_RESERVE_HEAVY_KG && LIFTER_RESERVE_HEAVY_KG === 5000,
    String(lifterReserveKg(duna.st)));
}

{
  console.log('3. shouldStageDry keeps Titan above reserve');
  const session = new SimSession();
  session.newFlight('Mun Express');
  session.stage();
  const reserve = lifterReserveKg(session.st);
  check('pad Titan fuel >> reserve', lifterFuelKg(session.st) > reserve + 1000, String(lifterFuelKg(session.st)));
  const dryHigh = shouldStageDry(session.st, session.plan, session.stageIdx, { allowLander: false });
  check('does not stage fat Titan', dryHigh.stage === false, JSON.stringify(dryHigh));
  check('maybeDrop false when fat', maybeDropLaunchStage(session.st) === false);

  // Drain Titan-section tanks to just above / at reserve.
  const titan = session.st.parts.find((p) => /Titan/.test(p.def.name));
  const tanks = session.st.parts.filter((p) => p.def.fuel && !p.def.engine && p.stackIndex >= 12);
  const setFuel = (kg) => {
    let left = kg;
    for (const p of tanks) {
      const cap = p.def.fuel;
      p.fuel = Math.min(cap, Math.max(0, left));
      left -= p.fuel;
    }
  };
  setFuel(reserve + 200);
  check('fuel just above reserve', Math.abs(lifterFuelKg(session.st) - (reserve + 200)) < 1,
    String(lifterFuelKg(session.st)));
  const still = shouldStageDry(session.st, session.plan, session.stageIdx, { allowLander: false });
  check('still holds above reserve', still.stage === false, JSON.stringify(still));

  setFuel(reserve);
  check('fuel at reserve', lifterFuelKg(session.st) <= reserve, String(lifterFuelKg(session.st)));
  const now = shouldStageDry(session.st, session.plan, session.stageIdx, { allowLander: false });
  check('stages at reserve', now.stage === true && now.reason === 'lifter reserve', JSON.stringify(now));
  check('maybeDrop true at reserve', maybeDropLaunchStage(session.st) === true);
  check('titan still present', !!titan);
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nbooster-reserve tests passed');
