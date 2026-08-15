// Kerbin → Duna Hohmann numbers, ejection Δv, and phase-angle helpers.
import {
  planetPhaseDeg, hohmannTransfer, ejectionDeltaV,
  munTransferPhase, transferPhase, findEncounter,
} from '../src/orbits.js';
import { BODIES } from '../src/constants.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
}

const xfer = hohmannTransfer('kerbin', 'duna');
console.log('  Kerbin→Duna Hohmann:', {
  tT_s: xfer.tT.toFixed(0),
  tT_d: (xfer.tT / 86400).toFixed(2),
  phaseDeg: xfer.phaseDeg.toFixed(2),
  vInfDep: xfer.vInfDep.toFixed(1),
  vInfArr: xfer.vInfArr.toFixed(1),
  aT: xfer.aT.toFixed(0),
});

check('tT ≈ 6.52e6 s (~75.5 d)', Math.abs(xfer.tT - 6.52e6) / 6.52e6 < 0.05,
  `tT=${xfer.tT}`);
check('phaseDeg ≈ 44–45°', xfer.phaseDeg > 42 && xfer.phaseDeg < 47,
  `phase=${xfer.phaseDeg}`);
check('vInfDep ≈ 900–950 m/s', xfer.vInfDep > 880 && xfer.vInfDep < 980,
  `vInfDep=${xfer.vInfDep}`);
check('vInfArr ≈ 800–850 m/s', xfer.vInfArr > 780 && xfer.vInfArr < 880,
  `vInfArr=${xfer.vInfArr}`);

const ej = ejectionDeltaV(680e3, BODIES.kerbin.mu, xfer.vInfDep);
console.log('  ejection @ 680 km:', {
  vCirc: ej.vCirc.toFixed(1),
  vEsc: ej.vEsc.toFixed(1),
  vEj: ej.vEj.toFixed(1),
  dV: ej.dV.toFixed(1),
});
check('ejection dV ≈ 1050–1100 m/s', ej.dV > 1020 && ej.dV < 1130,
  `dV=${ej.dV}`);

{
  const p = planetPhaseDeg('kerbin', 'duna', 12345);
  check('planetPhaseDeg finite and in [0, 360)',
    Number.isFinite(p) && p >= 0 && p < 360, `p=${p}`);
}

{
  const t0 = 0;
  const t1 = (2 * Math.PI) / BODIES.duna.omega;
  const p0 = planetPhaseDeg('kerbin', 'duna', t0);
  const p1 = planetPhaseDeg('kerbin', 'duna', t1);
  const delta = Math.abs(p0 - p1);
  check('phase changes over one Duna period',
    delta > 1 && delta < 359, `p0=${p0.toFixed(2)} p1=${p1.toFixed(2)}`);
}

{
  const back = hohmannTransfer('duna', 'kerbin');
  check('round-trip same aT', Math.abs(back.aT - xfer.aT) < 1,
    `aT ${xfer.aT} vs ${back.aT}`);
  check('round-trip same tT', Math.abs(back.tT - xfer.tT) < 1,
    `tT ${xfer.tT} vs ${back.tT}`);
  check('round-trip swapped vInf',
    Math.abs(back.vInfDep - xfer.vInfArr) < 1e-4
    && Math.abs(back.vInfArr - xfer.vInfDep) < 1e-4,
    `fwd dep/arr ${xfer.vInfDep.toFixed(2)}/${xfer.vInfArr.toFixed(2)} ` +
    `back ${back.vInfDep.toFixed(2)}/${back.vInfArr.toFixed(2)}`);
}

// existing helpers still exported / sane
check('munTransferPhase still works', munTransferPhase(680e3) > 100 && munTransferPhase(680e3) < 130);
check('transferPhase(mun) matches munTransferPhase',
  Math.abs(transferPhase(680e3, 'mun') - munTransferPhase(680e3)) < 1e-9);
check('findEncounter is a function', typeof findEncounter === 'function');

check('Duna display name is Duna', BODIES.duna.name === 'Duna');
check('Duna aka is 火星', BODIES.duna.aka === '火星');
check('Duna id unchanged (key duna)', BODIES.duna.orbitRadius === 20_726_155_264);

console.log(failures === 0 ? '\nAll Hohmann tests passed.' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
