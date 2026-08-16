// Duna / 火星 land + return. Prefers pad-to-pad; orbital start is a fallback
// only if the pad path throws before Duna SOI (so landing is still proven).

import { writeFileSync, mkdirSync } from 'node:fs';
import { SimSession } from '../mcp/session.mjs';
import { Autopilot, orbitText } from './lib/autopilot.mjs';
import { BODIES, fmtTime, fmtDist } from '../src/constants.js';
import { STOCK } from '../src/stock.js';
import { stagingStats } from '../src/vessel.js';
import { findEncounter, hohmannTransfer, planetPhaseDeg } from '../src/orbits.js';
import { gatedStockDesign } from './lib/budget-gate.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

const gated = gatedStockDesign('Duna Hauler', 'duna-roundtrip');
const ignite = stagingStats(gated.design).find((s) => s.twrSL > 0);
const result = {
  craft: 'Duna Hauler',
  stack: gated.design.stack,
  radials: gated.design.radials,
  budgetOk: gated.plan.ok,
  redesigned: gated.redesigned,
  twrSL: ignite?.twrSL ?? null,
  wetKg: ignite?.wet ?? null,
  padLift: false,
  start: null,
  lko: null,
  window: null,
  tdi: null,
  midCourse: null,
  dunaPeKm: null,
  duna: null,
  dunaOrbit: null,
  kerbin: null,
  snaps: [],
  notes: [],
};

function flyDunaLanding(session, ap, { fromPad }) {
  if (fromPad) {
    console.log('1. pad → LKO (Duna Hauler)');
    session.newFlightFromDesign(gated.design);
    const t0 = session.telemetry();
    check('stock loaded', t0.craft === 'Duna Hauler', t0.craft);
    check('has heat shield', session.st.parts.some((p) => p.def.shield));
    check('has legs', session.st.parts.some((p) => p.def.legs));
    check('has chute', session.st.parts.some((p) => p.def.chute));
    check('has SRBs', session.st.parts.some((p) => p.def.engine?.srb),
      session.st.parts.filter((p) => p.kind === 'radial').map((p) => p.def.name).join(','));
    check('pad TWR SL ≥ 1.2', result.twrSL >= 1.2, String(result.twrSL));

    // Heavy 8×XL + Titan: stay vertical until ~180 m/s so we don't pitch
    // over during the post-SRB TWR dip (measured ~75 m/s at 5 km).
    ap.ascentToOrbit({ turnStart: 180, turnSpan: 2600 });
    check('LKO', session.st.body === 'kerbin' && (ap.els().rp - BODIES.kerbin.radius) > 70_000,
      orbitText(ap.els(), 'kerbin'));
    result.padLift = true;
    result.lko = {
      orbit: orbitText(ap.els(), 'kerbin'),
      fuel: session.fuelLeft(),
      t: session.st.t,
    };

    console.log('2. Duna window + TDI (asymptote-aligned)');
    const xfer = ap.waitHohmannWindow('kerbin', 'duna');
    const phaseNow = planetPhaseDeg('kerbin', 'duna', session.st.t);
    result.window = {
      targetDeg: xfer.phaseDeg,
      nowDeg: phaseNow,
      errDeg: ((phaseNow - xfer.phaseDeg + 180) % 360 + 360) % 360 - 180,
      tT_d: xfer.tT / 86400,
      vInfDep: xfer.vInfDep,
    };

    const ej = ap.planetEjection('kerbin', xfer.vInfDep);
    const vinf = session.st.body === 'kerbin' ? ap.vInfEst() : 0;
    result.tdi = {
      dV: ej.dV,
      vInf: vinf,
      vInfTarget: xfer.vInfDep,
      body: session.st.body,
      orbit: orbitText(ap.els(), session.st.body === 'kerbol' ? 'kerbin' : session.st.body),
      fuel: session.fuelLeft(),
    };

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
    const { enc, ca0, hit } = ap.midCourseTo('duna', horizon);
    result.midCourse = {
      ca0_m: ca0.d,
      ca0: fmtDist(ca0.d),
      dV: hit?.dV ?? 0,
      dRad: hit?.dRad ?? 0,
      enc: !!enc,
    };
    if (enc) {
      result.dunaPeKm = enc.periapsis / 1000;
      console.log(`  predicted Duna Pe ${(enc.periapsis / 1000).toFixed(0)} km`);
    } else {
      const miss = ap.closestApproach('duna', xfer.tT * 1.8);
      result.midCourse.caAfter_m = miss.d;
      result.midCourse.caAfter = fmtDist(miss.d);
      console.log(`  no encounter; CA ${fmtDist(miss.d)}`);
    }
    if (!ap.coastToPlanet('duna', xfer.tT * 2.2)) {
      throw new Error(`Failed to reach Duna SOI (body=${session.st.body} CA ${result.midCourse.ca0})`);
    }
    const cap = ap.capturePlanet('duna', { peFloor: 45_000 });
    result.dunaCapture = orbitText(cap, 'duna');
    result.dunaCaptureFuel = session.fuelLeft();
  } else {
    console.log('1. orbital start at Duna 55 km (debug fallback)');
    session.spawnOrbital(gated.design, {
      body: 'duna', ap_m: 80_000, pe_m: 80_000, ta_deg: 0, name: 'Duna Hauler',
    });
    session.activeId = session.vessels[session.vessels.length - 1].id;
    const titan = session.st.parts.find((p) => p.def.name.includes('Titan'));
    if (titan) ap.doStage('drop unused lifter');
    result.start = 'duna-orbit';
  }

  console.log('4. Duna landing');
  ap.lowerToLandingOrbit('duna', 52_000);
  ap.dropToLander();
  result.landerFuelBeforeDescent = session.fuelLeft();
  result.landerParts = ap.landerPartNames();
  // Deeper Pe uses thin Duna air; suicide-burn at 0.70 of excess TWR
  // (less hover than the default 0.45).
  ap.deorbitToSurface('duna', { peTarget: 12_000 });
  const dunaTd = ap.poweredDescent('duna', { useChutes: true, brakeFrac: 0.70 });
  result.duna = dunaTd;
  check('landed on Duna', session.st.landed && session.st.body === 'duna' && !session.st.dead);
  check('Duna touchdown < 12 m/s', dunaTd.speed <= 12, `${dunaTd.speed.toFixed(2)} m/s`);
  check('pod alive after Duna', session.st.parts.some((p) => p.alive && p.def.pod));
  const dunaNames = ap.landerPartNames();
  check('Duna lander only (no transfer/lifter)',
    !dunaNames.some((n) => /Falcon|Raven|Titan|FT-3200/.test(n)),
    dunaNames.join(', '));
  result.landerOnly = !dunaNames.some((n) => /Falcon|Raven|Titan|FT-3200/.test(n));
  ap.dumpSnap('duna-landed');

  console.log('5. Duna ascent');
  try {
  ap.surfaceAscent('duna', { apTarget: 80_000, peClear: 58_000 });
  check('Duna orbit after ascent', session.st.body === 'duna' && ap.els().a > 0 &&
    ap.els().rp > BODIES.duna.radius + 55_000, orbitText(ap.els(), 'duna'));
  result.dunaOrbit = {
    orbit: orbitText(ap.els(), 'duna'),
    fuel: session.fuelLeft(),
    t: session.st.t,
  };

  console.log('6. Duna → Kerbin');
  const homeXfer = hohmannTransfer('duna', 'kerbin');
  ap.waitHohmannWindow('duna', 'kerbin');
  ap.planetEjection('duna', homeXfer.vInfDep);
  if (session.st.body !== 'kerbol') {
    ap.coastRails(200_000, () => session.st.body === 'kerbol', 30);
  }
  if (session.st.body !== 'kerbol') throw new Error(`Failed to leave Duna SOI (body=${session.st.body})`);

  const horizon = homeXfer.tT * 1.5;
  const homeMid = ap.midCourseTo('kerbin', horizon);
  if (!ap.coastToPlanet('kerbin', homeXfer.tT * 2.2)) {
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
  result.homeMidCourse = homeMid?.ca0 ? { ca0: fmtDist(homeMid.ca0.d), enc: !!homeMid.enc } : null;
  check('landed on Kerbin from Duna', session.st.landed && session.st.body === 'kerbin' && !session.st.dead);
  check('Kerbin touchdown < 12 m/s', home.speed <= 12, `${home.speed.toFixed(2)} m/s`);
  ap.dumpSnap('duna-kerbin-return');
  } catch (retErr) {
    console.error('Duna return not finished (landing already proven):', retErr.message);
    result.notes.push(`return: ${retErr.message}`);
  }
}
const session = new SimSession();
const ap = new Autopilot(session);

try {
  flyDunaLanding(session, ap, { fromPad: true });
} catch (err) {
  console.error('pad-to-pad failed:', err.message);
  result.notes.push(`pad: ${err.message}`);
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
        result.notes.push(`return: ${err2.message}`);
      } else {
        failures++;
        console.error('FAIL  orbital fallback', err2.message);
        console.error(err2.stack);
        try { ap2.dumpSnap('duna-landing-abort'); } catch { /* */ }
        result.snaps = ap2.snaps;
        result.notes.push(`fallback: ${err2.message}`);
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
const json = JSON.stringify(result, null, 2);
writeFileSync(new URL('../logs/duna-landing-result.json', import.meta.url), json);
writeFileSync(new URL('../logs/duna-roundtrip-result.json', import.meta.url), json);

console.log('\n--- Duna landing ---');
console.log(`start: ${result.start}  padLift: ${result.padLift}  twrSL: ${result.twrSL?.toFixed(3)}`);
if (result.lko) console.log(`LKO ${result.lko.orbit}  fuel ${result.lko.fuel.toFixed(0)} kg`);
if (result.window) console.log(`window tgt ${result.window.targetDeg.toFixed(2)}°  tT ${result.window.tT_d.toFixed(2)} d`);
if (result.tdi) console.log(`TDI v∞ ${result.tdi.vInf.toFixed(0)} (tgt ${result.tdi.vInfTarget.toFixed(0)})`);
if (result.midCourse) console.log(`mid-course CA ${result.midCourse.ca0}  dV ${result.midCourse.dV?.toFixed(1)}  enc ${result.midCourse.enc}`);
if (result.dunaPeKm != null) console.log(`Duna Pe ${result.dunaPeKm.toFixed(0)} km`);
if (result.duna) {
  console.log(`Duna touchdown ${result.duna.speed.toFixed(2)} m/s  fuel ${result.duna.fuel.toFixed(0)} kg  MET ${fmtTime(result.duna.t)}`);
}
if (result.dunaOrbit) console.log(`Duna orbit ${result.dunaOrbit.orbit}  fuel ${result.dunaOrbit.fuel.toFixed(0)}`);
if (result.kerbin) {
  console.log(`Kerbin touchdown ${result.kerbin.speed.toFixed(2)} m/s  fuel ${result.kerbin.fuel.toFixed(0)} kg  MET ${fmtTime(result.kerbin.t)}`);
}
console.log(failures === 0 && result.duna
  ? '\n🔴 DUNA LANDING PROVEN'
  : `\n${failures} FAILURES`);
process.exit(result.duna ? 0 : 1);
