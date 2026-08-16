// E3: Z-100 + OX-STAT catalog, stock hang on Express / Reuser / Hauler.
import { Vector3, Quaternion } from 'three';
import { PARTS, CATEGORIES } from '../src/parts.js';
import { STOCK } from '../src/stock.js';
import { buildVesselParts, stackGeometry, computeSections, massProps, partIdOf, stagingStats } from '../src/vessel.js';
import { SimSession } from '../mcp/session.mjs';
import { BODIES, getInertialState } from '../src/constants.js';
import { fillEC, ecCap, panelNormal, panelGen, solarFlux, sunVectorInertial } from '../src/power.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

const SHIPS = [
  { name: 'Mun Express', lastXl: 16 },
  { name: 'Mun Reuser', lastXl: 19 },
  { name: 'Duna Hauler', lastXl: 23 },
];

function lastXlHost(stack) {
  let h = -1;
  stack.forEach((id, i) => { if (id === 'tank-xl') h = i; });
  return h;
}

function powerRadials(design) {
  return (design.radials ?? []).filter((r) => r.part === 'panel-oxstat' || r.part === 'batt-z100');
}

function dropBooster(session) {
  let guard = 0;
  while (session.st.parts.some((p) => /Titan/.test(p.def.name)) && guard++ < 10) {
    session.stage();
  }
}

console.log('1. catalog: batt-z100 + panel-oxstat in Utility');
{
  check('CATEGORIES has Utility', CATEGORIES.includes('Utility'));
  const batt = PARTS['batt-z100'];
  const panel = PARTS['panel-oxstat'];
  check('batt-z100 exists', !!batt);
  check('batt-z100 Utility radial', batt?.category === 'Utility' && batt.radial === true);
  check('batt-z100 mass 8', batt?.mass === 8, String(batt?.mass));
  check('batt-z100 ecCap 100 top-level', batt?.ecCap === 100 && batt.pod == null, String(batt?.ecCap));
  check('batt-z100 no panel', !batt?.panel);
  check('panel-oxstat exists', !!panel);
  check('panel-oxstat Utility radial', panel?.category === 'Utility' && panel.radial === true);
  check('panel-oxstat mass 6', panel?.mass === 6, String(panel?.mass));
  check('panel-oxstat 0.8 EC/s', panel?.panel?.ecPerS === 0.8, String(panel?.panel?.ecPerS));
  check('panel-oxstat no deploy key', panel?.panel && panel.panel.deploy == null);
}

console.log('2. stock hang + last-XL hosts');
{
  for (const { name, lastXl } of SHIPS) {
    const d = STOCK[name];
    const counted = lastXlHost(d.stack);
    check(`${name} last XL host ${lastXl}`, counted === lastXl, `counted=${counted}`);
    const legsXl = d.radials.filter((r) => r.part === 'legs-xl');
    check(`${name} legs-xl on last XL`, legsXl.length === 1 && legsXl[0].host === lastXl,
      JSON.stringify(legsXl));
    const lt2 = d.radials.filter((r) => r.part === 'legs');
    check(`${name} one lander LT-2 on host 5`, lt2.length === 1 && lt2[0].host === 5,
      JSON.stringify(lt2));
    const panels = d.radials.filter((r) => r.part === 'panel-oxstat');
    const batts = d.radials.filter((r) => r.part === 'batt-z100');
    check(`${name} one panel-oxstat on host 0`, panels.length === 1 && panels[0].host === 0
      && panels[0].sym === 2, JSON.stringify(panels));
    check(`${name} one batt-z100 on host 0`, batts.filter((r) => r.host === 0).length === 1,
      JSON.stringify(batts));
    check(`${name} one batt-z100 on last XL`, batts.filter((r) => r.host === lastXl).length === 1,
      JSON.stringify(batts));
    check(`${name} exactly 2 Z-100 / 1 panel part`, batts.length === 2 && panels.length === 1,
      `batts=${batts.length} panels=${panels.length}`);
    const parts = buildVesselParts(d);
    const builtPower = parts.filter((p) => p.kind === 'radial' && (p.def.panel || p.def.ecCap));
    check(`${name} built 3 power radials`, builtPower.length === 3, String(builtPower.length));
    const livePanel = builtPower.find((p) => p.def.panel && p.stackIndex === 0);
    check(`${name} two live OX-STAT instances (sym 2)`, livePanel && livePanel.sym === 2,
      String(livePanel?.sym));
    const p0 = builtPower.find((p) => p.def.panel && p.stackIndex === 0);
    const b0 = builtPower.find((p) => p.def.ecCap && p.stackIndex === 0);
    const bXl = builtPower.find((p) => p.def.ecCap && p.stackIndex === lastXl);
    check(`${name} panel attachAngle π/2`, p0 && Math.abs(p0.attachAngle - Math.PI / 2) < 1e-12,
      String(p0?.attachAngle));
    check(`${name} pod batt attachAngle π`, b0 && Math.abs(b0.attachAngle - Math.PI) < 1e-12,
      String(b0?.attachAngle));
    check(`${name} XL batt attachAngle π/4`, bXl && Math.abs(bXl.attachAngle - Math.PI / 4) < 1e-12,
      String(bXl?.attachAngle));
  }
  const hop = STOCK['Suborbital Hopper'];
  check('Hopper has no panel/battery', powerRadials(hop).length === 0, JSON.stringify(hop.radials));
}

console.log('3. pad ecCap and lander remnant after booster jettison');
{
  for (const { name } of SHIPS) {
    const session = new SimSession();
    session.newFlight(name);
    fillEC(session.st);
    const pad = ecCap(session.st);
    check(`${name} pad cap 250`, pad === 250, String(pad));
    check(`${name} fillEC === cap`, session.st.ec === pad, String(session.st.ec));
    dropBooster(session);
    const rem = ecCap(session.st);
    check(`${name} booster gone`, !session.st.parts.some((p) => /Titan/.test(p.def.name)));
    check(`${name} remnant cap 150`, rem === 150, String(rem));
    check(`${name} remnant ≥ 150`, rem >= 150, String(rem));
    const livePanel = session.st.parts.some((p) => p.alive !== false && p.def.panel);
    check(`${name} remnant has live panel`, livePanel);
    const host0Panel = session.st.parts.some((p) => p.def.panel && p.stackIndex === 0 && p.alive !== false);
    check(`${name} panel still host 0`, host0Panel);
    const host0Batt = session.st.parts.some((p) => partIdOf(p.def) === 'batt-z100' && p.stackIndex === 0);
    check(`${name} pod Z-100 stayed`, host0Batt);
  }
}

console.log('4. 28 kg hang (pair + two Z-100) does not collapse pad TWR');
{
  for (const { name } of SHIPS) {
    const stats = stagingStats(structuredClone(STOCK[name]));
    const ignite = stats.find((s) => s.twrSL > 0);
    check(`${name} has pad TWR`, !!ignite, JSON.stringify(stats.map((s) => s.twrSL)));
    check(`${name} pad TWR SL > 1.15`, ignite && ignite.twrSL > 1.15, String(ignite?.twrSL));
  }
}

console.log('5. coplanar pair: shared face on the sun → gen ≈ 1.6 * flux; back → 0');
{
  const parts = buildVesselParts({
    name: 'pair',
    stack: ['pod-mk1'],
    radials: [{ part: 'panel-oxstat', sym: 2, host: 0, attachAngle: Math.PI / 2 }],
  });
  const geom = stackGeometry(parts);
  const mp = massProps(parts, geom);
  const t = 0;
  const bodyPos = getInertialState('kerbin', t).pos;
  const sunFromBody = bodyPos.clone().negate().normalize();
  const r = BODIES.kerbin.radius + 80_000;
  const pos = sunFromBody.multiplyScalar(r);
  const vel = new Vector3().crossVectors(new Vector3(0, 1, 0), pos).normalize()
    .multiplyScalar(Math.sqrt(BODIES.kerbin.mu / r));
  const quat = new Quaternion();
  const st = {
    t, body: 'kerbin',
    pos, vel, quat, angVel: new Vector3(),
    throttle: 0, landed: false, dead: false,
    parts, geom, sections: computeSections(parts), massProps: mp,
    controls: { pitch: 0, yaw: 0, roll: 0 },
    sas: false, sasMode: 'hold', sasTarget: quat.clone(),
  };
  fillEC(st);
  const panel = st.parts.find((p) => p.def.panel);
  check('pair part is one OX-STAT with sym 2', panel && panel.sym === 2, String(panel?.sym));
  // Shared face = instance 0 tangent. Both wings use that face.
  const sun = sunVectorInertial(st, st.t);
  const bodyN0 = panelNormal({ quat: new Quaternion() }, panel, 0);
  st.quat.setFromUnitVectors(bodyN0, sun);
  st.sasTarget.copy(st.quat);
  const n0 = panelNormal(st, panel, 0);
  const n1 = panelNormal(st, panel, 1);
  check('instance normals identical (shared face)', n0.dot(n1) > 0.999, String(n0.dot(n1)));
  check('90° instance faces the sun', Math.abs(n0.dot(sun) - 1) < 1e-9, String(n0.dot(sun)));
  check('270° instance faces the sun too', Math.abs(n1.dot(sun) - 1) < 1e-9, String(n1.dot(sun)));
  const flux = solarFlux(st, 0);
  const gen = panelGen(st, 0);
  check('pair gen ≈ 1.6 * flux (both lit)', Math.abs(gen - 1.6 * flux) < 1e-9, String(gen));
  check('pair gen is not a single 0.8 * flux', Math.abs(gen - 0.8 * flux) > 0.5, String(gen));
  console.log(`  pair sunlit gen=${gen} flux=${flux} 1.6*flux=${1.6 * flux}`);

  st.quat.setFromUnitVectors(bodyN0, sun.clone().negate());
  st.sasTarget.copy(st.quat);
  const genBack = panelGen(st, 0);
  check('pair gen 0 when sun on the back', genBack === 0, String(genBack));
  console.log(`  pair back gen=${genBack}`);
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\npower-e3 tests passed');
