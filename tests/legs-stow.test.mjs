// LT-2 stows along the tank (not the 1.25 rad A-frame). Stock: one lander ring.
import { Vector3 } from 'three';
import { PARTS } from '../src/parts.js';
import { STOCK } from '../src/stock.js';
import { buildVesselParts } from '../src/vessel.js';
import { buildVesselGroup, setLegs } from '../src/vesselviz.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

const HOST_R = 0.625;

function firstLeg(group) {
  let leg = null;
  group.traverse((o) => {
    if (!leg && o.name?.startsWith('leg') && o.userData.axis) leg = o;
  });
  return leg;
}

function footDelta(group, meshByKey, parts, deployed) {
  setLegs(meshByKey, parts, deployed);
  group.updateMatrixWorld(true);
  const leg = firstLeg(group);
  if (!leg) return null;
  const hinge = new Vector3().setFromMatrixPosition(leg.matrixWorld);
  const foot = new Vector3(0, -leg.userData.strutLen, 0).applyMatrix4(leg.matrixWorld);
  const footRadial = Math.hypot(foot.x, foot.z);
  return {
    stowAngle: leg.userData.stowAngle,
    deployAngle: leg.userData.deployAngle,
    attachR: leg.userData.attachR,
    strutLen: leg.userData.strutLen,
    dY: foot.y - hinge.y,
    dRadial: footRadial - leg.userData.attachR,
    footRadial,
    hinge,
    foot,
  };
}

function buildRing(stackId, radialId) {
  const parts = buildVesselParts({
    stack: [stackId],
    radials: [{ part: radialId, sym: 1, host: 0 }],
  });
  const { group, meshByKey } = buildVesselGroup(parts);
  return { parts, group, meshByKey };
}

console.log('1. LT-2 mesh: stow along the 1.25 m tank, deploy feet below');
{
  const { parts, group, meshByKey } = buildRing('tank-s', 'legs');
  const L = PARTS.legs.length;
  const attachR = 0.62;
  const footR = 0.17;
  const hugC = HOST_R + 0.08 - attachR;
  const hugHyp = Math.hypot(L, footR);
  const expectStow = Math.PI - Math.asin(hugC / hugHyp) - Math.atan2(footR, L);

  const stowed = footDelta(group, meshByKey, parts, false);
  check('built a leg', !!stowed);
  check('stowAngle is the hug solve (~2.98), not 1.25 A-frame',
    stowed && Math.abs(stowed.stowAngle - expectStow) < 1e-9 && Math.abs(stowed.stowAngle - 1.25) > 0.5,
    `stow=${stowed?.stowAngle} expect=${expectStow}`);
  check('deployAngle still -0.32', stowed && Math.abs(stowed.deployAngle + 0.32) < 1e-12,
    String(stowed?.deployAngle));
  check('strut 1.6 m', stowed && Math.abs(stowed.strutLen - 1.6) < 1e-12, String(stowed?.strutLen));

  // Diagnosis frame: attach at L*0.4, strut local −Y, +θ → +radial.
  // Old 1.25 rad: Δradial ~1.52 m out, ΔY ~−0.50 m (A-frame, foot ~2.14 m from axis).
  check('stowed ΔY up the stack (positive, not −0.50 m)', stowed && stowed.dY > 1.4,
    `dY=${stowed?.dY}`);
  check('stowed Δradial << 1.5 m A-frame', stowed && stowed.dRadial > 0 && stowed.dRadial < 0.40,
    `dRadial=${stowed?.dRadial}`);
  check('stowed foot radial ≈ host skin + a bit (not ~2.1 m)',
    stowed && stowed.footRadial > HOST_R && stowed.footRadial < HOST_R + 0.40,
    `footRadial=${stowed?.footRadial}`);
  check('stowed ΔY matches −L cos θ',
    stowed && Math.abs(stowed.dY - (-L * Math.cos(stowed.stowAngle))) < 1e-9,
    `dY=${stowed?.dY}`);
  check('stowed Δradial matches L sin θ',
    stowed && Math.abs(stowed.dRadial - L * Math.sin(stowed.stowAngle)) < 1e-9,
    `dRadial=${stowed?.dRadial}`);

  const deployed = footDelta(group, meshByKey, parts, true);
  check('deployed ΔY below (negative, landing still works)', deployed && deployed.dY < -1.0,
    `dY=${deployed?.dY}`);
  check('deployed foot below the hinge', deployed && deployed.foot.y < deployed.hinge.y,
    `footY=${deployed?.foot.y} hingeY=${deployed?.hinge.y}`);

  console.log(`  LT-2 stowAngle=${stowed.stowAngle.toFixed(6)}  stow dY=${stowed.dY.toFixed(4)} dRadial=${stowed.dRadial.toFixed(4)} footR=${stowed.footRadial.toFixed(4)}`);
  console.log(`  LT-2 deploy     dY=${deployed.dY.toFixed(4)} dRadial=${deployed.dRadial.toFixed(4)} footR=${deployed.footRadial.toFixed(4)}`);
}

console.log('2. LT-25 stow still along-tank (regression)');
{
  const { parts, group, meshByKey } = buildRing('tank-xl', 'legs-xl');
  const stowed = footDelta(group, meshByKey, parts, false);
  const deployed = footDelta(group, meshByKey, parts, true);
  const hostXl = 1.25;
  check('LT-25 stowAngle still 2.98', stowed && Math.abs(stowed.stowAngle - 2.98) < 1e-12,
    String(stowed?.stowAngle));
  check('LT-25 deployAngle still 0.88', stowed && Math.abs(stowed.deployAngle - 0.88) < 1e-12,
    String(stowed?.deployAngle));
  check('LT-25 stowed ΔY up the stack', stowed && stowed.dY > 3.0, `dY=${stowed?.dY}`);
  check('LT-25 stowed foot near the tank (not A-frame)',
    stowed && stowed.footRadial < hostXl + 1.0, `footRadial=${stowed?.footRadial}`);
  check('LT-25 deployed ΔY below', deployed && deployed.dY < 0, `dY=${deployed?.dY}`);
  console.log(`  LT-25 stow dY=${stowed.dY.toFixed(4)} dRadial=${stowed.dRadial.toFixed(4)} footR=${stowed.footRadial.toFixed(4)}`);
}

console.log('3. stock: one lander LT-2 on host 5, no pod ring');
{
  for (const name of ['Mun Express', 'Mun Reuser', 'Duna Hauler']) {
    const d = STOCK[name];
    const lt2 = (d.radials ?? []).filter((r) => r.part === 'legs');
    check(`${name} one LT-2 on host 5`, lt2.length === 1 && lt2[0].host === 5,
      JSON.stringify(lt2));
    check(`${name} no LT-2 on host 0`, lt2.every((r) => r.host !== 0), JSON.stringify(lt2));
    const panels = (d.radials ?? []).filter((r) => r.part === 'panel-oxstat');
    const batts0 = (d.radials ?? []).filter((r) => r.part === 'batt-z100' && r.host === 0);
    check(`${name} panel + Z-100 still on host 0`,
      panels.length === 1 && panels[0].host === 0 && batts0.length === 1,
      JSON.stringify({ panels, batts0 }));
  }
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nlegs-stow tests passed');
