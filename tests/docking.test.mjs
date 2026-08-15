// R4/R5: dock-port + RCS parts, translate, hard weld, undock.
import { SimSession } from '../mcp/session.mjs';
import { Workshop } from '../mcp/workshop.mjs';
import { PARTS } from '../src/parts.js';
import { placeFacingPorts, evaluateCapture } from '../src/docking.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

const DOCK_CRAFT = {
  name: 'Docker',
  stack: ['dock-port-s', 'pod-mk1', 'rcs-block', 'tank-s', 'eng-kestrel'],
  radials: [],
};

check('part dock-port-s', !!PARTS['dock-port-s'] && PARTS['dock-port-s'].dock?.size === 1.25);
check('part rcs-block', !!PARTS['rcs-block'] && PARTS['rcs-block'].rcs?.thrust === 2000);

{
  console.log('1. workshop accepts parts');
  const w = new Workshop({ craftsPath: join(tmpdir(), 'moonshot-dock-crafts.json') });
  w.addStackPart('dock-port-s');
  w.addStackPart('pod-mk1');
  w.addStackPart('rcs-block');
  check('stack has dock-port-s', w.design.stack.includes('dock-port-s'), JSON.stringify(w.design.stack));
  check('stack has rcs-block', w.design.stack.includes('rcs-block'), JSON.stringify(w.design.stack));
  w.addRadial('rcs-block', 2, 1);
  check('radial rcs ok', w.design.radials.some((r) => r.part === 'rcs-block'));
}

{
  console.log('2. translate changes velocity');
  const s = new SimSession();
  s.spawnOrbital(DOCK_CRAFT, { body: 'kerbin', ap_m: 80_000, pe_m: 80_000, ta_deg: 0, name: 'RCS' });
  const v0 = s.st.vel.clone();
  s.setTranslate({ y: 1, x: 0, z: 0 });
  s.step(2);
  const dv = s.st.vel.clone().sub(v0).length();
  check('RCS dv > 0.5 m/s', dv > 0.5, String(dv));
  s.setTranslate({ x: 0, y: 0, z: 0 });
}

{
  console.log('3. hard dock + undock');
  const s = new SimSession();
  s.spawnOrbital(DOCK_CRAFT, { body: 'kerbin', ap_m: 90_000, pe_m: 90_000, ta_deg: 0, name: 'Alpha' });
  const b = s.spawnOrbital(DOCK_CRAFT, { body: 'kerbin', ap_m: 90_000, pe_m: 90_000, ta_deg: 2, name: 'Bravo' });
  s.setTarget(b.id);
  const A = s.vessels[0].st;
  const B = s.vessels[1].st;
  const ev = placeFacingPorts(A, B, 0.6);
  check('placed close', ev.dist < 1.5, String(ev.dist));
  check('placed aligned', ev.axisAng < 15, String(ev.axisAng));
  const cap = evaluateCapture(A, B);
  check('thresholds met', cap.ok, JSON.stringify({ dist: cap.dist, axis: cap.axisAng, closing: cap.closing }));
  const docked = s.dock();
  check('hard weld', docked.dockState === 'hard' && !!s.weld, docked.dockState);
  check('two vessels still', s.vessels.length === 2);
  const rel0 = B.pos.distanceTo(A.pos);
  s.step(1);
  const rel1 = B.pos.distanceTo(A.pos);
  check('weld holds B', Math.abs(rel1 - rel0) < 2 && !!s.weld, `rel ${rel0} -> ${rel1}`);
  const und = s.undock();
  check('undock free', und.dockState === 'free' && !s.weld, und.dockState);
  check('still two free', s.vessels.length === 2 && s.dockState === 'free');
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\ndocking tests passed');
