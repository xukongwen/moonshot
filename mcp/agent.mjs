// Headless agent panel for SimSession. Same functions as the in-game panel
// (applyGoal / runStep / revertTo / runChecks). No DOM. No LLM.

import { createState, pushThought, toggle as toggleState } from '../src/agent-plan.js';
import { applyGoal } from '../src/agent-goal.js';
import { canStep, runStep, thoughtFromCheck, stubThought } from '../src/agent-step.js';
import { revertTo } from '../src/agent-revert.js';
import { runChecks } from '../src/agent-check.js';
import {
  ascentTick, captureFlightSnapshot, coastAfterEscape, destForNode, lkoAlready,
  maybeDropLaunchStage, pointState, readFlightCheck, runCoastMuscle,
  runJettisonMuscle, runWindowMuscle,
} from '../src/agent-muscles.js';
import {
  runCaptureMuscle, runEscapeMuscle, runHomeMuscle, runLandMuscle, runRiseMuscle,
  runTransferCoast,
} from '../src/agent-burns.js';
import { applySnapshotToState } from './snapshot.mjs';

const ASCENT_MAX_S = 800;
const ASCENT_DT = 0.05;

export function freshAgent() {
  return createState({ open: true, goal: '' });
}

export function agentIdle(state) {
  return createState({ ...state, running: false });
}

export function currentDesign(session) {
  const v = session?.activeVessel?.() ?? null;
  if (v?.design?.stack?.length) return v.design;
  if (session?.lastDesign?.stack?.length) return session.lastDesign;
  if (session?.workshop?.design?.stack?.length) return session.workshop.design;
  return null;
}

function langOf(session) {
  return session?.lang === 'en' ? 'en' : 'zh';
}

function checkOf(session) {
  if (!session?.st) return null;
  return readFlightCheck(session.st, { stageIdx: session.stageIdx ?? 0 });
}

/** MCP-facing view. Does not invent fuel / Δv / orbit numbers. */
export function viewAgent(state) {
  const nodes = (state?.nodes ?? []).map((n) => ({
    id: n.id,
    label: n.label,
    status: n.status,
  }));
  const current = (state?.nodeId && nodes.find((n) => n.id === state.nodeId))
    || nodes.find((n) => n.status === 'current')
    || null;
  const snaps = state?.snapshots && typeof state.snapshots === 'object' && !Array.isArray(state.snapshots)
    ? state.snapshots
    : {};
  const snapshotIds = Object.keys(snaps).filter((id) => snaps[id]);
  const raw = state?.plan && typeof state.plan === 'object' && !Array.isArray(state.plan)
    ? state.plan
    : null;
  let plan = null;
  if (raw) {
    plan = { ok: !!raw.ok };
    if (raw.ok === false && Array.isArray(raw.fail) && raw.fail[0]) {
      plan.fail = raw.fail[0];
    }
  }
  return {
    visible: state?.open !== false,
    goal: state?.goal ?? '',
    missionId: state?.missionId ?? null,
    nodes,
    current,
    thought: state?.thought ?? '',
    thoughts: [...(state?.thoughts ?? [])],
    running: !!state?.running,
    snapshots: snapshotIds,
    plan,
  };
}

function attachView(session, extra = {}) {
  return { ...viewAgent(session.agent), ...extra };
}

function applyCheckThoughts(session, when) {
  const result = runChecks({
    check: checkOf(session) ?? {},
    design: currentDesign(session),
    parts: session?.st?.parts ?? null,
    state: session.agent,
    plan: session.agent?.plan,
    lang: langOf(session),
    when,
  });
  for (const th of result.thoughts) {
    if (th && th !== session.agent.thought) {
      session.agent = pushThought(session.agent, th);
    }
  }
  return result;
}

export function runSessionAscent(session, lang) {
  const loc = lang === 'en' ? 'en' : 'zh';
  if (lkoAlready(session.st)) {
    const check = checkOf(session);
    return { ok: true, thought: thoughtFromCheck('ascent-ok', check, null, loc) };
  }
  session.setThrottle(1);
  if (session.st.landed) session.stage();
  const t0 = session.st.t;
  while (session.st && !session.st.dead && session.st.t - t0 <= ASCENT_MAX_S) {
    const tick = ascentTick(session.st, { plan: session.plan, stageIdx: session.stageIdx });
    pointState(session.st, tick.dir);
    session.st.sas = false;
    session.setThrottle(tick.throttle);
    if (tick.stage) session.stage();
    if (tick.done) {
      session.setThrottle(0);
      if (maybeDropLaunchStage(session.st) && session.stageIdx < (session.plan?.length ?? 0)) {
        session.stage();
      }
      session.resyncPlan();
      const check = checkOf(session);
      const ok = lkoAlready(session.st) || (check.bound && check.peKm != null && check.peKm > 70);
      return {
        ok,
        thought: thoughtFromCheck(ok ? 'ascent-ok' : 'ascent-fail', check, null, loc),
      };
    }
    session.step(ASCENT_DT);
  }
  if (session.st && !session.st.dead) session.setThrottle(0);
  return { ok: false, thought: thoughtFromCheck('ascent-fail', checkOf(session), null, loc) };
}

export function runSessionMuscle(session, nodeId, { missionId, lang } = {}) {
  const loc = lang === 'en' ? 'en' : 'zh';
  if (!session?.st) {
    return {
      ok: false,
      thought: loc === 'en' ? 'Not in flight. Cannot take this cut.' : '不在飞行中，没法走这一刀。',
    };
  }
  switch (nodeId) {
    case 'ascent':
      return runSessionAscent(session, loc);
    case 'window': {
      const out = runWindowMuscle(session.st, missionId);
      const check = checkOf(session);
      if (!out.ok || out.reason === 'not-orbit' || out.reason === 'landed') {
        return { ok: false, thought: thoughtFromCheck('window-fail', check, out, loc) };
      }
      return { ok: true, thought: thoughtFromCheck('window-ok', check, out, loc) };
    }
    case 'escape':
    case 'tli': {
      const dest = destForNode(nodeId, missionId);
      const out = runEscapeMuscle(session.st, session, { dest, missionId, nodeId });
      const check = checkOf(session);
      const okK = nodeId === 'tli' ? 'tli-ok' : 'escape-ok';
      const failK = nodeId === 'tli' ? 'tli-fail' : 'escape-fail';
      return { ok: !!out.ok, thought: thoughtFromCheck(out.ok ? okK : failK, check, out, loc) };
    }
    case 'coast': {
      const dest = destForNode('coast', missionId);
      const out = coastAfterEscape(session.agent)
        ? runTransferCoast(session.st, { dest, missionId, nodeId: 'coast', ctrl: session })
        : runCoastMuscle(session.st);
      const check = checkOf(session);
      if (!out.ok) {
        return { ok: false, thought: thoughtFromCheck('coast-fail', check, out, loc) };
      }
      return { ok: true, thought: thoughtFromCheck('coast-ok', check, out, loc) };
    }
    case 'capture': {
      const dest = destForNode('capture', missionId);
      const out = runCaptureMuscle(session.st, session, { dest, missionId, nodeId: 'capture' });
      const check = checkOf(session);
      return { ok: !!out.ok, thought: thoughtFromCheck(out.ok ? 'capture-ok' : 'capture-fail', check, out, loc) };
    }
    case 'jettison': {
      const out = runJettisonMuscle(session.st, {
        refreshMass: () => session.refreshMass(),
        resyncPlan: () => session.resyncPlan(),
      });
      const check = checkOf(session);
      return {
        ok: out.ok,
        thought: thoughtFromCheck(out.ok ? 'jettison-ok' : 'jettison-fail', check, out, loc),
      };
    }
    case 'land': {
      const dest = destForNode('land', missionId);
      const out = runLandMuscle(session.st, session, { dest, missionId, nodeId: 'land' });
      const check = checkOf(session);
      return { ok: !!out.ok, thought: thoughtFromCheck(out.ok ? 'land-ok' : 'land-fail', check, out, loc) };
    }
    case 'rise': {
      const out = runRiseMuscle(session.st, session, {});
      const check = checkOf(session);
      return { ok: !!out.ok, thought: thoughtFromCheck(out.ok ? 'rise-ok' : 'rise-fail', check, out, loc) };
    }
    case 'home': {
      const out = runHomeMuscle(session.st, session, { missionId, nodeId: 'home' });
      const check = checkOf(session);
      return {
        ok: !!out.ok,
        thought: thoughtFromCheck(out.ok ? 'home-ok' : 'home-fail', check, out, loc),
        captured: out.captured,
        landed: out.landed,
        touchdownSpeed: out.touchdownSpeed,
        chute: out.chute,
        captureCheck: out.captureCheck ?? null,
        reason: out.reason ?? null,
      };
    }
    default:
      return { ok: false, stub: true, thought: stubThought(nodeId, loc) };
  }
}

function attachSnap(session, out, nodeId) {
  if (!out?.ok || !session?.st) return out;
  return {
    ...out,
    snapshot: captureFlightSnapshot(session.st, {
      tag: `agent-${nodeId}`,
      craft: session.craftName ?? null,
    }),
  };
}

export function agentGet(session) {
  return viewAgent(session.agent);
}

export function agentToggle(session, force) {
  session.agent = toggleState(session.agent, force);
  return attachView(session);
}

export function agentPlan(session, text) {
  const raw = String(text ?? '').trim();
  const result = applyGoal(raw, currentDesign(session), langOf(session));
  const nodes = (result.nodes ?? []).map((n, i) => ({
    ...n,
    status: n.status || (i === 0 ? 'current' : 'pending'),
  }));
  session.agent = pushThought(createState({
    ...session.agent,
    open: true,
    goal: result.goal || raw,
    nodes,
    nodeId: nodes[0]?.id ?? null,
    missionId: result.missionId,
    running: false,
    snapshots: {},
    plan: result.plan ?? null,
  }), result.thought);
  return attachView(session, {
    thought: result.thought,
  });
}

export function agentStep(session) {
  const lang = langOf(session);
  const gate = canStep(session.agent);
  if (!gate.ok) {
    const res = runStep(session.agent, { lang });
    session.agent = res.state;
    return attachView(session, {
      ok: false,
      reason: res.reason,
      thought: res.thought,
    });
  }
  applyCheckThoughts(session, 'pre-step');
  const muscle = (id) => attachSnap(
    session,
    runSessionMuscle(session, id, { missionId: session.agent.missionId, lang }),
    id,
  );
  const res = runStep(createState({ ...session.agent, running: false }), { lang, muscle });
  session.agent = res.state;
  applyCheckThoughts(session, 'post-step');
  return attachView(session, {
    ok: !!res.ok,
    stub: !!res.stub,
    reason: res.reason,
    nodeId: res.nodeId ?? gate.node.id,
    nextId: res.nextId ?? session.agent.nodeId,
    thought: res.thought,
    captured: res.captured,
    landed: res.landed,
    touchdownSpeed: res.touchdownSpeed,
    chute: res.chute,
    captureCheck: res.captureCheck ?? null,
  });
}

export function agentRevert(session, nodeId) {
  const lang = langOf(session);
  const result = revertTo(session.agent, nodeId, {
    lang,
    applySnapshot: (snap) => {
      if (!session.st || !snap) return false;
      applySnapshotToState(session.st, snap);
      session.refreshMass();
      session.resyncPlan();
      session.liftedOff = !snap.landed || snap.t > 0;
      return true;
    },
    readCheck: () => checkOf(session),
  });
  session.agent = result.state;
  return attachView(session, {
    ok: !!result.ok,
    reason: result.reason,
    nodeId: result.nodeId,
    thought: result.thought,
  });
}

export function agentCheck(session) {
  const result = applyCheckThoughts(session, 'inspect');
  return attachView(session, {
    thoughts: result.thoughts,
    thought: session.agent.thought,
    flags: result.flags,
    transferFuelKg: result.transferFuelKg,
    landerFuelKg: result.landerFuelKg,
    currentId: result.currentId,
    nextId: result.nextId,
  });
}

