// Workshop + MCP VAB tools: rebuild Mun Express, persist, launch, host shifts.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STOCK } from '../src/stock.js';
import { Workshop } from '../mcp/workshop.mjs';
import { SimSession } from '../mcp/session.mjs';
import { TOOLS } from '../mcp/server.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---- 1. Rebuild Mun Express from empty workshop ----
{
  console.log('1. rebuild Mun Express');
  const w = new Workshop({ craftsPath: join(tmpdir(), 'moonshot-unused-crafts.json') });
  const stock = STOCK['Mun Express'];
  for (const id of stock.stack) w.addStackPart(id);
  for (const r of stock.radials) w.addRadial(r.part, r.sym, r.host, r.attachAngle);
  const snap = w.snapshot();
  check('stack matches STOCK', deepEqual(snap.stack, stock.stack), JSON.stringify(snap.stack));
  check('radials match STOCK', deepEqual(snap.radials, stock.radials), JSON.stringify(snap.radials));
}

// ---- 2. validateLaunch ----
{
  console.log('2. validateLaunch');
  const w = new Workshop({ craftsPath: join(tmpdir(), 'moonshot-unused-crafts.json') });
  const empty = w.validateLaunch();
  check('empty fails', empty.ok === false && /pod/i.test(empty.error), empty.error);
  w.addStackPart('tank-s');
  w.addStackPart('eng-kestrel');
  const noPod = w.validateLaunch();
  check('no pod fails', noPod.ok === false && /pod/i.test(noPod.error), noPod.error);
  w.loadStock('Mun Express');
  const ok = w.validateLaunch();
  check('Mun Express ok', ok.ok === true, ok.error);
  w.loadStock('Duna Hauler');
  const okD = w.validateLaunch();
  check('Duna Hauler ok', okD.ok === true, okD.error);
  check('Duna Hauler in STOCK', Object.keys(STOCK).includes('Duna Hauler'));
}

// ---- 3. save/load roundtrip via temp crafts path ----
{
  console.log('3. save/load roundtrip');
  const dir = mkdtempSync(join(tmpdir(), 'moonshot-crafts-'));
  const path = join(dir, 'crafts.json');
  try {
    const w = new Workshop({ craftsPath: path });
    w.loadStock('Mun Express');
    w.setName('Test Express');
    w.save();
    check('listed', w.listSaved().includes('Test Express'), w.listSaved().join(','));
    const w2 = new Workshop({ craftsPath: path });
    w2.load('Test Express');
    check('loaded stack', deepEqual(w2.design.stack, STOCK['Mun Express'].stack));
    check('loaded radials', deepEqual(w2.design.radials, STOCK['Mun Express'].radials));
    check('loaded name', w2.design.name === 'Test Express', w2.design.name);
    w2.deleteSaved('Test Express');
    check('deleted', !w2.listSaved().includes('Test Express'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- 4. launchWorkshop / newFlightFromDesign ----
{
  console.log('4. launch from workshop');
  const session = new SimSession({
    workshop: { craftsPath: join(tmpdir(), 'moonshot-unused-crafts.json') },
  });
  session.workshop.loadStock('Mun Express');
  const tlm = session.launchWorkshop();
  check('body kerbin', tlm.body === 'kerbin', tlm.body);
  check('landed', tlm.landed === true);
  check('fuel > 0', tlm.fuel_kg > 0, String(tlm.fuel_kg));
  check('has flight', session.hasFlight());

  const session2 = new SimSession({
    workshop: { craftsPath: join(tmpdir(), 'moonshot-unused-crafts.json') },
  });
  const tlm2 = session2.newFlightFromDesign(structuredClone(STOCK['Mun Express']));
  check('fromDesign kerbin', tlm2.body === 'kerbin');
  check('fromDesign landed', tlm2.landed === true);
  check('fromDesign fuel', tlm2.fuel_kg > 0, String(tlm2.fuel_kg));
}

// ---- 5. remove/move updates radial hosts ----
{
  console.log('5. radial host shifts');
  const w = new Workshop({ craftsPath: join(tmpdir(), 'moonshot-unused-crafts.json') });
  for (const id of ['chute', 'pod-mk1', 'tank-s', 'eng-kestrel']) w.addStackPart(id);
  w.addRadial('legs', 1, 2);
  check('host 2 before remove', w.design.radials[0].host === 2, String(w.design.radials[0].host));
  w.removeStackPart(1);
  check('host becomes 1 after remove index 1', w.design.radials[0].host === 1, String(w.design.radials[0]?.host));
  check('radial still legs', w.design.radials[0].part === 'legs');

  const w2 = new Workshop({ craftsPath: join(tmpdir(), 'moonshot-unused-crafts.json') });
  for (const id of ['chute', 'pod-mk1', 'tank-s', 'eng-kestrel']) w2.addStackPart(id);
  w2.addRadial('fins', 4, 2); // fins force sym=1
  check('fins sym forced 1', w2.design.radials[0].sym === 1, String(w2.design.radials[0].sym));
  w2.moveStackPart(2, -1);
  check('host swapped to 1 after move up', w2.design.radials[0].host === 1, String(w2.design.radials[0].host));
}

// ---- MCP smoke: tools list ----
{
  console.log('6. MCP tools list');
  const names = TOOLS.map((t) => t.name);
  check('ksp_vab_add_part', names.includes('ksp_vab_add_part'));
  check('ksp_vab_launch', names.includes('ksp_vab_launch'));
  check('ksp_coast', names.includes('ksp_coast'));
  check('ksp_new_flight kept', names.includes('ksp_new_flight'));
  check('ksp_plan', names.includes('ksp_plan'));
  check('ksp_redesign', names.includes('ksp_redesign'));
  check('ksp_agent_get', names.includes('ksp_agent_get'));
  check('ksp_agent_plan', names.includes('ksp_agent_plan'));
}

// unknown part error
{
  console.log('7. unknown part');
  const w = new Workshop({ craftsPath: join(tmpdir(), 'moonshot-unused-crafts.json') });
  let err = '';
  try { w.addStackPart('no-such-part'); } catch (e) { err = e.message; }
  check('lists valid ids', /Unknown part/.test(err) && /pod-mk1/.test(err), err);
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nworkshop tests passed');
