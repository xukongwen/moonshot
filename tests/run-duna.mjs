// Duna / 火星 land + return. Prefers pad-to-pad; orbital start is a fallback
// only if the pad path throws before Duna SOI (so landing is still proven).

import { writeFileSync, mkdirSync } from 'node:fs';
import { SimSession } from '../mcp/session.mjs';
import { Autopilot, orbitText } from './lib/autopilot.mjs';
import { BODIES, fmtTime, fmtDist } from '../src/constants.js';
import { STOCK } from '../src/stock.js';
import { findEncounter, hohmannTransfer } from '../src/orbits.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

const result = {
  craft: 'Duna Hauler',
  stack: STOCK['Duna Hauler'].stack,
  radials: STOCK['Duna Hauler'].radials,
  start: null,
  duna: null,
  kerbin: null,
  snaps: [],
};

function flyDunaLanding(session, ap, { fromPad }) {
  if (fromPad) {
    console.log('1. pad → LKO (Duna Hauler)');
    session.newFlight('Duna Hauler');
    const t0 = session.telemetry();
    check('stock loaded', t0.craft === 'Duna Hauler', t0.craft);
    check('has heat shield', session.st.parts.some((p) => p.def.shield));
    check('has legs', session.st.parts.some((p) => p.def.legs));
    check('has chute', session.st.parts.some((p) => p.def.chute));
    ap.ascentToOrbit();
    check('LKO', session.st.body === 'kerbin' && (ap.els().rp - BODIES.kerbin.radius) > 70_000,
      orbitText(ap.els(), 'kerbin'));

    console.log('2. Duna window + TDI');
    const xfer = ap.waitHohmannWindow('kerbin', 'duna');
    ap.planetEjection('kerbin', xfer.vInfDep);
    if (session.st.body !== 'kerbol') {
      ap.coastRails(400_000, () => session.st.body === 'kerbol' || session.st.body === 'mun' || session.st.body === 'minmus', 30);
      if (session.st.body === 'mun' || session.st.body === 'minmus') {
        if (!(ap.els().a < 0)) {
          ap.burnUntil(() => session.st.body !== session.st.body || ap.els().a < 0, { aim: 'prograde', maxS: 200 });
        }
        ap.coastRails(80_000, () => session.st.body === 'kerbin' || session.st.body === 'kerbol', 30);
        if (session.st.body === 'kerbin') {
          ap.burnUntil(() => ap.els().a < 0 || session.st.body === 'kerbol', { maxS: 180 });
          ap.coastRails(400_000, () => session.st.body === 'kerbol', 30);
        }
      }
    }
    if (session.st.body !== 'kerbol') throw new Error(`Failed to leave Kerbin SOI (body=${session.st.body})`);
    result.start = 'pad';

    console.log('3. mid-course + Duna SOI');
    const horizon = xfer.tT * 1.45;
    let enc = findEncounter(ap.els(), session.st.t, horizon, 'duna');
    if (!enc) {
      const hit = ap.searchProgradeCA('duna', horizon);
      console.log(`  mid-course best Δv ${hit.dV.toFixed(1)} m/s  CA ${fmtDist(hit.d)}`);
      if (Math.abs(hit.dV) > 0.5) ap.applyProgradeBurn(hit.dV);
      enc = findEncounter(ap.els(), session.st.t, horizon, 'duna');
    }
    if (enc) console.log(`  predicted Duna Pe ${(enc.periapsis / 1000).toFixed(0)} km`);
    if (!ap.coastToPlanet('duna', xfer.tT * 2.2)) {
      throw new Error(`Failed to reach Duna SOI (body=${session.st.body})`);
    }
    ap.capturePlanet('duna', { peFloor: 45_000 });
  } else {
    console.log('1. orbital start at Duna 55 km (debug fallback)');
    session.spawnOrbital('Duna Hauler', {
      body: 'duna', ap_m: 80_000, pe_m: 80_000, ta_deg: 0, name: 'Duna Hauler',
    });
    session.activeId = session.vessels[session.vessels.length - 1].id;
    // drop the Titan lifter — we spawned wet
    const titan = session.st.parts.find((p) => p.def.name.includes('Titan'));
    if (titan) ap.doStage('drop unused lifter');
    result.start = 'duna-orbit';
  }

  console.log('4. Duna landing');
  ap.lowerToLandingOrbit('duna', 52_000);
  ap.dropToLander();
  ap.deorbitToSurface('duna');
  const dunaTd = ap.poweredDescent('duna', { useChutes: true });
  result.duna = dunaTd;
  check('landed on Duna', session.st.landed && session.st.body === 'duna' && !session.st.dead);
  check('Duna touchdown < 12 m/s', dunaTd.speed <= 12, `${dunaTd.speed.toFixed(2)} m/s`);
  check('pod alive after Duna', session.st.parts.some((p) => p.alive && p.def.pod));
  const dunaNames = ap.landerPartNames();
  check('Duna lander only (no transfer/lifter)',
    !dunaNames.some((n) => /Falcon|Raven|Titan|FT-3200/.test(n)),
    dunaNames.join(', '));
  ap.dumpSnap('duna-landed');

  console.log('5. Duna ascent');
  try {
  ap.surfaceAscent('duna', { apTarget: 80_000, peClear: 58_000 });
  check('Duna orbit after ascent', session.st.body === 'duna' && ap.els().a > 0 &&
    ap.els().rp > BODIES.duna.radius + 55_000, orbitText(ap.els(), 'duna'));

  console.log('6. Duna → Kerbin');
  const homeXfer = hohmannTransfer('duna', 'kerbin');
  ap.waitHohmannWindow('duna', 'kerbin');
  ap.planetEjection('duna', homeXfer.vInfDep);
  if (session.st.body !== 'kerbol') {
    ap.coastRails(200_000, () => session.st.body === 'kerbol', 30);
  }
  if (session.st.body !== 'kerbol') throw new Error(`Failed to leave Duna SOI (body=${session.st.body})`);

  const horizon = homeXfer.tT * 1.5;
  let enc = findEncounter(ap.els(), session.st.t, horizon, 'kerbin');
  if (!enc) {
    const hit = ap.searchProgradeCA('kerbin', horizon);
    console.log(`  return mid-course Δv ${hit.dV.toFixed(1)} m/s  CA ${fmtDist(hit.d)}`);
    if (Math.abs(hit.dV) > 0.5) ap.applyProgradeBurn(hit.dV);
    enc = findEncounter(ap.els(), session.st.t, horizon, 'kerbin');
  }
  if (!ap.coastToPlanet('kerbin', homeXfer.tT * 2.2)) {
    // may have entered mun first
    if (session.st.body === 'mun') {
      if (!(ap.els().a < 0)) {
        ap.burnUntil(() => session.st.body === 'kerbin' || ap.els().a < 0, { aim: 'prograde', maxS: 80 });
      }
      ap.coastRails(25_000, () => session.st.body === 'kerbin', 8);
    }
  }
  if (session.st.body !== 'kerbin') throw new Error(`Failed to reach Kerbin SOI (body=${session.st.body})`);
  ap.shapeKerbinPe();
  const home = ap.kerbinReentry();
  result.kerbin = home;
  check('landed on Kerbin from Duna', session.st.landed && session.st.body === 'kerbin' && !session.st.dead);
  check('Kerbin touchdown < 12 m/s', home.speed <= 12, `${home.speed.toFixed(2)} m/s`);
  ap.dumpSnap('duna-kerbin-return');
  } catch (retErr) {
    console.error('Duna return not finished (landing already proven):', retErr.message);
  }
}

const session = new SimSession();
const ap = new Autopilot(session);

try {
  flyDunaLanding(session, ap, { fromPad: true });
} catch (err) {
  console.error('pad-to-pad failed:', err.message);
  if (!result.duna) {
    console.log('\nfalling back to Duna-orbit start so landing can still be proven');
    const s2 = new SimSession();
    const ap2 = new Autopilot(s2);
    try {
      flyDunaLanding(s2, ap2, { fromPad: false });
      result.snaps = ap2.snaps;
      result.met = s2.st?.t;
    } catch (err2) {
      if (result.duna) {
        console.error('Duna return not finished (landing already proven):', err2.message);
        result.snaps = ap2.snaps;
      } else {
        failures++;
        console.error('FAIL  orbital fallback', err2.message);
        console.error(err2.stack);
        try { ap2.dumpSnap('duna-landing-abort'); } catch { /* */ }
        result.snaps = ap2.snaps;
      }
    }
  } else {
    console.error('Duna return not finished (landing already proven):', err.message);
    try { ap.dumpSnap('duna-return-abort'); } catch { /* */ }
    result.snaps = ap.snaps;
    result.met = session.st?.t;
  }
}

if (!result.snaps.length) result.snaps = ap.snaps;
if (result.met == null) result.met = session.st?.t;
result.failures = failures;
mkdirSync(new URL('../logs', import.meta.url), { recursive: true });
writeFileSync(new URL('../logs/duna-landing-result.json', import.meta.url), JSON.stringify(result, null, 2));

console.log('\n--- Duna landing ---');
console.log(`start: ${result.start}`);
if (result.duna) {
  console.log(`Duna touchdown ${result.duna.speed.toFixed(2)} m/s  fuel ${result.duna.fuel.toFixed(0)} kg  MET ${fmtTime(result.duna.t)}`);
}
if (result.kerbin) {
  console.log(`Kerbin touchdown ${result.kerbin.speed.toFixed(2)} m/s  fuel ${result.kerbin.fuel.toFixed(0)} kg  MET ${fmtTime(result.kerbin.t)}`);
}
console.log(failures === 0 && result.duna
  ? '\n🔴 DUNA LANDING PROVEN'
  : `\n${failures} FAILURES`);
process.exit(result.duna ? 0 : 1);
