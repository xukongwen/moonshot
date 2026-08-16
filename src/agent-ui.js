// In-game agent panel: state + DOM render. No planner LLM.
// A2: input → applyGoal (deterministic mapper + planMission).

import { t, getLang, onLangChange } from './i18n.js';
import {
  createState, setState as patchState, pushThought as pushThoughtState,
  setNode as setNodeState, toggle as toggleState, demoPlan, isDemoGoal,
  getPendingGoal, setPendingGoal,
} from './agent-plan.js';
import { applyGoal } from './agent-goal.js';
import {
  canStep, runStep, markRunning, flyingThought, refuseThought, muscleKind,
} from './agent-step.js';
import { canRevert, revertTo } from './agent-revert.js';
import { runBrowserMuscle, attachSnapshot } from './agent-run.js';
import { readFlightCheck } from './agent-muscles.js';
import { runChecks } from './agent-check.js';

const $ = (id) => (typeof document === 'undefined' ? null : document.getElementById(id));

let state = createState({ open: true, goal: '' });
let stepGen = 0;

function cancelFlightPilot() {
  const flight = typeof globalThis !== 'undefined' ? globalThis.__moonshot?.flight : null;
  if (typeof flight?.pilotCancel === 'function') flight.pilotCancel();
}

export function getState() {
  return {
    ...state,
    nodes: state.nodes.map((n) => ({ ...n })),
    thoughts: [...state.thoughts],
    snapshots: { ...state.snapshots },
    running: !!state.running,
  };
}

export function setState(patch) {
  state = patchState(state, patch);
  render();
  return getState();
}

export function pushThought(text) {
  state = pushThoughtState(state, text);
  render();
  return getState();
}

export function setNode(id, status) {
  state = setNodeState(state, id, status);
  render();
  return getState();
}

export function toggle(force) {
  state = toggleState(state, force);
  render();
  return getState();
}

function currentDesign() {
  const ms = typeof globalThis !== 'undefined' ? globalThis.__moonshot : null;
  if (ms?.flight?.active && ms.flight.design?.stack?.length) return ms.flight.design;
  if (ms?.vab?.design?.stack?.length) return ms.vab.design;
  return null;
}

function syncGoalInputs(text) {
  if (typeof document === 'undefined') return;
  for (const id of ['agent-goal-input', 'vab-agent-goal']) {
    const el = $(id);
    if (el && el !== document.activeElement) el.value = text ?? '';
  }
  const vabThought = $('vab-agent-thought');
  if (vabThought) vabThought.textContent = state.thought || '';
}

function applyResult(result, raw) {
  stepGen += 1;
  cancelFlightPilot();
  const nodes = (result.nodes ?? []).map((n, i) => ({
    ...n,
    status: n.status || (i === 0 ? 'current' : 'pending'),
  }));
  state = pushThoughtState(createState({
    ...state,
    open: true,
    goal: result.goal || raw,
    nodes,
    nodeId: nodes[0]?.id ?? null,
    missionId: result.missionId,
    running: false,
    snapshots: {},
    plan: result.plan ?? null,
  }), result.thought);
  render();
  syncGoalInputs(result.goal || raw);
  return result;
}

/** Plan from a coarse goal. Stores pendingGoal so flight start uses it instead of the demo. */
export function plan(text) {
  const raw = String(text ?? '').trim();
  setPendingGoal(raw);
  const result = applyGoal(raw, currentDesign());
  return applyResult(result, raw);
}

export function loadDemoIfEmpty() {
  const pending = getPendingGoal();
  if (pending) {
    const result = applyGoal(pending, currentDesign());
    applyResult(result, pending);
    return getState();
  }
  if (!state.goal) state = demoPlan(getLang());
  render();
  return getState();
}

export function render() {
  const panel = $('agent-panel');
  if (!panel) return;
  panel.classList.toggle('hidden', !state.open);
  const goal = $('agent-goal-text');
  if (goal) goal.textContent = state.goal || '—';
  const nodeEl = $('agent-node-text');
  if (nodeEl) {
    const cur = state.nodes.find((n) => n.id === state.nodeId) || state.nodes.find((n) => n.status === 'current');
    nodeEl.textContent = cur ? cur.label : (state.nodeId || '—');
  }
  const list = $('agent-plan-list');
  if (list) {
    list.replaceChildren();
    state.nodes.forEach((n, i) => {
      const row = document.createElement('div');
      row.className = `agent-step ${n.status}`;
      row.dataset.id = n.id;
      if (n.status === 'done') {
        row.classList.add('clickable');
        if (state.snapshots?.[n.id]) row.classList.add('has-snap');
        row.addEventListener('click', () => { revert(n.id); });
      }
      const num = document.createElement('span');
      num.className = 'n';
      num.textContent = String(i + 1).padStart(2, '0');
      const lab = document.createElement('span');
      lab.className = 'lab';
      lab.textContent = n.label;
      row.append(num, '  ', lab);
      list.appendChild(row);
    });
  }
  const th = $('agent-thought');
  if (th) th.textContent = state.thought || '';
  const log = $('agent-thoughts');
  if (log) {
    const older = state.thoughts.filter((x) => x !== state.thought).slice(-4);
    log.textContent = older.join('\n');
  }
  const vabThought = $('vab-agent-thought');
  if (vabThought && document.activeElement?.id !== 'vab-agent-goal') {
    vabThought.textContent = state.thought || '';
  }
  const stepBtn = $('btn-agent-step');
  if (stepBtn) stepBtn.disabled = !canStep(state).ok;
  const revertBtn = $('btn-agent-revert');
  if (revertBtn) revertBtn.disabled = !canRevert(state).ok;
}

function getFlight() {
  return (typeof globalThis !== 'undefined' ? globalThis.__moonshot?.flight : null) ?? null;
}

function flightCheckOf(flight) {
  if (!flight?.st) return null;
  return readFlightCheck(flight.st, { stageIdx: flight.stageIndex ?? 0 });
}

function applyCheckThoughts(when, extra = {}) {
  const flight = getFlight();
  const result = runChecks({
    check: extra.check ?? flightCheckOf(flight),
    design: extra.design ?? currentDesign(),
    parts: extra.parts ?? flight?.st?.parts ?? null,
    state,
    plan: extra.plan ?? state.plan,
    lang: extra.lang || getLang(),
    when,
  });
  for (const th of result.thoughts) {
    if (th && th !== state.thought) state = pushThoughtState(state, th);
  }
  return result;
}

/** Re-run the A5 checker and write thoughts. Uses live flight/design when present. */
export function check(opts = {}) {
  const result = applyCheckThoughts(opts.when || 'inspect', opts);
  render();
  return {
    thoughts: result.thoughts,
    thought: state.thought,
    flags: result.flags,
    transferFuelKg: result.transferFuelKg,
    landerFuelKg: result.landerFuelKg,
    currentId: result.currentId,
    nextId: result.nextId,
  };
}

/** One node, then stop. Same path as the panel button. */
export function step() {
  const gate = canStep(state);
  if (!gate.ok) {
    const thought = refuseThought(gate.reason, getLang());
    state = pushThoughtState(state, thought);
    render();
    return Promise.resolve({ ok: false, reason: gate.reason, thought });
  }
  const flight = getFlight();
  const node = gate.node;
  const lang = getLang();
  applyCheckThoughts('pre-step', { lang });
  const gen = ++stepGen;
  if (muscleKind(node.id) === 'real') {
    state = markRunning(state, flyingThought(node.label, lang));
    render();
  }

  const muscle = (id) => {
    return runBrowserMuscle(id, flight, { missionId: state.missionId, lang, state })
      .then((out) => attachSnapshot(out, flight, id));
  };

  return Promise.resolve(runStep(createState({ ...state, running: false }), { lang, muscle }))
    .then((res) => {
      if (gen !== stepGen) return { ok: false, reason: 'superseded', thought: state.thought };
      state = res.state;
      applyCheckThoughts('post-step', { lang });
      render();
      return {
        ok: res.ok,
        stub: !!res.stub,
        reason: res.reason,
        nodeId: res.nodeId ?? node.id,
        nextId: res.nextId ?? state.nodeId,
        thought: res.thought,
        snapshot: res.snapshot ?? null,
      };
    })
    .catch((err) => {
      const thought = refuseThought('no-flight', lang) + (err?.message ? ` ${err.message}` : '');
      state = pushThoughtState(createState({ ...state, running: false }), thought);
      render();
      return { ok: false, nodeId: node.id, thought };
    });
}

/** Revert to a finished node (no arg = previous finished node with a snapshot). */
export function revert(nodeId) {
  const lang = getLang();
  const flight = getFlight();
  const gate = canRevert(state, nodeId);
  if (gate.ok) {
    stepGen += 1;
    cancelFlightPilot();
  }
  const result = revertTo(state, nodeId, {
    lang,
    applySnapshot: (snap) => {
      if (typeof flight?.applySnapshot !== 'function') return false;
      return !!flight.applySnapshot(snap);
    },
    readCheck: () => (flight?.st
      ? readFlightCheck(flight.st, { stageIdx: flight.stageIndex ?? 0 })
      : null),
  });
  state = result.state;
  render();
  return {
    ok: result.ok,
    reason: result.reason,
    nodeId: result.nodeId,
    thought: result.thought,
  };
}

function bindPlanControls() {
  const pairs = [
    ['agent-goal-input', 'btn-agent-plan'],
    ['vab-agent-goal', 'btn-vab-plan'],
  ];
  for (const [inputId, btnId] of pairs) {
    const input = $(inputId);
    const btn = $(btnId);
    const go = () => plan(input?.value ?? '');
    btn?.addEventListener('click', go);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        go();
      }
    });
  }
}

export function bind() {
  $('btn-agent')?.addEventListener('click', () => toggle());
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyO') return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const ui = $('flight-ui');
    if (!ui || ui.classList.contains('hidden')) return;
    e.preventDefault();
    toggle();
  });
  bindPlanControls();
  $('btn-agent-step')?.addEventListener('click', () => { step(); });
  $('btn-agent-revert')?.addEventListener('click', () => { revert(); });
  $('btn-agent-check')?.addEventListener('click', () => { check(); });
  onLangChange((lang) => {
    if (isDemoGoal(state.goal) && !getPendingGoal()) state = demoPlan(lang);
    else if (state.goal && state.missionId) {
      const result = applyGoal(state.goal, currentDesign(), lang);
      applyResult(result, state.goal);
    }
    const btn = $('btn-agent');
    if (btn) btn.textContent = t('agent.toggle');
    render();
  });
  render();
}

export const api = {
  get: getState,
  set: setState,
  toggle,
  pushThought,
  setNode,
  loadDemoIfEmpty,
  plan,
  step,
  revert,
  check,
};
