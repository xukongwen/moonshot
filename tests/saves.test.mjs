// Game save: VAB / flight roundtrip, validate, disk store, MCP tool names.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimSession } from '../mcp/session.mjs';
import { TOOLS } from '../mcp/server.mjs';
import { validateSave, buildSave, SAVE_FORMAT } from '../src/save.js';
import { listSaves, writeSave, readSave, deleteSave } from '../mcp/saves.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const root = mkdtempSync(join(tmpdir(), 'moonshot-saves-'));

try {
  // ---- 1. VAB-only ----
  {
    console.log('1. VAB-only capture / apply');
    const craftsPath = join(root, 'vab-crafts.json');
    const session = new SimSession({ workshop: { craftsPath } });
    for (const id of ['chute', 'pod-mk1', 'tank-s', 'eng-kestrel']) {
      session.workshop.addStackPart(id);
    }
    const stack = [...session.workshop.design.stack];
    const radials = structuredClone(session.workshop.design.radials);
    const doc = session.captureSave('tiny');
    check('format', doc.format === SAVE_FORMAT);
    check('formatVersion 1', doc.formatVersion === 1);
    check('mode vab', doc.mode === 'vab');
    check('flight null', doc.flight === null);
    check('workshop stack', deepEqual(doc.workshop.stack, stack), JSON.stringify(doc.workshop.stack));

    const other = new SimSession({ workshop: { craftsPath: join(root, 'vab-crafts-2.json') } });
    const snap = other.applySave(doc);
    check('applied stack', deepEqual(other.workshop.design.stack, stack), JSON.stringify(other.workshop.design.stack));
    check('applied radials', deepEqual(other.workshop.design.radials, radials));
    check('no flight', other.hasFlight() === false);
    check('returns workshop snapshot', Array.isArray(snap.stack) && deepEqual(snap.stack, stack));
  }

  // ---- 2. Flight ----
  {
    console.log('2. Flight capture / apply');
    const session = new SimSession({ workshop: { craftsPath: join(root, 'fly-crafts.json') } });
    session.newFlight('Mun Express');
    session.stage();
    session.setThrottle(1);
    session.step(2);
    const fuel = session.fuelLeft();
    const pos = session.st.pos.clone();
    const stageIdx = session.stageIdx;
    const t0 = session.st.t;
    const doc = session.captureSave('fly');
    check('mode flight', doc.mode === 'flight');
    check('has design', Array.isArray(doc.flight?.design?.stack) && doc.flight.design.stack.length > 0);
    check('has snapshot', doc.flight?.snapshot?.body === 'kerbin');

    const other = new SimSession({ workshop: { craftsPath: join(root, 'fly-crafts-2.json') } });
    const tlm = other.applySave(doc);
    check('body kerbin', tlm.body === 'kerbin', tlm.body);
    check('t≈2', Math.abs(tlm.t - 2) < 0.2, String(tlm.t));
    check('t matches source', Math.abs(other.st.t - t0) < 1e-6, String(other.st.t));
    check('fuel close', Math.abs(other.fuelLeft() - fuel) < 1, `${other.fuelLeft()} vs ${fuel}`);
    check('pos distance small', other.st.pos.distanceTo(pos) < 1, String(other.st.pos.distanceTo(pos)));
    check('stageIdx matches', other.stageIdx === stageIdx, `${other.stageIdx} vs ${stageIdx}`);
  }

  // ---- 3. validateSave ----
  {
    console.log('3. validateSave rejects');
    let emptyErr = '';
    try { validateSave({}); } catch (e) { emptyErr = e.message; }
    check('rejects {}', /format|Invalid save/i.test(emptyErr), emptyErr);

    let fmtErr = '';
    try { validateSave({ format: 'nope', formatVersion: 1, workshop: { name: '', stack: [], radials: [], selected: -1 } }); }
    catch (e) { fmtErr = e.message; }
    check('rejects wrong format', /format/i.test(fmtErr), fmtErr);

    let ok = false;
    try {
      validateSave(buildSave({ workshop: { name: 'x', stack: [], radials: [], selected: -1 } }));
      ok = true;
    } catch (e) { ok = false; emptyErr = e.message; }
    check('accepts buildSave', ok, emptyErr);
  }

  // ---- 4. list / delete roundtrip ----
  {
    console.log('4. list/delete roundtrip');
    const savesDir = join(root, 'slots');
    const doc = buildSave({
      name: 'slot-a',
      workshop: { name: 'A', stack: ['pod-mk1'], radials: [], selected: 0 },
    });
    writeSave('slot-a', doc, savesDir);
    const listed = listSaves(savesDir);
    check('listed slot-a', listed.some((s) => s.name === 'slot-a'), JSON.stringify(listed));
    const read = readSave('slot-a', savesDir);
    check('read name', read.name === 'slot-a', read.name);
    check('read workshop', read.workshop.name === 'A', read.workshop.name);
    deleteSave('slot-a', savesDir);
    check('deleted', listSaves(savesDir).length === 0, JSON.stringify(listSaves(savesDir)));
  }

  // ---- 5. MCP tools ----
  {
    console.log('5. MCP TOOLS');
    const names = TOOLS.map((t) => t.name);
    check('ksp_save', names.includes('ksp_save'));
    check('ksp_load', names.includes('ksp_load'));
    check('ksp_saves_list', names.includes('ksp_saves_list'));
    check('ksp_saves_delete', names.includes('ksp_saves_delete'));
    check('ksp_vab_save kept', names.includes('ksp_vab_save'));
    check('ksp_new_flight kept', names.includes('ksp_new_flight'));
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nsaves tests passed');
