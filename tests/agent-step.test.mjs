// A3: one-node step runner. Pure / cheap. No 10-minute flight.
import { STOCK } from '../src/stock.js';
import { buildVesselParts } from '../src/vessel.js';
import { stateFromKepler } from '../src/orbits.js';
import { setLang } from '../src/i18n.js';
import {
  createState, demoPlan, completeNode, nodesForMission,
} from '../src/agent-plan.js';
import { applyGoal } from '../src/agent-goal.js';
import {
  canStep, runStep, applyStepSuccess, muscleKind, currentNode, thoughtFromCheck,
} from '../src/agent-step.js';
import {
  dropToLander, runJettisonMuscle, runWindowMuscle, orbitCheck, readFlightCheck,
  lightTransferOnly, targetEjectionAngleDeg, vesselMidnightAngle, roleEngines,
} from '../src/agent-muscles.js';
import { BODIES } from '../src/constants.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

setLang('zh');

console.log('1. refuse / stub / no advance');
{
  const empty = createState();
  const noPlan = runStep(empty);
  check('no plan refuses', noPlan.ok === false && noPlan.reason === 'no-plan');
  check('no plan thought', noPlan.thought.includes('没有计划'));
  check('no plan nodeId stays null', noPlan.state.nodeId === null);

  const finished = createState({
    nodes: [
      { id: 'ascent', label: '入轨', status: 'done' },
      { id: 'window', label: '等窗口', status: 'done' },
    ],
    nodeId: 'window',
  });
  const fin = runStep(finished);
  check('finished refuses', fin.ok === false && fin.reason === 'finished');

  const running = createState({
    nodes: nodesForMission('duna-roundtrip', 'zh'),
    nodeId: 'ascent',
    running: true,
  });
  check('canStep running', canStep(running).ok === false && canStep(running).reason === 'running');

  let s = demoPlan('zh');
  s = completeNode(s, 'ascent');
  s = completeNode(s, 'window');
  check('now on escape', s.nodeId === 'escape', s.nodeId);
  const noFlight = runStep(s);
  check('escape real needs flight', noFlight.ok === false && noFlight.reason === 'no-flight', JSON.stringify({ ok: noFlight.ok, reason: noFlight.reason, stub: noFlight.stub }));
  check('does not advance', noFlight.state.nodeId === 'escape');
  check('escape still current', noFlight.state.nodes.find((n) => n.id === 'escape').status === 'current');
}

console.log('2. mocked successful 入轨 advances to 等窗口');
{
  const design = STOCK['Mun Express'];
  const before = JSON.stringify(design);
  let s = demoPlan('zh');
  check('start on ascent', s.nodeId === 'ascent');
  const snap = { tag: 'agent-ascent', t: 180, body: 'kerbin' };
  const r = runStep(s, {
    muscle() {
      return {
        ok: true,
        thought: '入轨完成。轨道 72 × 85 km，剩油 1200 kg，级 2。',
        snapshot: snap,
      };
    },
  });
  check('step ok', r.ok === true);
  check('current becomes 等窗口', r.state.nodeId === 'window' && r.nextId === 'window', r.state.nodeId);
  check('ascent done', r.state.nodes.find((n) => n.id === 'ascent').status === 'done');
  check('window current', r.state.nodes.find((n) => n.id === 'window').status === 'current');
  check('snapshot stored', r.state.snapshots.ascent?.tag === 'agent-ascent', JSON.stringify(r.state.snapshots));
  check('thought from check', r.thought.includes('72 × 85') && r.thought.includes('1200'), r.thought);
  check('does not mutate design', JSON.stringify(design) === before);
  check('input state not mutated', s.nodeId === 'ascent' && !s.snapshots.ascent);
}

console.log('3. failure does not advance');
{
  const s = demoPlan('zh');
  const r = runStep(s, {
    muscle() {
      return { ok: false, thought: '入轨失败：近拱点 12 km。剩油 40 kg。' };
    },
  });
  check('fail not ok', r.ok === false);
  check('stays on ascent', r.state.nodeId === 'ascent');
  check('ascent not done', r.state.nodes.find((n) => n.id === 'ascent').status === 'current');
  check('no snapshot', !r.state.snapshots.ascent);
  check('fail thought real', r.thought.includes('12 km') && r.thought.includes('40 kg'));
}

console.log('4. applyGoal + completeNode + muscleKind');
{
  const r = applyGoal('登月回来', STOCK['Mun Express']);
  check('mun first ascent', r.nodes[0].id === 'ascent');
  check('tli is real', muscleKind('tli') === 'real');
  check('recover is real', muscleKind('recover') === 'real');
  check('ascent real', muscleKind('ascent') === 'real');
  check('jettison real', muscleKind('jettison') === 'real');
  check('window real', muscleKind('window') === 'real');
  check('coast real', muscleKind('coast') === 'real');
  check('escape real', muscleKind('escape') === 'real');
  check('capture real', muscleKind('capture') === 'real');
  check('land real', muscleKind('land') === 'real');
  check('rise real', muscleKind('rise') === 'real');
  check('home real', muscleKind('home') === 'real');
  let s = createState({ nodes: r.nodes, nodeId: 'ascent', missionId: r.missionId, goal: r.goal });
  s = completeNode(s, 'ascent');
  check('after ascent → recover', s.nodeId === 'recover', s.nodeId);
  check('currentNode recover', currentNode(s).id === 'recover');
  check('recover label', currentNode(s).label === '回收助推', currentNode(s).label);
  s = completeNode(s, 'recover');
  check('after recover → window', s.nodeId === 'window');
  check('currentNode window', currentNode(s).id === 'window');
}

console.log('5. dropToLander does not mutate design');
{
  const design = STOCK['Mun Express'];
  const before = JSON.stringify(design);
  const parts = buildVesselParts(design);
  const st = { parts, body: 'kerbin', landed: false, dead: false, t: 0 };
  const out = dropToLander(st);
  check('drop ok or already', out.ok === true || out.already === true, JSON.stringify(out));
  if (out.ok) {
    check('parts fewer', st.parts.length < parts.length || st.parts.length < buildVesselParts(design).length);
    check('dropped names', out.dropped.length > 0, String(out.dropped));
  }
  check('design untouched', JSON.stringify(design) === before);
  const again = runJettisonMuscle(st);
  check('second jettison already/ok', again.ok === true, JSON.stringify(again));
}

console.log('6. window muscle on circular LKO (cheap rails)');
{
  const kv = stateFromKepler('kerbin', { ap_m: 80_000, pe_m: 80_000, ta_deg: 0 });
  const st = {
    t: 0, met: 0, body: 'kerbin', pos: kv.pos, vel: kv.vel,
    landed: false, dead: false, parts: [],
  };
  const orb = orbitCheck(st);
  check('LKO bound', orb.ok && orb.peKm > 70, orb.text);
  const t0 = st.t;
  const out = runWindowMuscle(st, 'mun-roundtrip');
  check('window ok', out.ok === true, JSON.stringify({ ok: out.ok, reason: out.reason, err: out.errDeg }));
  check('time advanced', st.t > t0, String(st.t));
  check('phase close', Math.abs(out.errDeg) < 2, String(out.errDeg));
  check('check has fuel field', out.check && typeof out.check.fuelKg === 'number');
}

console.log('7. window refuses pad / landed');
{
  const kv = stateFromKepler('kerbin', { ap_m: 80_000, pe_m: 80_000 });
  const pad = { t: 0, body: 'kerbin', pos: kv.pos, vel: kv.vel, landed: true, dead: false, parts: [] };
  const out = runWindowMuscle(pad, 'mun-roundtrip');
  check('landed window fails', out.ok === false && out.reason === 'landed');
}

console.log('8. readFlightCheck from real state');
{
  const kv = stateFromKepler('kerbin', { ap_m: 88_000, pe_m: 72_000, ta_deg: 10 });
  const st = { t: 10, body: 'kerbin', pos: kv.pos, vel: kv.vel, landed: false, dead: false, parts: [{ fuel: 321, def: { name: 'FT-800' }, alive: true }] };
  const c = readFlightCheck(st, { stageIdx: 2 });
  check('fuel from parts', c.fuelKg === 321, String(c.fuelKg));
  check('orbit text has km', c.orbitText.includes('km'), c.orbitText);
  check('stageIdx', c.stageIdx === 2);
  check('not invented body', c.body === 'kerbin');
}


console.log('9. muscleKind real + lightTransferOnly refuse + asymptote helper');
{
  for (const id of ['escape', 'tli', 'capture', 'land', 'rise', 'home']) {
    check(`kind ${id} real`, muscleKind(id) === 'real');
  }
  const design = STOCK['Duna Hauler'];
  const parts = buildVesselParts(design);
  const sparrow = parts.find((p) => /Sparrow/.test(p.def?.name || ''));
  const raven = parts.find((p) => /Raven/.test(p.def?.name || ''));
  check('hauler has both engines', !!(sparrow && raven));
  raven.ignited = true;
  sparrow.ignited = false;
  const roles = roleEngines({ parts });
  check('transfer is Raven', /Raven/.test(roles.transfer?.def?.name || ''), roles.transfer?.def?.name);
  check('lander is Sparrow', /Sparrow/.test(roles.lander?.def?.name || ''), roles.lander?.def?.name);
  const st = { parts, body: 'kerbin', landed: false, dead: false, t: 0 };
  const xferIdx = roles.transfer.stackIndex;
  const landerIdx = roles.lander.stackIndex;
  for (const p of parts) {
    if (p.fuel != null && p.stackIndex > landerIdx && p.stackIndex <= xferIdx) p.fuel = 0;
  }
  const refused = lightTransferOnly(st);
  check('refuse transfer-dry', refused.ok === false && refused.reason === 'transfer-dry', JSON.stringify(refused));
  check('did not light lander', sparrow.ignited === false);
  check('cites real kg', refused.transferFuelKg != null && refused.transferFuelKg <= 1, String(refused.transferFuelKg));

  const rPark = BODIES.kerbin.radius + 80_000;
  const vInf = 900;
  const alpha = targetEjectionAngleDeg(rPark, vInf, BODIES.kerbin.mu);
  const e = 1 + rPark * vInf * vInf / BODIES.kerbin.mu;
  const nuInf = Math.acos(Math.min(1, Math.max(-1, -1 / e))) * 180 / Math.PI;
  const expect = 90 - nuInf;
  check('asymptote helper matches formula', Math.abs(alpha - expect) < 1e-9, `${alpha} vs ${expect}`);
  check('not geometric midnight (0)', Math.abs(alpha) > 5, String(alpha));
  check('vesselMidnightAngle is a function', typeof vesselMidnightAngle === 'function');

  const escThought = thoughtFromCheck('escape-ok', {
    body: 'kerbin', orbitText: '81 × ∞ km', fuelKg: 6044,
  }, { vInf: 864, vInfTarget: 918 }, 'zh');
  check('escape thought has v∞', /v∞\s*864/.test(escThought), escThought);
  check('escape thought has target', escThought.includes('918'), escThought);
  const escFail = thoughtFromCheck('escape-fail', {
    body: 'kerbin', orbitText: '80 × 90 km', fuelKg: 6000,
  }, { reason: 'vinf-low', vInf: 796, vInfTarget: 918, transferFuelKg: 0 }, 'zh');
  check('escape-fail thought has v∞', /v∞\s*796/.test(escFail), escFail);
}

console.log('10. recover thought uses real pad/speed, invents none');
{
  const ok = thoughtFromCheck('recover-ok', { fuelKg: 12 }, { pad_m: 2170, speed: 9.31, fuel_kg: 0, water: false }, 'zh');
  check('recover thought has 2.17', ok.includes('2.17'), ok);
  check('recover thought has 9.31', ok.includes('9.31'), ok);
  check('recover thought 离垫', ok.includes('离垫'), ok);
  check('recover thought 触地', ok.includes('触地'), ok);
  check('recover thought no 上垫', !ok.includes('上垫') && !ok.includes('八角'), ok);
  const noPad = thoughtFromCheck('recover-ok', {}, { speed: 8.2, fuel_kg: 10 }, 'zh');
  check('no pad does not invent km', !/\d+(\.\d+)?\s*km/.test(noPad), noPad);
  check('no pad still has speed', noPad.includes('8.20') || noPad.includes('8.2'), noPad);
  const fail = thoughtFromCheck('recover-fail', {}, { reason: 'no-booster' }, 'zh');
  check('no-booster honest', fail.includes('没有扔下的助推'), fail);
  check('no-booster no fake km', !/\d+(\.\d+)?\s*km/.test(fail), fail);
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nagent-step tests passed');
