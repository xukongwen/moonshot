// Pad → Mun soft landing → takeoff → TKI → Kerbin landing.
// Stock Mun Express. Attitude cheated; physics/fuel/staging/SOI/ground are real.

import { writeFileSync, mkdirSync } from 'node:fs';
import { SimSession } from '../mcp/session.mjs';
import { Autopilot, orbitText } from './lib/autopilot.mjs';
import { BODIES, fmtTime } from '../src/constants.js';
import { STOCK } from '../src/stock.js';
import { gatedStockDesign } from './lib/budget-gate.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

const gated = gatedStockDesign('Mun Express', 'mun-roundtrip');
const session = new SimSession();
const ap = new Autopilot(session);
const result = {
  craft: 'Mun Express',
  stack: gated.design.stack,
  radials: gated.design.radials,
  budgetOk: gated.plan.ok,
  redesigned: gated.redesigned,
  mun: null,
  kerbin: null,
  snaps: [],
};

try {
  console.log('1. pad → LKO');
  session.newFlightFromDesign(gated.design);
  const t0 = session.telemetry();
  check('stock loaded', t0.craft === 'Mun Express', t0.craft);
  check('has heat shield', session.st.parts.some((p) => p.def.shield));
  check('has legs', session.st.parts.some((p) => p.def.legs));
  check('has chute', session.st.parts.some((p) => p.def.chute));
  ap.ascentToOrbit();
  check('LKO', session.st.body === 'kerbin' && (ap.els().rp - BODIES.kerbin.radius) > 70_000,
    orbitText(ap.els(), 'kerbin'));

  console.log('2. TLI → Mun landing');
  const munTd = ap.munTransferAndLand();
  result.mun = munTd;
  check('landed on Mun', session.st.landed && session.st.body === 'mun' && !session.st.dead);
  check('Mun touchdown < 12 m/s', munTd.speed <= 12, `${munTd.speed.toFixed(2)} m/s`);
  check('pod alive after Mun', session.st.parts.some((p) => p.alive && p.def.pod));
  check('fuel after Mun landing', munTd.fuel > 400, `${munTd.fuel.toFixed(0)} kg`);
  const munNames = ap.landerPartNames();
  check('Mun lander only (no transfer/lifter)',
    !munNames.some((n) => /Sparrow|Falcon|Titan|FT-3200|FT-800/.test(n)),
    munNames.join(', '));
  check('Mun lander has Kestrel', munNames.some((n) => /Kestrel/.test(n)), munNames.join(', '));
  ap.dumpSnap('mun-landed');

  console.log('3. Mun ascent');
  ap.surfaceAscent('mun', { apTarget: 28_000, peClear: 20_000 });
  check('Mun orbit after ascent', session.st.body === 'mun' && ap.els().a > 0 &&
    ap.els().rp > BODIES.mun.radius + 18_000, orbitText(ap.els(), 'mun'));

  console.log('4. TKI → Kerbin reentry');
  ap.tkiFromMun();
  const home = ap.kerbinReentry();
  result.kerbin = home;
  check('landed on Kerbin', session.st.landed && session.st.body === 'kerbin' && !session.st.dead);
  check('Kerbin touchdown < 12 m/s', home.speed <= 12, `${home.speed.toFixed(2)} m/s`);
  check('pod alive at home', session.st.parts.some((p) => p.alive && p.def.pod));
  ap.dumpSnap('mun-kerbin-return');
} catch (err) {
  failures++;
  console.error('FAIL  mission', err.message);
  console.error(err.stack);
  try { ap.dumpSnap('mun-return-abort'); } catch { /* */ }
}

result.snaps = ap.snaps;
result.failures = failures;
result.met = session.st ? session.st.t : null;
mkdirSync(new URL('../logs', import.meta.url), { recursive: true });
writeFileSync(new URL('../logs/mun-return-result.json', import.meta.url), JSON.stringify(result, null, 2));

console.log('\n--- Mun return ---');
if (result.mun) {
  console.log(`Mun touchdown ${result.mun.speed.toFixed(2)} m/s  fuel ${result.mun.fuel.toFixed(0)} kg  MET ${fmtTime(result.mun.t)}`);
}
if (result.kerbin) {
  console.log(`Kerbin touchdown ${result.kerbin.speed.toFixed(2)} m/s  fuel ${result.kerbin.fuel.toFixed(0)} kg  MET ${fmtTime(result.kerbin.t)}`);
}
console.log(failures === 0 ? '\n🌕 MUN LAND + RETURN COMPLETE' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
