// Browser / Flight executor for one muscle. Uses the same APIs a human has
// (stage, throttle, SAS, warp) plus cheated attitude like the test autopilot.

import { BODIES } from './constants.js';
import { stackGeometry, computeSections, massProps } from './vessel.js';
import {
  ascentTick, coastAfterEscape, destForNode, lkoAlready, maybeDropLaunchStage,
  pointState, readFlightCheck, runCoastMuscle, runJettisonMuscle, runWindowMuscle,
} from './agent-muscles.js';
import {
  runCaptureMuscle, runEscapeMuscle, runHomeMuscle, runLandMuscle, runRiseMuscle,
  runRecoverMuscle, runTransferCoast, markHeldTitans,
} from './agent-burns.js';
import { snapshotFromFlight, thoughtFromCheck, stubThought } from './agent-step.js';

function langOf(lang) {
  return lang === 'en' ? 'en' : 'zh';
}

function refreshAfterParts(flight) {
  const st = flight.st;
  st.geom = stackGeometry(st.parts);
  st.sections = computeSections(st.parts);
  st.massProps = massProps(st.parts, st.geom);
  flight.inferStageIndex?.();
  flight.refreshViz?.();
  flight.refreshHUD?.();
}

function afterRails(flight) {
  const st = flight.st;
  st.elements = null;
  flight.rails = false;
  flight.warpIdx = 0;
  const body = BODIES[st.body];
  const alt = st.pos.length() - body.radius;
  if (flight.flags) {
    flight.flags.space = alt > (body.atmoHeight || 0);
    flight.flags.orbit = !st.landed && flight.flags.space;
    flight.flags.munSoi = st.body === 'mun';
  }
  flight.refreshHUD?.();
}

function checkOf(flight) {
  return readFlightCheck(flight.st, { stageIdx: flight.stageIndex ?? 0 });
}

export function runJettison(flight, lang) {
  const out = runJettisonMuscle(flight.st, {
    refreshMass() { /* runner refreshes below */ },
    resyncPlan() { flight.inferStageIndex?.(); },
  });
  if (out.ok) refreshAfterParts(flight);
  const check = checkOf(flight);
  return {
    ok: out.ok,
    thought: thoughtFromCheck(out.ok ? 'jettison-ok' : 'jettison-fail', check, out, langOf(lang)),
  };
}

export function runWindow(flight, missionId, lang) {
  const out = runWindowMuscle(flight.st, missionId);
  afterRails(flight);
  const check = checkOf(flight);
  if (!out.ok || out.reason === 'not-orbit' || out.reason === 'landed') {
    return { ok: false, thought: thoughtFromCheck('window-fail', check, out, langOf(lang)) };
  }
  return { ok: true, thought: thoughtFromCheck('window-ok', check, out, langOf(lang)) };
}

export function runCoast(flight, lang, { missionId, state } = {}) {
  const dest = destForNode('coast', missionId);
  const out = coastAfterEscape(state)
    ? runTransferCoast(flight.st, { dest, missionId, nodeId: 'coast', ctrl: flight })
    : runCoastMuscle(flight.st);
  afterRails(flight);
  const check = checkOf(flight);
  if (!out.ok) {
    return { ok: false, thought: thoughtFromCheck('coast-fail', check, out, langOf(lang)) };
  }
  return { ok: true, thought: thoughtFromCheck('coast-ok', check, out, langOf(lang)) };
}

function burnThought(okKind, failKind, out, flight, lang) {
  const check = checkOf(flight);
  return {
    ok: !!out.ok,
    thought: thoughtFromCheck(out.ok ? okKind : failKind, check, out, langOf(lang)),
  };
}

export function runEscape(flight, lang, { missionId, nodeId } = {}) {
  const dest = destForNode(nodeId || 'escape', missionId);
  const out = runEscapeMuscle(flight.st, flight, { dest, missionId, nodeId: nodeId || 'escape' });
  afterRails(flight);
  return burnThought(nodeId === 'tli' ? 'tli-ok' : 'escape-ok', nodeId === 'tli' ? 'tli-fail' : 'escape-fail', out, flight, lang);
}

export function runCapture(flight, lang, { missionId } = {}) {
  const dest = destForNode('capture', missionId);
  const out = runCaptureMuscle(flight.st, flight, { dest, missionId, nodeId: 'capture', allowLander: true });
  afterRails(flight);
  return burnThought('capture-ok', 'capture-fail', out, flight, lang);
}

export function runLand(flight, lang, { missionId } = {}) {
  const dest = destForNode('land', missionId);
  const out = runLandMuscle(flight.st, flight, { dest, missionId, nodeId: 'land' });
  afterRails(flight);
  return burnThought('land-ok', 'land-fail', out, flight, lang);
}

export function runRise(flight, lang) {
  const out = runRiseMuscle(flight.st, flight, {});
  afterRails(flight);
  return burnThought('rise-ok', 'rise-fail', out, flight, lang);
}

export function runHome(flight, lang, { missionId } = {}) {
  const out = runHomeMuscle(flight.st, flight, { missionId, nodeId: 'home' });
  afterRails(flight);
  return burnThought('home-ok', 'home-fail', out, flight, lang);
}

function cancelPilot(flight) {
  flight.pilot = null;
  if (typeof flight.pilotCancel === 'function') {
    const fn = flight.pilotCancel;
    flight.pilotCancel = null;
    fn();
  }
}

export function runAscent(flight, lang) {
  const loc = langOf(lang);
  const st = flight.st;
  if (lkoAlready(st)) {
    const check = checkOf(flight);
    return Promise.resolve({
      ok: true,
      thought: thoughtFromCheck('ascent-ok', check, null, loc),
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (out) => {
      if (settled) return;
      settled = true;
      flight.pilot = null;
      flight.pilotCancel = null;
      if (flight.st && !flight.st.dead) flight.setThrottle?.(0);
      resolve(out);
    };

    flight.pilotCancel = () => {
      finish({
        ok: false,
        thought: thoughtFromCheck('ascent-fail', checkOf(flight), null, loc),
      });
    };

    flight.setThrottle?.(1);
    if (st.landed) flight.stage?.();

    const t0 = st.t;
    flight.pilot = () => {
      if (!flight.active || !flight.st) {
        finish({ ok: false, thought: thoughtFromCheck('ascent-fail', checkOf(flight), null, loc) });
        return;
      }
      const cur = flight.st;
      if (cur.dead) {
        finish({ ok: false, thought: thoughtFromCheck('ascent-fail', checkOf(flight), null, loc) });
        return;
      }
      if (cur.t - t0 > 800) {
        finish({ ok: false, thought: thoughtFromCheck('ascent-fail', checkOf(flight), null, loc) });
        return;
      }
      const tick = ascentTick(cur, { plan: flight.plan, stageIdx: flight.stageIndex });
      pointState(cur, tick.dir);
      cur.sas = false;
      flight.setThrottle?.(tick.throttle);
      if (tick.stage) {
        flight.stage?.();
        markHeldTitans(flight.vessels, flight.activeId);
      }
      const alt = cur.pos.length() - BODIES[cur.body].radius;
      if (alt > 200 && flight.warpIdx < 3) flight.setWarp?.(3);
      if (tick.done) {
        flight.setThrottle?.(0);
        if (maybeDropLaunchStage(cur) && flight.stageIndex < (flight.plan?.length ?? 0)) {
          flight.stage?.();
          markHeldTitans(flight.vessels, flight.activeId);
        }
        flight.inferStageIndex?.();
        const check = checkOf(flight);
        const ok = lkoAlready(cur) || (check.bound && check.peKm != null && check.peKm > 70);
        finish({
          ok,
          thought: thoughtFromCheck(ok ? 'ascent-ok' : 'ascent-fail', check, null, loc),
        });
      }
    };
  });
}

export function runRecover(flight, lang) {
  const loc = langOf(lang);
  const out = runRecoverMuscle({
    vessels: flight.vessels ?? [],
    get activeId() { return flight.activeId; },
    get st() { return flight.st; },
    setActive(id) { flight.switchTo(id); },
    setLegs(down) {
      flight.legsDeployed = !!down;
      for (const p of flight.st?.parts ?? []) {
        if (p.def?.legs) p.legsDown = !!down;
      }
    },
    refreshMass() { flight.refreshViz?.(); flight.refreshHUD?.(); },
  });
  const kind = out.ok ? 'recover-ok' : 'recover-fail';
  return {
    ok: !!out.ok,
    thought: thoughtFromCheck(kind, checkOf(flight), out, loc),
    pad_m: out.pad_m,
    speed: out.speed,
    water: out.water,
    crashed: out.crashed,
    landed: out.landed,
    fuel_kg: out.fuel_kg,
    boosterId: out.boosterId,
    upperId: out.upperId,
    reason: out.reason,
  };
}

export function runBrowserMuscle(nodeId, flight, { missionId, lang, state } = {}) {
  if (!flight?.active || !flight.st) {
    return Promise.resolve({ ok: false, thought: lang === 'en' ? 'Not in flight. Cannot take this cut.' : '不在飞行中，没法走这一刀。' });
  }
  switch (nodeId) {
    case 'ascent':
      return runAscent(flight, lang);
    case 'recover':
      return Promise.resolve(runRecover(flight, lang));
    case 'window':
      return Promise.resolve(runWindow(flight, missionId, lang));
    case 'escape':
    case 'tli':
      return Promise.resolve(runEscape(flight, lang, { missionId, nodeId }));
    case 'coast':
      return Promise.resolve(runCoast(flight, lang, { missionId, state }));
    case 'capture':
      return Promise.resolve(runCapture(flight, lang, { missionId }));
    case 'jettison':
      return Promise.resolve(runJettison(flight, lang));
    case 'land':
      return Promise.resolve(runLand(flight, lang, { missionId }));
    case 'rise':
      return Promise.resolve(runRise(flight, lang));
    case 'home':
      return Promise.resolve(runHome(flight, lang, { missionId }));
    default:
      return Promise.resolve({ ok: false, stub: true, thought: stubThought(nodeId, lang) });
  }
}

export function attachSnapshot(out, flight, nodeId) {
  if (!out?.ok) return out;
  return { ...out, snapshot: snapshotFromFlight(flight, nodeId) };
}

export { cancelPilot };
