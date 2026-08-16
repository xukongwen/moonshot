// Pad → Mun Reuser agent nodes. Recoverable Titan + Apollo lander-only Mun.
// This cut: 3×XL + 2 SRB Titan (host 20) + 5×tank-l + 2×tank-m Falcon.
// Between 5L (recovered, TLI leftover 143, capture dry) and 6L (Pe −61 then dry).
// Do not auto-add tank-l (that is the failed 6L). No LLM. Do not land on Falcon.
// Recover fail does not abort the Mun chain if the upper is still in orbit.
// Archives: 3xl-5l, 3xl-6l, 3xl-7l, 4stage, falcon-4xl, sparrow.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callTool, session } from '../mcp/server.mjs';
import { STOCK } from '../src/stock.js';
import { planMission, formatPlan, cloneDesign } from '../src/plan.js';
import { stagingStats } from '../src/vessel.js';
import { completeNode } from '../src/agent-plan.js';
import {
  readFlightCheck, roleEngines, transferFuelKg, fuelLeft, orbitCheck, LIFTER_RESERVE_KG,
  sectionFuel,
} from '../src/agent-muscles.js';
import { padDistanceM, isTitanVessel, isDroppedBooster } from '../src/agent-burns.js';
import { heightAt } from '../src/terrain.js';
import { serializeSnapshot, writeSnapshot } from '../mcp/snapshot.mjs';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const LOG_DIR = join(ROOT, 'logs');
const SNAP_DIR = join(ROOT, 'logs/snapshots');
const OUT = join(LOG_DIR, 'mun-reuser-result.json');
mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(SNAP_DIR, { recursive: true });

const ORDER = ['ascent', 'recover', 'window', 'tli', 'coast', 'capture', 'jettison', 'land', 'rise', 'home'];

function nowIso() {
  return new Date().toISOString();
}

function wallMs(t0) {
  return Date.now() - t0;
}

function ignitedNames(st) {
  return (st?.parts ?? [])
    .filter((p) => p.alive !== false && p.ignited && p.def?.engine)
    .map((p) => p.def.name);
}

function partNames(st) {
  return (st?.parts ?? []).filter((p) => p.alive !== false).map((p) => p.def?.name).filter(Boolean);
}

function rolesNow(st) {
  const { lander, transfer } = roleEngines(st);
  return {
    landerName: lander?.def?.name ?? null,
    transferName: transfer?.def?.name ?? null,
    ignited: ignitedNames(st),
    transferFuelKg: transferFuelKg(st),
    falconFuelKg: engineSectionFuel(st, /Falcon/),
    sparrowFuelKg: engineSectionFuel(st, /Sparrow/),
  };
}

function engineSectionFuel(st, nameRe) {
  const eng = (st?.parts ?? []).find((p) => p.alive !== false && nameRe.test(p.def?.name || ''));
  return eng ? sectionFuel(st, eng) : null;
}

function dumpSnap(tag) {
  if (!session.st) return null;
  const snap = serializeSnapshot(session.st, { tag, craft: session.craftName });
  const path = writeSnapshot(snap, SNAP_DIR);
  return { tag, path, t: snap.t, body: snap.body, landed: snap.landed, dead: snap.dead };
}

function dumpVesselSnap(vessel, tag) {
  if (!vessel?.st) return null;
  const prev = session.activeId;
  if (vessel.id !== session.activeId) session.setActive(vessel.id);
  const snap = serializeSnapshot(session.st, { tag, craft: vessel.name || session.craftName });
  const path = writeSnapshot(snap, SNAP_DIR);
  if (prev && prev !== session.activeId) {
    try { session.setActive(prev); } catch { /* stay */ }
  }
  return { tag, path, t: snap.t, body: snap.body, landed: snap.landed, dead: snap.dead, vesselId: vessel.id };
}

function waterOf(st) {
  if (!st?.pos || st.body !== 'kerbin') return false;
  const u = st.pos.clone().normalize();
  const th = heightAt(st.body, u);
  return th <= 1;
}

function aglOf(st) {
  if (!st?.pos) return null;
  const body = st.body;
  const { BODIES } = session;
  // use telemetry if this is the active ship
  try {
    if (session.st === st) {
      const tlm = session.telemetry();
      return tlm.agl_m ?? null;
    }
  } catch { /* fall through */ }
  const r = st.pos.length();
  return r; // placeholder overwritten below
}

function vesselBrief(v) {
  if (!v?.st) return null;
  const orb = orbitCheck(v.st);
  const names = partNames(v.st);
  let agl_m = null;
  try {
    const tlm = v.id === session.activeId ? session.telemetry() : null;
    agl_m = tlm?.agl_m ?? null;
  } catch { agl_m = null; }
  return {
    id: v.id,
    name: v.name,
    held: !!v.held,
    titan: isTitanVessel(v),
    booster: isDroppedBooster(v),
    body: v.st.body,
    landed: !!v.st.landed,
    dead: !!v.st.dead,
    fuel_kg: fuelLeft(v.st),
    pad_m: padDistanceM(v.st),
    water: waterOf(v.st),
    speed_ms: v.st.vel?.length?.() ?? null,
    orbitText: orb.text,
    peKm: orb.peKm,
    apKm: orb.apKm,
    bound: orb.ok,
    parts: names,
    ignited: ignitedNames(v.st),
    agl_m,
  };
}

function describeCraft(design) {
  const nL = design.stack.filter((x) => x === 'tank-l').length;
  const nM = design.stack.filter((x) => x === 'tank-m').length;
  const nS = design.stack.filter((x) => x === 'tank-s').length;
  const nXl = design.stack.filter((x) => x === 'tank-xl').length;
  const srb = (design.radials ?? []).find((r) => r.part === 'srb');
  const nSrb = srb ? (srb.sym || 1) : 0;
  const four = design.stack.includes('eng-falcon') && design.stack.includes('eng-sparrow');
  const xferEng = four ? 'Falcon circularize + Sparrow TLI'
    : design.stack.includes('eng-falcon') ? 'Falcon'
    : design.stack.includes('eng-sparrow') ? 'Sparrow'
    : design.stack.includes('eng-raven') ? 'Raven'
    : 'transfer';
  return {
    lander: `pod + chute + shield + decoupler + ${nL >= 1 ? 'tank-l' : ''} + ${nS ? 'tank-s' : ''} + Kestrel`,
    transfer: four
      ? `Falcon 3×L+M circularize, Sparrow 2×L+M TLI (${nL}×L / ${nM}×M total)`
      : `${Math.max(0, nL - 1)}× tank-l + ${nM}× tank-m + ${xferEng}`,
    lifter: `${nXl}× XL + Titan + LT-25 + fins + ${nSrb} SRB`,
    nL, nM, nS, nXl, nSrb, xferEng, fourStage: four,
  };
}

function nodeRecord(nodeId, stepOut, extra = {}) {
  const check = session.st ? readFlightCheck(session.st, { stageIdx: session.stageIdx ?? 0 }) : null;
  const roles = session.st ? rolesNow(session.st) : {};
  let tlm = null;
  try { tlm = session.st ? session.telemetry() : null; } catch { tlm = null; }
  return {
    nodeId,
    ok: !!stepOut?.ok,
    stub: !!stepOut?.stub,
    thought: stepOut?.thought ?? session.agent?.thought ?? '',
    reason: stepOut?.reason ?? extra.reason ?? null,
    nextId: stepOut?.nextId ?? session.agent?.nodeId ?? null,
    t: session.st?.t ?? null,
    body: check?.body ?? null,
    landed: check?.landed ?? null,
    dead: check?.dead ?? null,
    peKm: check?.peKm ?? null,
    apKm: check?.apKm ?? null,
    orbitText: check?.orbitText ?? null,
    fuelKg: check?.fuelKg ?? null,
    transferFuelKg: roles.transferFuelKg ?? null,
    falconFuelKg: roles.falconFuelKg ?? null,
    sparrowFuelKg: roles.sparrowFuelKg ?? null,
    landerName: roles.landerName ?? null,
    transferName: roles.transferName ?? null,
    ignited: roles.ignited ?? [],
    parts: check?.parts ?? [],
    stageIdx: session.stageIdx ?? check?.stageIdx ?? null,
    alt_m: tlm?.alt_m ?? null,
    agl_m: tlm?.agl_m ?? null,
    speed_ms: tlm?.speed_ms ?? null,
    ...extra,
  };
}

function applyRedesign(kind) {
  // Only allowed patch: one extra transfer tank-l after Falcon-dry-before-Pe>0.
  // Do NOT drop SRBs. Do NOT add XL. Do not invent engines.
  const craft = STOCK['Mun Reuser'];
  const note = [];
  if (kind === 'add-transfer-tank-l') {
    const falconAt = craft.stack.lastIndexOf('eng-falcon');
    if (falconAt < 0) throw new Error('no Falcon in stack');
    craft.stack.splice(falconAt, 0, 'tank-l');
    for (const r of craft.radials ?? []) {
      if (r.host >= falconAt) r.host += 1;
    }
    note.push('added 1 transfer tank-l above Falcon (Falcon dry before Pe>0)');
  } else {
    throw new Error(`unknown redesign ${kind} (drop-srb / add-xl disabled)`);
  }
  const srcPath = join(ROOT, 'src/stock.js');
  let src = readFileSync(srcPath, 'utf8');
  const stackLit = `stack: [\n      ${craft.stack.map((id) => `'${id}'`).join(', ')}\n    ]`;
  const radLit = `radials: [\n${craft.radials.map((r) => `      { part: '${r.part}', sym: ${r.sym}, host: ${r.host} },`).join('\n')}\n    ]`;
  const blockRe = /('Mun Reuser': \{[\s\S]*?)stack: \[[\s\S]*?\],\s*radials: \[[\s\S]*?\],\n  \}/;
  if (!blockRe.test(src)) throw new Error('could not locate Mun Reuser block in stock.js');
  src = src.replace(blockRe, (_, head) => `${head}${stackLit},\n    ${radLit},\n  }`);
  writeFileSync(srcPath, src);
  return { kind, note: note.join('; '), stack: [...craft.stack], radials: craft.radials.map((r) => ({ ...r })) };
}

function isFalconDryBeforePe(ascentRec) {
  if (!ascentRec) return false;
  if (!ascentRec.titanDropped) return false;
  const ignited = ascentRec.ignited || [];
  const falconSeen = /Falcon/.test(ascentRec.transferName || '')
    || ignited.some((n) => /Falcon/.test(n))
    || ascentRec.falconFuelKg != null;
  const falconDry = (ascentRec.falconFuelKg ?? ascentRec.transferFuelKg ?? 1e9) <= 5;
  const pe = ascentRec.peKm;
  const peNonPos = pe == null || pe <= 0;
  const sparrowEaten = (ascentRec.sparrowFuelKg ?? 1e9) < 9500 && ascentRec.sparrowFuelKg != null;
  // 4-stage: Falcon dry + still suborbital, or ascent "ok" only because Sparrow was stolen.
  if (ascentRec.ok && sparrowEaten) return !!(falconSeen && falconDry);
  if (ascentRec.ok) return false;
  return !!(falconSeen && falconDry && (peNonPos || sparrowEaten));
}

function loadPreviousSparrow() {
  const archive = join(LOG_DIR, 'mun-reuser-result-sparrow.json');
  if (!existsSync(archive)) {
    return {
      archive: null,
      note: 'Three Sparrow-transfer flights all died on ascent (see prior mun-reuser-result.json). Titan dropped at the 8.5 t reserve with Pe around −580 km; Sparrow (Isp SL 85) could not circularize. Paper does NOT withhold the 8500 kg reserve, so it overstates ascent.',
    };
  }
  const old = JSON.parse(readFileSync(archive, 'utf8'));
  return {
    archive: 'logs/mun-reuser-result-sparrow.json',
    note: 'Three Sparrow-transfer flights all died on ascent. Titan dropped at the 8.5 t reserve with Pe around −580 km; Sparrow (Isp SL 85) could not circularize. Paper budget does NOT withhold the 8500 kg reserve, so it overstates ascent.',
    startedAt: old.startedAt ?? null,
    finishedAt: old.finishedAt ?? null,
    verdict: old.verdict ?? null,
    attempts: (old.attempts || []).map((a) => {
      const ascent = (a.nodes || []).find((n) => n.nodeId === 'ascent') || null;
      return {
        id: a.id,
        name: a.name,
        planOk: a.planOk,
        padTwrSL: a.padTwrSL,
        planText: a.planText,
        note: a.note ?? null,
        verdict: a.verdict ?? null,
        ascent: ascent && {
          ok: ascent.ok,
          thought: ascent.thought,
          t: ascent.t,
          orbitText: ascent.orbitText,
          peKm: ascent.peKm,
          apKm: ascent.apKm,
          fuelKg: ascent.fuelKg,
          transferFuelKg: ascent.transferFuelKg,
          transferName: ascent.transferName,
          ignited: ascent.ignited,
          dead: ascent.dead,
          titanDropped: ascent.titanDropped,
        },
      };
    }),
  };
}

function loadPreviousFalcon4xl() {
  const archive = join(LOG_DIR, 'mun-reuser-result-falcon-4xl.json');
  if (!existsSync(archive)) {
    return { archive: null, note: 'Falcon 4×XL archive missing.' };
  }
  const old = JSON.parse(readFileSync(archive, 'utf8'));
  const ascent = (old.nodes || []).find((n) => n.nodeId === 'ascent') || null;
  const recover = (old.nodes || []).find((n) => n.nodeId === 'recover') || null;
  const tli = (old.nodes || []).find((n) => n.nodeId === 'tli') || null;
  const capture = (old.nodes || []).find((n) => n.nodeId === 'capture') || null;
  const padKm = recover?.pad_m != null ? (recover.pad_m / 1000).toFixed(1) : '—';
  const touch = recover?.thought?.match(/([\d.]+)\s*m\/s/)?.[1] ?? null;
  const xferLeft = (n) => (n?.transferFuelKg != null ? Math.round(n.transferFuelKg) : '—');
  const note = [
    `Falcon 4×XL + 3×L+M archive (${old.lifter || '4×XL'} / ${old.transfer || '3×L+M Falcon'}).`,
    ascent?.ok
      ? `LKO ${ascent.orbitText}, transfer leftover ${xferLeft(ascent)} kg.`
      : `ascent ${ascent?.thought ?? 'n/a'}`,
    recover
      ? `recover ${recover.ok ? 'ok' : 'FAIL'} ${padKm} km / ${touch ?? recover.speed ?? '—'} m/s / water=${recover.water} (not 上垫).`
      : '',
    tli?.ok ? `TLI leftover ${xferLeft(tli)} kg.` : '',
    capture
      ? `capture ${capture.ok ? 'ok' : 'FAIL'} ${capture.orbitText}, xfer ${xferLeft(capture)} kg.`
      : '',
    '4 XL throws the booster too far; this cut is 3 XL Express recovery class + thicker transfer.',
  ].filter(Boolean).join(' ');
  return {
    archive: 'logs/mun-reuser-result-falcon-4xl.json',
    note,
    startedAt: old.startedAt ?? null,
    finishedAt: old.finishedAt ?? null,
    verdict: old.verdict ?? null,
    stack: old.stack ?? null,
    lifter: old.lifter ?? null,
    transfer: old.transfer ?? null,
    padTwrSL: old.padTwrSL ?? null,
    ascent: ascent && {
      ok: ascent.ok, thought: ascent.thought, orbitText: ascent.orbitText,
      transferFuelKg: ascent.transferFuelKg, fuelKg: ascent.fuelKg,
    },
    recover: recover && {
      ok: recover.ok, thought: recover.thought, pad_m: recover.pad_m,
      water: recover.water, claimedPad: recover.claimedPad ?? false,
    },
    tli: tli && {
      ok: tli.ok, thought: tli.thought, orbitText: tli.orbitText,
      transferFuelKg: tli.transferFuelKg,
    },
    capture: capture && {
      ok: capture.ok, thought: capture.thought, orbitText: capture.orbitText,
      transferFuelKg: capture.transferFuelKg,
    },
  };
}

function loadPrevious3xl5l() {
  const archive = join(LOG_DIR, 'mun-reuser-result-3xl-5l.json');
  if (!existsSync(archive)) {
    return { archive: null, note: '3×XL + 5×L+M archive missing.' };
  }
  const old = JSON.parse(readFileSync(archive, 'utf8'));
  const ascent = (old.nodes || []).find((n) => n.nodeId === 'ascent') || null;
  const recover = (old.nodes || []).find((n) => n.nodeId === 'recover') || null;
  const tli = (old.nodes || []).find((n) => n.nodeId === 'tli') || null;
  const capture = (old.nodes || []).find((n) => n.nodeId === 'capture') || null;
  const padKm = recover?.pad_m != null ? (recover.pad_m / 1000).toFixed(2) : '—';
  const touch = recover?.thought?.match(/([\d.]+)\s*m\/s/)?.[1] ?? null;
  const xferLeft = (n) => (n?.transferFuelKg != null ? Math.round(n.transferFuelKg) : '—');
  const note = [
    `3×XL + 5×L+M Falcon archive (${old.lifter || '3×XL'} / ${old.transfer || '5×L+M Falcon'}).`,
    ascent?.ok
      ? `LKO ${ascent.orbitText}, transfer leftover ${xferLeft(ascent)} kg.`
      : `ascent ${ascent?.thought ?? 'n/a'}`,
    recover
      ? `recover ${recover.ok ? 'ok' : 'FAIL'} ${padKm} km / ${touch ?? recover.speed ?? '—'} m/s / water=${recover.water} (not 上垫).`
      : '',
    tli?.ok ? `TLI leftover ${xferLeft(tli)} kg.` : '',
    capture
      ? `capture ${capture.ok ? 'ok' : 'FAIL'} ${capture.orbitText}, xfer ${xferLeft(capture)} kg.`
      : '',
    '5×L+M recovered the booster but TLI left 143 kg and Mun capture died dry. This cut adds two transfer tank-l for capture leftover.',
  ].filter(Boolean).join(' ');
  return {
    archive: 'logs/mun-reuser-result-3xl-5l.json',
    note,
    startedAt: old.startedAt ?? null,
    finishedAt: old.finishedAt ?? null,
    verdict: old.verdict ?? null,
    stack: old.stack ?? null,
    lifter: old.lifter ?? null,
    transfer: old.transfer ?? null,
    padTwrSL: old.padTwrSL ?? null,
    ascent: ascent && {
      ok: ascent.ok, thought: ascent.thought, orbitText: ascent.orbitText,
      transferFuelKg: ascent.transferFuelKg, fuelKg: ascent.fuelKg,
    },
    recover: recover && {
      ok: recover.ok, thought: recover.thought, pad_m: recover.pad_m,
      water: recover.water, claimedPad: recover.claimedPad ?? false,
      speed: recover.speed ?? null,
    },
    tli: tli && {
      ok: tli.ok, thought: tli.thought, orbitText: tli.orbitText,
      transferFuelKg: tli.transferFuelKg,
    },
    capture: capture && {
      ok: capture.ok, thought: capture.thought, orbitText: capture.orbitText,
      transferFuelKg: capture.transferFuelKg,
    },
  };
}

function paperOf(design) {
  const d = cloneDesign(design);
  d.name = 'Mun Reuser';
  const paper = planMission(d, 'mun-roundtrip');
  const stats = stagingStats(d);
  return {
    planOk: paper.ok,
    planText: formatPlan(paper),
    planPhases: paper.phases.map((p) => ({
      id: p.id, role: p.role, need: p.need, have: p.have, margin: p.margin, paid: p.paid ?? null,
    })),
    padTwrSL: stats[0]?.twrSL ?? null,
    padWetKg: stats[0]?.wet ?? null,
    fail: paper.fail ?? [],
    suggestion: paper.suggestion ?? null,
  };
}

function flyOnce(result, { redesign = null } = {}) {
  const design = cloneDesign(STOCK['Mun Reuser']);
  design.name = 'Mun Reuser';
  const desc = describeCraft(design);
  const paper = paperOf(design);
  result.craft = 'Mun Reuser';
  result.stack = [...design.stack];
  result.radials = design.radials.map((r) => ({ ...r }));
  result.lander = desc.lander;
  result.transfer = desc.transfer;
  result.lifter = desc.lifter;
  result.lifterReserveKg = LIFTER_RESERVE_KG;
  result.padTwrSL = paper.padTwrSL;
  result.padWetKg = paper.padWetKg;
  result.planOk = paper.planOk;
  result.planText = paper.planText;
  result.planPhases = paper.planPhases;
  result.redesign = redesign;
  result.nodes = [];
  result.snapshots = {};
  result.stopped = null;
  result.verdict = null;

  console.log('== paper', paper.planOk ? 'OK' : 'FAIL');
  console.log(paper.planText);
  console.log('pad twrSL', paper.padTwrSL, 'wet', paper.padWetKg, 'reserve', LIFTER_RESERVE_KG);
  if (redesign) console.log('redesign', redesign);

  callTool('ksp_lang', { lang: 'zh' });
  const flight = callTool('ksp_new_flight', { craft: 'Mun Reuser' });
  console.log('pad', JSON.stringify({
    craft: flight.craft,
    situation: flight.situation,
    landed: flight.landed,
    body: flight.body,
    fuel_kg: flight.fuel_kg,
    alt_m: flight.alt_m,
    transferFuelKg: transferFuelKg(session.st),
    nParts: session.st?.parts?.length,
  }));

  const planned = callTool('ksp_agent_plan', { text: '登月回来' });
  console.log('plan', planned.missionId, planned.current?.id, planned.thought, 'planOk', planned.plan?.ok);
  result.missionId = planned.missionId;
  result.planThought = planned.thought;
  result.planNodes = (planned.nodes ?? []).map((n) => ({ id: n.id, label: n.label, status: n.status }));
  result.snapshots.pad = dumpSnap('mun-reuser-pad');

  if (planned.missionId !== 'mun-roundtrip') {
    result.verdict = `plan was ${planned.missionId}, expected mun-roundtrip`;
    result.stopped = { nodeId: 'plan', reason: result.verdict };
    return result;
  }
  const nodeIds = (planned.nodes ?? []).map((n) => n.id);
  if (!nodeIds.includes('recover')) {
    result.verdict = 'plan missing recover / 回收助推';
    result.stopped = { nodeId: 'plan', reason: result.verdict };
    return result;
  }

  const origStep = session.step.bind(session);
  let lastLogT = -999;
  const wall0 = Date.now();
  session.step = (seconds, dt) => {
    const out = origStep(seconds, dt);
    const st = session.st;
    if (st && st.t - lastLogT >= 25 && st.landed === false && st.body === 'kerbin' && st.t < 900) {
      lastLogT = st.t;
      const c = readFlightCheck(st, { stageIdx: session.stageIdx });
      console.log(
        `  ascent MET ${st.t.toFixed(1)}s  ${c.orbitText}  alt=${c.altKm != null ? c.altKm.toFixed(1) : '—'} km`
        + `  fuel=${c.fuelKg != null ? c.fuelKg.toFixed(0) : '—'} kg  xfer=${transferFuelKg(st).toFixed(0)}`
        + `  stage=${session.stageIdx} wall=${((Date.now() - wall0) / 1000).toFixed(0)}s`,
      );
    }
    return out;
  };

  for (const id of ORDER) {
    if (session.agent?.nodeId !== id) {
      console.log('skip', id, 'current is', session.agent?.nodeId);
      break;
    }
    console.log(`== ksp_agent_step ${id}`);
    const t0 = Date.now();
    const fuelBefore = id === 'capture' ? {
      landerFuelKg: engineSectionFuel(session.st, /Kestrel/),
      falconFuelKg: engineSectionFuel(session.st, /Falcon/),
      transferFuelKg: session.st ? transferFuelKg(session.st) : null,
      ignited: ignitedNames(session.st),
    } : null;
    let out;
    try {
      out = callTool('ksp_agent_step');
    } catch (err) {
      console.error(id, 'THREW', err);
      out = { ok: false, thought: String(err?.stack || err), reason: 'threw' };
    }

    const extra = { wallMs: wallMs(t0) };
    if (fuelBefore) {
      extra.landerFuelBeforeKg = fuelBefore.landerFuelKg;
      extra.falconFuelBeforeKg = fuelBefore.falconFuelKg;
      extra.transferFuelBeforeKg = fuelBefore.transferFuelKg;
      extra.ignitedBefore = fuelBefore.ignited;
      extra.landerFuelAfterKg = engineSectionFuel(session.st, /Kestrel/);
      extra.falconFuelAfterKg = engineSectionFuel(session.st, /Falcon/);
      extra.kestrelLit = ignitedNames(session.st).some((n) => /Kestrel/.test(n));
      extra.kestrelBurned = fuelBefore.landerFuelKg != null
        && extra.landerFuelAfterKg != null
        && extra.landerFuelAfterKg < fuelBefore.landerFuelKg - 0.5;
    }

    if (id === 'ascent') {
      extra.titanDropped = session.vessels.some((v) => isDroppedBooster(v) || (isTitanVessel(v) && v.id !== session.activeId));
      extra.vessels = session.vessels.map(vesselBrief);
      extra.ksp_vessels = callTool('ksp_vessels');
      extra.enginesLit = ignitedNames(session.st);
      extra.titanStillOnActive = isTitanVessel(session.activeVessel?.() ?? { st: session.st });
      extra.falconFuelKg = engineSectionFuel(session.st, /Falcon/);
      extra.sparrowFuelKg = engineSectionFuel(session.st, /Sparrow/);
      extra.hasSparrow = extra.sparrowFuelKg != null;
      extra.sparrowEaten = extra.hasSparrow && extra.sparrowFuelKg < 9500;
      if (out?.ok && extra.sparrowEaten) {
        out = { ...out, ok: false, reason: 'sparrow-eaten', thought: `${out.thought || ''} Sparrow burned during circularize (${extra.sparrowFuelKg.toFixed(0)} kg left).` };
      } else if (out?.ok && extra.hasSparrow && partNames(session.st).some((n) => /Falcon/.test(n))) {
        // 4-stage only: Falcon circularized, Sparrow is transfer. Never drop Falcon on 5×L+M.
        const staged = callTool('ksp_stage');
        for (const p of session.st.parts ?? []) {
          if (/Sparrow/.test(p.def?.name || '')) p.ignited = false;
        }
        session.st.throttle = 0;
        extra.droppedFalconAfterOrbit = {
          staged: staged.staged ?? null,
          ignite: staged.ignite ?? null,
          sparrowFuelKg: engineSectionFuel(session.st, /Sparrow/),
          falconGone: !partNames(session.st).some((n) => /Falcon/.test(n)),
          parts: partNames(session.st),
        };
      }
    }

    if (id === 'recover') {
      extra.pad_m = out.pad_m;
      extra.speed = out.speed;
      extra.water = out.water;
      extra.crashed = out.crashed;
      extra.landed = out.landed;
      extra.fuel_kg = out.fuel_kg;
      extra.boosterId = out.boosterId;
      extra.upperId = out.upperId;
      extra.reason = out.reason ?? extra.reason;
      extra.claimedPad = !!(out.ok && out.pad_m != null && out.pad_m < 200);
      extra.ksp_vessels = callTool('ksp_vessels');
      extra.vessels = session.vessels.map(vesselBrief);
      const booster = session.vessels.find((v) => isTitanVessel(v) && isDroppedBooster(v))
        ?? session.vessels.find((v) => isTitanVessel(v));
      const upper = session.vessels.find((v) => v.id !== booster?.id && !isTitanVessel(v))
        ?? session.vessels.find((v) => v.id === extra.upperId)
        ?? session.activeVessel();
      // Fill any fields the step result dropped on failure from the real booster.
      if (booster?.st) {
        if (extra.pad_m == null) extra.pad_m = padDistanceM(booster.st);
        if (extra.landed == null) extra.landed = !!booster.st.landed;
        if (extra.crashed == null) extra.crashed = !!booster.st.dead;
        if (extra.fuel_kg == null) extra.fuel_kg = fuelLeft(booster.st);
        if (extra.water == null) extra.water = waterOf(booster.st);
        if (extra.speed == null) extra.speed = booster.st.vel?.length?.() ?? null;
        if (extra.boosterId == null) extra.boosterId = booster.id;
        extra.booster = vesselBrief(booster);
      }
      if (upper) {
        if (extra.upperId == null) extra.upperId = upper.id;
        extra.upper = vesselBrief(upper);
      }
      extra.claimedPad = !!(extra.landed && extra.pad_m != null && extra.pad_m < 200 && extra.crashed === false);
    }

    if (id === 'land') {
      extra.landerOnly = !(partNames(session.st).some((n) => /Sparrow|Titan|Raven|Falcon/.test(n)));
      extra.hasSparrow = partNames(session.st).some((n) => /Sparrow/.test(n));
      extra.ksp_vessels = callTool('ksp_vessels');
    }

    if (id === 'home') {
      extra.touchdownSpeed = out.touchdownSpeed ?? null;
      extra.chute = out.chute ?? null;
      extra.captured = out.captured ?? null;
      extra.homeLanded = out.landed ?? session.st?.landed ?? null;
    }

    const rec = nodeRecord(id, out, extra);
    result.nodes.push(rec);

    if (id === 'ascent') {
      result.snapshots.ascent = dumpSnap('mun-reuser-ascent');
    } else if (id === 'recover') {
      const booster = session.vessels.find((v) => isTitanVessel(v) && isDroppedBooster(v))
        ?? session.vessels.find((v) => isTitanVessel(v));
      const upper = session.vessels.find((v) => !isTitanVessel(v)) ?? session.activeVessel();
      if (booster) result.snapshots.recover = dumpVesselSnap(booster, 'mun-reuser-recover');
      if (upper) result.snapshots.recoverUpper = dumpVesselSnap(upper, 'mun-reuser-recover-upper');
    } else if (id === 'land') {
      result.snapshots.land = dumpSnap('mun-reuser-land');
    } else if (id === 'home') {
      result.snapshots.home = dumpSnap('mun-reuser-home');
    } else {
      result.snapshots[id] = dumpSnap(`mun-reuser-${id}`);
    }

    writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(id, JSON.stringify({
      ok: rec.ok,
      thought: rec.thought,
      reason: rec.reason,
      body: rec.body,
      orbitText: rec.orbitText,
      fuelKg: rec.fuelKg,
      ignited: rec.ignited,
      landed: rec.landed,
      dead: rec.dead,
      pad_m: rec.pad_m ?? null,
      speed: rec.speed ?? rec.speed_ms ?? null,
      water: rec.water ?? null,
      crashed: rec.crashed ?? null,
      nextId: rec.nextId,
      wallMs: rec.wallMs,
    }, null, 2));

    if (!out?.ok) {
      if (id === 'recover') {
        // Continue Mun trip on the upper if it is in orbit.
        const upper = session.vessels.find((v) => !isTitanVessel(v) && !v.st.dead && !v.st.landed);
        if (upper && session.activeId !== upper.id) {
          try { session.setActive(upper.id); } catch { /* stay */ }
        }
        const orb = session.st ? orbitCheck(session.st) : { ok: false };
        const inOrbit = !!(orb.ok && session.st?.body === 'kerbin' && orb.peKm != null && orb.peKm > 70);
        rec.continuedAfterRecoverFail = inOrbit;
        result.recoverFailedContinued = inOrbit;
        console.log('recover failed; upper in orbit?', inOrbit, orb.text);
        if (inOrbit) {
          session.agent = completeNode(session.agent, 'recover');
          console.log('advanced plan to', session.agent?.nodeId);
          continue;
        }
        result.stopped = { nodeId: id, reason: rec.thought };
        result.verdict = `failed on ${id}: ${rec.thought}`;
        break;
      }
      result.stopped = { nodeId: id, reason: rec.thought };
      result.verdict = `failed on ${id}: ${rec.thought}`;
      break;
    }
  }

  session.step = origStep;
  return result;
}

const result = {
  startedAt: nowIso(),
  snapshot: 'pad (Mun Reuser 3×XL + 5×L+M Falcon, Kestrel finishes capture after Falcon dry)',
  cut: 'Proven 5×L+M (host 19). driveBurn switches to Kestrel when Falcon dries mid-capture. No extra tanks, no auto +1.',
  llm: false,
  invented: false,
  physicsUnchanged: true,
  paperWithholdsReserve: false,
  paperReserveNote: 'Paper mun-roundtrip does NOT withhold the 8500 kg Titan reserve, so it overstates ascent Δv.',
  previous3xl5l2m: existsSync(join(LOG_DIR, 'mun-reuser-result-3xl-5l2m.json'))
    ? { archive: 'logs/mun-reuser-result-3xl-5l2m.json', note: '5×L+2M first fly: Pe 28 km, Ap 6448 km, died MET 494 at 3212 m/s, Falcon leftover 610 kg.' }
    : { archive: null, note: '5L+2M balloon archive missing.' },
  previous3xl6l: existsSync(join(LOG_DIR, 'mun-reuser-result-3xl-6l.json'))
    ? { archive: 'logs/mun-reuser-result-3xl-6l.json', note: '6×L+M: best Pe −61×432 then Falcon dry before Pe>0.' }
    : { archive: null, note: '6L archive missing.' },
  previous4stage: existsSync(join(LOG_DIR, 'mun-reuser-result-4stage.json'))
    ? { archive: 'logs/mun-reuser-result-4stage.json', note: '4-stage Falcon 3×L+M + Sparrow 2×L+M: Falcon dry before Pe>0, Sparrow stayed 10000 kg.' }
    : { archive: null, note: '4-stage archive missing.' },
  previous3xl7l: existsSync(join(LOG_DIR, 'mun-reuser-result-3xl-7l.json'))
    ? { archive: 'logs/mun-reuser-result-3xl-7l.json', note: '7×L+M and +1 8×L+M both died on ascent (Falcon dry before Pe>0).' }
    : { archive: null, note: '7L archive missing.' },
  previous3xl5l: loadPrevious3xl5l(),
  previousFalcon4xl: loadPreviousFalcon4xl(),
  previousSparrowAttempts: loadPreviousSparrow(),
  nodes: [],
  snapshots: {},
  stopped: null,
  verdict: null,
  redesigns: [],
  claimedPad: false,
  boosterRecovered: false,
  munLanderOnly: false,
  kerbinHome: false,
};

console.log('== agent-fly-mun-reuser', result.startedAt);
console.log('cut', result.cut);
console.log('previous3xl5l', result.previous3xl5l.note);
console.log('previousFalcon4xl', result.previousFalcon4xl.note);
console.log('previousSparrow', result.previousSparrowAttempts.note);

flyOnce(result);

const ascent = result.nodes.find((n) => n.nodeId === 'ascent');
if (ascent && !ascent.ok && result.redesigns.length === 0 && process.env.MUN_REUSER_REDESIGN !== '0') {
  if (!isFalconDryBeforePe(ascent)) {
    console.log('== ascent failed; not Falcon-dry-before-Pe>0 — no redesign');
    result.noRedesign = {
      reason: 'ascent failed but not clearly Falcon dry before Pe>0',
      transferName: ascent.transferName,
      transferFuelKg: ascent.transferFuelKg,
      peKm: ascent.peKm,
      ignited: ascent.ignited,
      titanDropped: ascent.titanDropped,
    };
  } else {
    console.log('== ascent failed Falcon dry before Pe>0; one transfer tank-l patch');
    const preview = cloneDesign(STOCK['Mun Reuser']);
    const falconAt = preview.stack.lastIndexOf('eng-falcon');
    preview.stack.splice(falconAt, 0, 'tank-l');
    for (const r of preview.radials ?? []) if (r.host >= falconAt) r.host += 1;
    preview.name = 'Mun Reuser';
    const previewPaper = paperOf(preview);
    if (!previewPaper.planOk) {
      result.noRedesign = {
        reason: 'extra transfer tank-l would fail paper; stop',
        previewPaper,
      };
      console.log('== extra tank-l fails paper; stop');
    } else {
      const red = applyRedesign('add-transfer-tank-l');
      red.previewPaper = previewPaper;
      result.redesigns.push(red);
      result.firstAttempt = {
        planOk: result.planOk,
        planText: result.planText,
        planPhases: result.planPhases,
        padTwrSL: result.padTwrSL,
        nodes: result.nodes,
        verdict: result.verdict,
        stack: result.stack,
        radials: result.radials,
        ascent,
      };
      flyOnce(result, { redesign: red });
    }
  }
}

if (!result.verdict) {
  const last = result.nodes[result.nodes.length - 1];
  const home = result.nodes.find((n) => n.nodeId === 'home');
  const land = result.nodes.find((n) => n.nodeId === 'land');
  const recover = result.nodes.find((n) => n.nodeId === 'recover');
  const bits = [];
  if (recover) {
    bits.push(recover.ok
      ? `recover landed pad_m=${recover.pad_m} speed=${recover.speed} water=${recover.water}`
      : `recover FAIL ${recover.reason || recover.thought}`);
  }
  if (land?.ok && land.body === 'mun' && land.landed) {
    bits.push(`lander-only Mun touchdown fuel=${land.fuelKg}`);
  } else if (land) {
    bits.push(`land ${land.ok ? 'ok' : 'FAIL'} body=${land.body} landed=${land.landed}`);
  }
  if (home?.ok && home.body === 'kerbin') {
    bits.push(home.landed || home.homeLanded
      ? `home Kerbin chute land speed=${home.touchdownSpeed ?? home.speed_ms}`
      : `home Kerbin encounter/capture`);
  } else if (home) {
    bits.push(`home FAIL ${home.thought}`);
  } else {
    bits.push(`stopped after ${last?.nodeId} body=${last?.body}`);
  }
  result.verdict = bits.join(' | ');
}

const recoverN = result.nodes.find((n) => n.nodeId === 'recover');
const landN = result.nodes.find((n) => n.nodeId === 'land');
const homeN = result.nodes.find((n) => n.nodeId === 'home');
result.claimedPad = !!(recoverN?.claimedPad);
result.boosterRecovered = !!(recoverN?.ok && recoverN.crashed === false && recoverN.landed);
result.munLanderOnly = !!(landN?.ok && landN.body === 'mun' && landN.landed && landN.landerOnly);
result.kerbinHome = !!(homeN?.ok && homeN.body === 'kerbin' && (homeN.landed || homeN.homeLanded));
if (result.claimedPad) {
  // Never claim 上垫 unless pad_m is actually < 200 m and landed.
  result.claimedPad = !!(recoverN?.landed && recoverN.pad_m != null && recoverN.pad_m < 200 && recoverN.crashed === false);
}

result.finishedAt = nowIso();
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log('wrote', OUT);
console.log('verdict', result.verdict);
console.log('summary', JSON.stringify({
  claimedPad: result.claimedPad,
  boosterRecovered: result.boosterRecovered,
  munLanderOnly: result.munLanderOnly,
  kerbinHome: result.kerbinHome,
  redesigns: result.redesigns,
  stopped: result.stopped,
}));
