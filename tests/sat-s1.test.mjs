// S1: sat-bus / antenna / camera catalog + Kerbin Eye stock + vesselviz.
import { PARTS } from '../src/parts.js';
import { STOCK } from '../src/stock.js';
import { buildVesselParts } from '../src/vessel.js';
import { buildVesselGroup } from '../src/vesselviz.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

console.log('1. catalog');
{
  const bus = PARTS['sat-bus-s'];
  check('sat-bus-s exists', !!bus);
  check('sat-bus-s Pods', bus?.category === 'Pods');
  check('sat-bus-s mass 250', bus?.mass === 250, String(bus?.mass));
  check('sat-bus-s size 1.25', bus?.size === 1.25);
  check('sat-bus-s length ~0.80', Math.abs((bus?.length ?? 0) - 0.80) < 1e-9, String(bus?.length));
  check('sat-bus-s not radial', bus?.radial !== true);
  check('sat-bus-s probe/unmanned', bus?.probe === true || bus?.unmanned === true);
  check('sat-bus-s pod.torque 2500', bus?.pod?.torque === 2500, String(bus?.pod?.torque));
  check('sat-bus-s pod.ecCap 50', bus?.pod?.ecCap === 50, String(bus?.pod?.ecCap));
  check('sat-bus-s shape satbus', bus?.shape === 'satbus');
  check('sat-bus-s dragArea 0.5', bus?.dragArea === 0.5);
  check('sat-bus-s maxTemp 1400', bus?.maxTemp === 1400);

  const ant = PARTS['antenna-comm'];
  check('antenna-comm exists', !!ant);
  check('antenna-comm Utility', ant?.category === 'Utility');
  check('antenna-comm radial', ant?.radial === true);
  check('antenna-comm mass 30', ant?.mass === 30, String(ant?.mass));
  check('antenna-comm shape antenna', ant?.shape === 'antenna');
  check('antenna-comm dragArea 0.12', ant?.dragArea === 0.12);
  check('antenna-comm maxTemp 1400', ant?.maxTemp === 1400);

  const cam = PARTS['cam-nadir'];
  check('cam-nadir exists', !!cam);
  check('cam-nadir Utility', cam?.category === 'Utility');
  check('cam-nadir stack (not radial)', cam?.radial !== true);
  check('cam-nadir mass 40', cam?.mass === 40, String(cam?.mass));
  check('cam-nadir shape camera', cam?.shape === 'camera');
  check('cam-nadir dragArea 0.08', cam?.dragArea === 0.08);
  check('cam-nadir maxTemp 1400', cam?.maxTemp === 1400);
}

console.log('2. Kerbin Eye stock');
{
  const d = STOCK['Kerbin Eye'];
  check('Kerbin Eye exists', !!d);
  check('stack bus + camera', !!(d && d.stack[0] === 'sat-bus-s' && d.stack[1] === 'cam-nadir'),
    JSON.stringify(d?.stack));
  const panels = d?.radials.filter((r) => r.part === 'panel-oxstat') ?? [];
  const batts = d?.radials.filter((r) => r.part === 'batt-z100') ?? [];
  const ants = d?.radials.filter((r) => r.part === 'antenna-comm') ?? [];
  check('wings sym 2 host 0 at π/2', panels.length === 1 && panels[0].sym === 2 && panels[0].host === 0
    && Math.abs(panels[0].attachAngle - Math.PI / 2) < 1e-12, JSON.stringify(panels));
  check('battery sym 1 host 0 at π', batts.length === 1 && batts[0].sym === 1 && batts[0].host === 0
    && Math.abs(batts[0].attachAngle - Math.PI) < 1e-12, JSON.stringify(batts));
  check('dish sym 1 host 0 at 0', ants.length === 1 && ants[0].sym === 1 && ants[0].host === 0
    && Math.abs(ants[0].attachAngle - 0) < 1e-12, JSON.stringify(ants));
}

console.log('3. buildVesselGroup');
{
  const parts = buildVesselParts(STOCK['Kerbin Eye']);
  let group = null;
  let threw = null;
  try {
    ({ group } = buildVesselGroup(parts));
  } catch (e) {
    threw = e;
    console.error(e);
  }
  check('buildVesselParts + buildVesselGroup no throw', !threw, threw ? String(threw.message || threw) : '');
  check('group has children', !!(group && group.children.length > 0), String(group?.children?.length));
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nsat-s1 tests passed');
