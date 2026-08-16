// Pure agent-panel state. No document. UI renders this; tests import this.

const STATUSES = new Set(['pending', 'current', 'done', 'failed']);
const THOUGHT_CAP = 12;

export const DEMO_GOAL_ZH = '去火星再回来';
export const DEMO_GOAL_EN = 'Go to Duna and back';
export const DEMO_THOUGHT_ZH = '总图已写。第一刀：助推把入轨做完，转移级留着逃逸。';
export const DEMO_THOUGHT_EN = 'Master plan written. First cut: booster finishes insertion; keep the transfer stage for escape.';

export const DEMO_NODES_ZH = [
  { id: 'ascent', label: '入轨' },
  { id: 'window', label: '等窗口' },
  { id: 'escape', label: '逃逸' },
  { id: 'coast', label: '滑行' },
  { id: 'capture', label: '捕获' },
  { id: 'jettison', label: '丢掉转移级' },
  { id: 'land', label: '着陆' },
  { id: 'rise', label: '上升' },
  { id: 'home', label: '回家' },
];

export const DEMO_NODES_EN = [
  { id: 'ascent', label: 'Insertion' },
  { id: 'window', label: 'Wait window' },
  { id: 'escape', label: 'Escape' },
  { id: 'coast', label: 'Coast' },
  { id: 'capture', label: 'Capture' },
  { id: 'jettison', label: 'Drop transfer' },
  { id: 'land', label: 'Land' },
  { id: 'rise', label: 'Ascent' },
  { id: 'home', label: 'Home' },
];

export const MUN_NODES_ZH = [
  { id: 'ascent', label: '入轨' },
  { id: 'window', label: '等窗口' },
  { id: 'tli', label: 'TLI' },
  { id: 'coast', label: '滑行' },
  { id: 'capture', label: '捕获' },
  { id: 'jettison', label: '丢掉转移级' },
  { id: 'land', label: '着陆' },
  { id: 'rise', label: '上升' },
  { id: 'home', label: '回家' },
];

export const MUN_NODES_EN = [
  { id: 'ascent', label: 'Insertion' },
  { id: 'window', label: 'Wait window' },
  { id: 'tli', label: 'TLI' },
  { id: 'coast', label: 'Coast' },
  { id: 'capture', label: 'Capture' },
  { id: 'jettison', label: 'Drop transfer' },
  { id: 'land', label: 'Land' },
  { id: 'rise', label: 'Ascent' },
  { id: 'home', label: 'Home' },
];

let pendingGoal = '';

export function setPendingGoal(text) {
  pendingGoal = String(text ?? '').trim();
  return pendingGoal;
}

export function getPendingGoal() {
  return pendingGoal;
}

function normalizeNode(n) {
  return {
    id: String(n?.id ?? ''),
    label: String(n?.label ?? n?.id ?? ''),
    status: STATUSES.has(n?.status) ? n.status : 'pending',
  };
}

export function nodesForMission(missionId, lang = 'zh') {
  const zh = lang !== 'en';
  let src;
  if (missionId === 'mun-roundtrip') src = zh ? MUN_NODES_ZH : MUN_NODES_EN;
  else if (missionId === 'duna-roundtrip') src = zh ? DEMO_NODES_ZH : DEMO_NODES_EN;
  else src = [];
  return src.map((n, i) => ({ ...n, status: i === 0 ? 'current' : 'pending' }));
}

export function createState(partial = {}) {
  const thoughts = Array.isArray(partial.thoughts)
    ? partial.thoughts.map((x) => String(x)).slice(-THOUGHT_CAP)
    : [];
  const thought = partial.thought != null
    ? String(partial.thought)
    : (thoughts[thoughts.length - 1] ?? '');
  const snapshots = (partial.snapshots && typeof partial.snapshots === 'object' && !Array.isArray(partial.snapshots))
    ? { ...partial.snapshots }
    : {};
  return {
    open: partial.open !== false,
    goal: partial.goal != null ? String(partial.goal) : '',
    nodes: Array.isArray(partial.nodes) ? partial.nodes.map(normalizeNode) : [],
    thought,
    thoughts,
    nodeId: partial.nodeId == null ? null : String(partial.nodeId),
    missionId: partial.missionId == null ? null : String(partial.missionId),
    running: !!partial.running,
    snapshots,
    plan: (partial.plan && typeof partial.plan === 'object' && !Array.isArray(partial.plan))
      ? partial.plan
      : null,
  };
}

export function setState(state, patch = {}) {
  return createState({ ...state, ...patch });
}

export function pushThought(state, text) {
  const thought = String(text ?? '').trim();
  if (!thought) return createState(state);
  const thoughts = [...(state.thoughts ?? []), thought];
  while (thoughts.length > THOUGHT_CAP) thoughts.shift();
  return createState({ ...state, thought, thoughts });
}

/** Mark a node done and move current to the next one (or stay if last). */
export function completeNode(state, finishedId) {
  const id = String(finishedId ?? '');
  const src = state.nodes ?? [];
  const idx = src.findIndex((n) => n.id === id);
  if (idx < 0) return createState(state);
  const next = src[idx + 1];
  const nodes = src.map((n, i) => {
    if (i === idx) return { ...n, status: 'done' };
    if (next && n.id === next.id) return { ...n, status: 'current' };
    if (n.status === 'current') return { ...n, status: 'pending' };
    return { ...n };
  });
  return createState({ ...state, nodes, nodeId: next ? next.id : id });
}

/** That node becomes current; later pending; earlier stay done. */
export function revertNode(state, nodeId) {
  const id = String(nodeId ?? '');
  const src = state.nodes ?? [];
  const idx = src.findIndex((n) => n.id === id);
  if (idx < 0) return createState(state);
  const nodes = src.map((n, i) => {
    if (i < idx) return { ...n, status: 'done' };
    if (i === idx) return { ...n, status: 'current' };
    return { ...n, status: 'pending' };
  });
  return createState({ ...state, nodes, nodeId: id, running: false });
}

export function setNode(state, nodeId, status = 'current') {
  const id = nodeId == null ? null : String(nodeId);
  if (id == null) return createState({ ...state, nodeId: null });
  const st = STATUSES.has(status) ? status : 'current';
  const nodes = (state.nodes ?? []).map((n) => {
    if (n.id === id) return { ...n, status: st };
    if (st === 'current' && n.status === 'current') return { ...n, status: 'pending' };
    return { ...n };
  });
  return createState({ ...state, nodes, nodeId: id });
}

export function toggle(state, force) {
  const open = force == null ? !state.open : !!force;
  return createState({ ...state, open });
}

export function isDemoGoal(goal) {
  return goal === DEMO_GOAL_ZH || goal === DEMO_GOAL_EN;
}

export function demoPlan(lang = 'zh') {
  const zh = lang !== 'en';
  const nodes = nodesForMission('duna-roundtrip', lang);
  return pushThought(createState({
    open: true,
    goal: zh ? DEMO_GOAL_ZH : DEMO_GOAL_EN,
    nodes,
    nodeId: nodes[0].id,
    missionId: 'duna-roundtrip',
  }), zh ? DEMO_THOUGHT_ZH : DEMO_THOUGHT_EN);
}
