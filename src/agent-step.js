// One-node step runner. Pure state machine + thought strings. No LLM.
// Muscles live in agent-muscles.js; the UI supplies a flight executor.

import { pushThought, completeNode, createState } from './agent-plan.js';
import { captureFlightSnapshot } from './agent-muscles.js';

export const REAL_NODES = new Set(['ascent', 'recover', 'window', 'coast', 'jettison', 'escape', 'tli', 'capture', 'land', 'rise', 'home']);
export const STUB_NODES = new Set();

export function muscleKind(nodeId) {
  if (REAL_NODES.has(nodeId)) return 'real';
  return 'stub';
}

export function currentNode(state) {
  const nodes = state?.nodes ?? [];
  if (state?.nodeId) {
    const n = nodes.find((x) => x.id === state.nodeId);
    if (n) return n;
  }
  return nodes.find((n) => n.status === 'current') ?? null;
}

export function canStep(state) {
  if (!state || !Array.isArray(state.nodes) || state.nodes.length === 0) {
    return { ok: false, reason: 'no-plan' };
  }
  if (state.running) return { ok: false, reason: 'running' };
  if (state.nodes.every((n) => n.status === 'done')) return { ok: false, reason: 'finished' };
  const cur = currentNode(state);
  if (!cur) return { ok: false, reason: 'finished' };
  if (cur.status === 'done') return { ok: false, reason: 'finished' };
  return { ok: true, node: cur };
}

function loc(lang) {
  return lang === 'en' ? 'en' : 'zh';
}

export function refuseThought(reason, lang) {
  const en = loc(lang) === 'en';
  if (reason === 'no-plan') return en ? 'No plan. Write a goal and plan first.' : '没有计划。先写目标再规划。';
  if (reason === 'finished') return en ? 'Plan finished.' : '计划走完了。';
  if (reason === 'running') return en ? 'This cut is still flying.' : '这一刀还在飞。';
  if (reason === 'no-flight') return en ? 'Not in flight. Cannot take this cut.' : '不在飞行中，没法走这一刀。';
  return en ? `Cannot step (${reason}).` : `没法走这一刀（${reason}）。`;
}

export function stubThought(label, lang) {
  return loc(lang) === 'en'
    ? `No muscle for this cut yet: ${label}`
    : `这刀还没肌肉：${label}`;
}

export function flyingThought(label, lang) {
  return loc(lang) === 'en' ? `Flying: ${label}` : `正在飞：${label}`;
}

function fmtFuel(kg) {
  if (kg == null || !Number.isFinite(kg)) return '—';
  return `${Math.round(kg)} kg`;
}

function fmtOrbit(check) {
  return check?.orbitText && check.orbitText !== '—' ? check.orbitText : '—';
}

export function thoughtFromCheck(kind, check, extra, lang) {
  const en = loc(lang) === 'en';
  const fuel = fmtFuel(check?.fuelKg);
  const orbit = fmtOrbit(check);
  const stage = check?.stageIdx != null ? String(check.stageIdx) : '—';
  if (kind === 'ascent-ok') {
    return en
      ? `Insertion done. Orbit ${orbit}, fuel ${fuel}, stage ${stage}.`
      : `入轨完成。轨道 ${orbit}，剩油 ${fuel}，级 ${stage}。`;
  }
  if (kind === 'ascent-fail') {
    const pe = check?.peKm != null ? `${check.peKm.toFixed(0)} km` : '—';
    if (check?.dead) {
      return en
        ? `Insertion failed: vessel dead. Fuel ${fuel}.`
        : `入轨失败：船毁了。剩油 ${fuel}。`;
    }
    return en
      ? `Insertion failed: Pe ${pe}. Fuel ${fuel}.`
      : `入轨失败：近拱点 ${pe}。剩油 ${fuel}。`;
  }
  if (kind === 'window-ok') {
    const now = extra?.nowDeg != null ? extra.nowDeg.toFixed(1) : '—';
    const tgt = extra?.targetDeg != null ? extra.targetDeg.toFixed(1) : '—';
    return en
      ? `Window reached. Phase ${now}° (target ${tgt}°). Fuel ${fuel}.`
      : `窗口到了。相位 ${now}°（目标 ${tgt}°）。剩油 ${fuel}。`;
  }
  if (kind === 'window-fail') {
    const pe = check?.peKm != null ? `${check.peKm.toFixed(0)} km` : '—';
    return en
      ? `Not in orbit, cannot wait for a window. Pe ${pe}.`
      : `还没入轨，没法等窗口。近拱点 ${pe}。`;
  }
  if (kind === 'coast-ok') {
    const body = check?.body || extra?.bodyTo || '—';
    return en
      ? `Coasted to ${body}. Orbit ${orbit}, fuel ${fuel}.`
      : `滑行到 ${body}。轨道 ${orbit}，剩油 ${fuel}。`;
  }
  if (kind === 'coast-fail') {
    if (extra?.reason && extra.reason !== 'in-atmo') {
      const body = check?.body || extra?.bodyTo || '—';
      const ca = extra?.ca0_m != null && Number.isFinite(extra.ca0_m)
        ? (extra.ca0_m / 1000).toFixed(0) + ' km'
        : null;
      return en
        ? `Coast failed (${extra.reason}). Body ${body}${ca ? `, CA ${ca}` : ''}. Orbit ${orbit}, fuel ${fuel}.`
        : `滑行失败（${extra.reason}）。在 ${body}${ca ? `，最近 ${ca}` : ''}。轨道 ${orbit}，剩油 ${fuel}。`;
    }
    return en
      ? `Still in atmosphere, cannot coast. Alt ${check?.altKm != null ? check.altKm.toFixed(1) : '—'} km.`
      : `还在大气里，不能滑行。高度 ${check?.altKm != null ? check.altKm.toFixed(1) : '—'} km。`;
  }
  if (kind === 'jettison-ok') {
    const parts = (check?.parts ?? []).slice(0, 6).join('、') || (en ? 'lander' : '着陆器');
    if (extra?.already) {
      return en
        ? `Already the lander (${parts}). Fuel ${fuel}.`
        : `已经是着陆器（${parts}）。剩油 ${fuel}。`;
    }
    const dropped = (extra?.dropped ?? []).join('、');
    return en
      ? `Dropped transfer${dropped ? ` (${dropped})` : ''}. Left ${parts}. Fuel ${fuel}.`
      : `丢掉转移级${dropped ? `（${dropped}）` : ''}。还剩 ${parts}。剩油 ${fuel}。`;
  }
  if (kind === 'jettison-fail') {
    return en
      ? `Drop transfer failed: no lander engine. Fuel ${fuel}.`
      : `丢掉转移级失败：没有着陆器发动机。剩油 ${fuel}。`;
  }
  if (kind === 'escape-ok' || kind === 'tli-ok') {
    const body = check?.body || extra?.dest || '—';
    const vinf = extra?.vInf != null ? extra.vInf.toFixed(0) : null;
    const tgt = extra?.vInfTarget != null ? extra.vInfTarget.toFixed(0) : null;
    const vBit = vinf
      ? (tgt ? (en ? `, v∞ ${vinf} (tgt ${tgt})` : `，v∞ ${vinf}（目标 ${tgt}）`)
        : (en ? `, v∞ ${vinf}` : `，v∞ ${vinf}`))
      : '';
    return en
      ? `${kind === 'tli-ok' ? 'TLI' : 'Escape'} done. Body ${body}${vBit}. Orbit ${orbit}, fuel ${fuel}.`
      : `${kind === 'tli-ok' ? 'TLI' : '逃逸'}完成。在 ${body}${vBit}。轨道 ${orbit}，剩油 ${fuel}。`;
  }
  if (kind === 'escape-fail' || kind === 'tli-fail') {
    const why = extra?.reason || 'fail';
    const xfer = extra?.transferFuelKg != null ? `${Math.round(extra.transferFuelKg)} kg` : null;
    const vinf = extra?.vInf != null ? extra.vInf.toFixed(0) : null;
    const tgt = extra?.vInfTarget != null ? extra.vInfTarget.toFixed(0) : null;
    const vBit = vinf
      ? (tgt ? (en ? ` v∞ ${vinf} (tgt ${tgt}).` : ` v∞ ${vinf}（目标 ${tgt}）。`)
        : (en ? ` v∞ ${vinf}.` : ` v∞ ${vinf}。`))
      : '';
    return en
      ? `${kind === 'tli-fail' ? 'TLI' : 'Escape'} failed (${why}).${vBit}${xfer ? ` Transfer ${xfer}.` : ''} Orbit ${orbit}, fuel ${fuel}.`
      : `${kind === 'tli-fail' ? 'TLI' : '逃逸'}失败（${why}）。${vBit}${xfer ? `转移级 ${xfer}。` : ''}轨道 ${orbit}，剩油 ${fuel}。`;
  }
  if (kind === 'capture-ok') {
    const body = check?.body || extra?.dest || '—';
    return en
      ? `Captured at ${body}. Orbit ${orbit}, fuel ${fuel}.`
      : `捕获到 ${body}。轨道 ${orbit}，剩油 ${fuel}。`;
  }
  if (kind === 'capture-fail') {
    const why = extra?.reason || 'fail';
    const xfer = extra?.transferFuelKg != null ? `${Math.round(extra.transferFuelKg)} kg` : null;
    return en
      ? `Capture failed (${why}).${xfer ? ` Transfer ${xfer}.` : ''} Orbit ${orbit}, fuel ${fuel}.`
      : `捕获失败（${why}）。${xfer ? `转移级 ${xfer}。` : ''}轨道 ${orbit}，剩油 ${fuel}。`;
  }
  if (kind === 'land-ok') {
    const body = check?.body || extra?.dest || '—';
    return en
      ? `Landed on ${body}. Fuel ${fuel}.`
      : `落到 ${body}。剩油 ${fuel}。`;
  }
  if (kind === 'land-fail') {
    const why = extra?.reason || 'fail';
    return en
      ? `Landing failed (${why}). Orbit ${orbit}, fuel ${fuel}.`
      : `着陆失败（${why}）。轨道 ${orbit}，剩油 ${fuel}。`;
  }
  if (kind === 'rise-ok') {
    return en
      ? `Ascent done. Orbit ${orbit}, fuel ${fuel}.`
      : `上升入轨。轨道 ${orbit}，剩油 ${fuel}。`;
  }
  if (kind === 'rise-fail') {
    const pe = check?.peKm != null ? `${check.peKm.toFixed(0)} km` : '—';
    const ap = check?.apKm != null && Number.isFinite(check.apKm) ? `${check.apKm.toFixed(0)} km` : '—';
    return en
      ? `Ascent failed: Pe ${pe} × Ap ${ap}. Fuel ${fuel}.`
      : `上升失败：近拱点 ${pe} × 远拱点 ${ap}。剩油 ${fuel}。`;
  }
  if (kind === 'home-ok') {
    if (check?.landed && check?.body === 'kerbin') {
      const spd = extra?.touchdownSpeed;
      const spdBit = Number.isFinite(spd)
        ? (en ? ` Touchdown ${spd.toFixed(2)} m/s.` : `触地 ${spd.toFixed(2)} m/s。`)
        : '';
      return en
        ? `Home: landed on Kerbin.${spdBit} Fuel ${fuel}.`
        : `回家：落到 Kerbin。${spdBit}剩油 ${fuel}。`;
    }
    const body = check?.body || '—';
    return en
      ? `Home: Kerbin ${extra?.captured ? 'capture' : 'encounter'} (${body}). Orbit ${orbit}, fuel ${fuel}.`
      : `回家：Kerbin ${extra?.captured ? '捕获' : '相遇'}（${body}）。轨道 ${orbit}，剩油 ${fuel}。`;
  }
  if (kind === 'home-fail') {
    const why = extra?.reason || 'fail';
    const body = check?.body || extra?.body || '—';
    return en
      ? `Home failed (${why}). Body ${body}. Orbit ${orbit}, fuel ${fuel}.`
      : `回家失败（${why}）。在 ${body}。轨道 ${orbit}，剩油 ${fuel}。`;
  }
  if (kind === 'recover-ok') {
    const pad = extra?.pad_m;
    const spd = extra?.speed;
    const fuel = extra?.fuel_kg;
    const padBit = Number.isFinite(pad)
      ? (en ? `${(pad / 1000).toFixed(2)} km from pad` : `离垫 ${(pad / 1000).toFixed(2)} km`)
      : null;
    const spdBit = Number.isFinite(spd)
      ? (en ? `touchdown ${spd.toFixed(2)} m/s` : `触地 ${spd.toFixed(2)} m/s`)
      : null;
    const fuelBit = Number.isFinite(fuel)
      ? (en ? `fuel ${Math.round(fuel)} kg` : `剩油 ${Math.round(fuel)} kg`)
      : null;
    const waterBit = extra?.water ? (en ? 'water' : '下水') : null;
    const more = [waterBit, fuelBit].filter(Boolean);
    if (padBit && spdBit) {
      const extraBit = more.length
        ? (en ? ` ${more.join(', ')}.` : `${more.join('，')}。`)
        : '';
      if (extra?.already) {
        return en
          ? `Booster already down. ${padBit}, ${spdBit}.${extraBit}`
          : `助推已经落地。${padBit}，${spdBit}。${extraBit}`;
      }
      return en
        ? `Booster ${padBit}, ${spdBit}.${extraBit}`
        : `助推${padBit}，${spdBit}。${extraBit}`;
    }
    const bits = [padBit, spdBit, waterBit, fuelBit].filter(Boolean);
    const tail = bits.length
      ? (en ? ` ${bits.join(', ')}.` : `${bits.join('，')}。`)
      : (en ? '.' : '。');
    if (extra?.already) {
      return en ? `Booster already down.${tail}` : `助推已经落地。${tail}`;
    }
    return en ? `Booster recovered.${tail}` : `助推回收。${tail}`;
  }
  if (kind === 'recover-fail') {
    const why = extra?.reason || 'fail';
    if (why === 'no-booster') {
      return en ? 'No dropped booster to recover.' : '没有扔下的助推，没法回收。';
    }
    const pad = extra?.pad_m;
    const spd = extra?.speed;
    const padBit = Number.isFinite(pad)
      ? (en ? ` ${(pad / 1000).toFixed(2)} km from pad.` : `离垫 ${(pad / 1000).toFixed(2)} km。`)
      : '';
    const spdBit = Number.isFinite(spd)
      ? (en ? ` Touchdown ${spd.toFixed(2)} m/s.` : `触地 ${spd.toFixed(2)} m/s。`)
      : '';
    return en
      ? `Booster recovery failed (${why}).${padBit}${spdBit}`
      : `助推回收失败（${why}）。${padBit}${spdBit}`;
  }
  return en ? 'Step finished.' : '这一刀结束。';
}


export function applyStepSuccess(state, { nodeId, thought, snapshot } = {}) {
  let next = completeNode(state, nodeId);
  const snapshots = { ...(next.snapshots ?? {}) };
  if (snapshot) snapshots[nodeId] = snapshot;
  next = createState({ ...next, snapshots, running: false });
  return pushThought(next, thought);
}

export function applyStepFailure(state, { thought } = {}) {
  const next = createState({ ...state, running: false });
  return pushThought(next, thought);
}

export function markRunning(state, thought) {
  const next = createState({ ...state, running: true });
  return thought ? pushThought(next, thought) : next;
}

/**
 * Sync runner. `ctx.muscle(nodeId, state)` returns
 * `{ ok, thought, snapshot?, stub? }` or a thenable of that.
 * Does not mutate `design`.
 */
export function runStep(state, ctx = {}) {
  const lang = loc(ctx.lang);
  const gate = canStep(state);
  if (!gate.ok) {
    const thought = refuseThought(gate.reason, lang);
    return { ok: false, reason: gate.reason, thought, state: pushThought(state, thought) };
  }
  const node = gate.node;
  if (muscleKind(node.id) === 'stub') {
    const thought = stubThought(node.label, lang);
    return { ok: false, stub: true, nodeId: node.id, thought, state: pushThought(state, thought) };
  }
  if (typeof ctx.muscle !== 'function') {
    const thought = refuseThought('no-flight', lang);
    return { ok: false, reason: 'no-flight', nodeId: node.id, thought, state: pushThought(state, thought) };
  }
  const out = ctx.muscle(node.id, state);
  if (out && typeof out.then === 'function') {
    return out.then((res) => finishMuscle(state, node, res));
  }
  return finishMuscle(state, node, out);
}

function finishMuscle(state, node, out) {
  if (out?.ok) {
    const next = applyStepSuccess(state, {
      nodeId: node.id,
      thought: out.thought,
      snapshot: out.snapshot ?? null,
    });
    return {
      ok: true,
      nodeId: node.id,
      nextId: next.nodeId,
      thought: out.thought,
      snapshot: out.snapshot ?? null,
      state: next,
      captured: out.captured,
      landed: out.landed,
      touchdownSpeed: out.touchdownSpeed,
      chute: out.chute,
      captureCheck: out.captureCheck,
      reason: out.reason,
      pad_m: out.pad_m,
      speed: out.speed,
      water: out.water,
      crashed: out.crashed,
      fuel_kg: out.fuel_kg,
      boosterId: out.boosterId,
      upperId: out.upperId,
    };
  }
  const thought = out?.thought || stubThought(node.label);
  const next = applyStepFailure(state, { thought });
  return {
    ok: false,
    stub: !!out?.stub,
    nodeId: node.id,
    thought,
    state: next,
  };
}

export function snapshotFromFlight(flight, nodeId) {
  if (!flight?.st) return null;
  return captureFlightSnapshot(flight.st, {
    tag: `agent-${nodeId}`,
    craft: flight.design?.name ?? flight.st.craft ?? null,
  });
}
