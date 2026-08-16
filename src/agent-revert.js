// Revert to a finished node's flight snapshot.
// Apply uses flight.applySnapshot — the same path as save load. No third format.

import { createState, pushThought, revertNode } from './agent-plan.js';

function loc(lang) {
  return lang === 'en' ? 'en' : 'zh';
}

function fmtFuel(kg) {
  if (kg == null || !Number.isFinite(kg)) return '—';
  return `${Math.round(kg)} kg`;
}

function fmtOrbit(check) {
  return check?.orbitText && check.orbitText !== '—' ? check.orbitText : '—';
}

/** Formats the check it is given. Missing orbit/fuel become — ; does not invent numbers. */
export function revertThought(label, check, lang) {
  const en = loc(lang) === 'en';
  const fuel = fmtFuel(check?.fuelKg);
  const orbit = fmtOrbit(check);
  const name = label || (en ? 'node' : '结点');
  return en
    ? `Back to ${name}. Orbit ${orbit}, fuel ${fuel}.`
    : `回到 ${name}。轨道 ${orbit}，剩油 ${fuel}。`;
}

export function refuseRevertThought(reason, lang) {
  const en = loc(lang) === 'en';
  if (reason === 'running') return en ? 'This cut is still flying.' : '这一刀还在飞。';
  if (reason === 'no-flight') return en ? 'Not in flight. Cannot revert.' : '不在飞行中，没法回退。';
  if (reason === 'apply-failed') return en ? 'Could not apply this snapshot.' : '没法套回这份快照。';
  return en ? 'This cut has no snapshot.' : '这一刀没有快照';
}

export function lastFinishedWithSnapshot(state) {
  const snaps = state?.snapshots ?? {};
  const nodes = state?.nodes ?? [];
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.status === 'done' && snaps[n.id]) return n;
  }
  return null;
}

export function canRevert(state, nodeId) {
  if (state?.running) return { ok: false, reason: 'running' };
  const snaps = state?.snapshots ?? {};
  const nodes = state?.nodes ?? [];
  if (nodeId == null || nodeId === '') {
    const n = lastFinishedWithSnapshot(state);
    if (!n) return { ok: false, reason: 'no-snapshot' };
    return { ok: true, node: n, snapshot: snaps[n.id] };
  }
  const id = String(nodeId);
  const n = nodes.find((x) => x.id === id);
  if (!n || n.status !== 'done') return { ok: false, reason: 'no-snapshot' };
  if (!snaps[id]) return { ok: false, reason: 'no-snapshot' };
  return { ok: true, node: n, snapshot: snaps[id] };
}

function runRevert(state, nodeId, ctx = {}) {
  const lang = loc(ctx.lang);
  const gate = canRevert(state, nodeId);
  if (!gate.ok) {
    const thought = refuseRevertThought(gate.reason, lang);
    return {
      ok: false,
      reason: gate.reason,
      thought,
      state: pushThought(state, thought),
    };
  }
  if (typeof ctx.applySnapshot !== 'function') {
    const thought = refuseRevertThought('no-flight', lang);
    return {
      ok: false,
      reason: 'no-flight',
      nodeId: gate.node.id,
      thought,
      state: pushThought(state, thought),
    };
  }
  let applied = false;
  try {
    applied = !!ctx.applySnapshot(gate.snapshot);
  } catch {
    applied = false;
  }
  if (!applied) {
    const thought = refuseRevertThought('apply-failed', lang);
    return {
      ok: false,
      reason: 'apply-failed',
      nodeId: gate.node.id,
      thought,
      state: pushThought(state, thought),
    };
  }
  const check = typeof ctx.readCheck === 'function' ? ctx.readCheck() : (ctx.check ?? null);
  const thought = revertThought(gate.node.label, check, lang);
  const next = createState({ ...revertNode(state, gate.node.id), running: false });
  return {
    ok: true,
    nodeId: gate.node.id,
    thought,
    snapshot: gate.snapshot,
    state: pushThought(next, thought),
  };
}

export function revertTo(state, nodeId, ctx = {}) {
  return runRevert(state, nodeId, ctx);
}

export function revertPrev(state, ctx = {}) {
  return runRevert(state, null, ctx);
}
