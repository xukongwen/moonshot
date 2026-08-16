// Mission Δv budget: compare a VAB design to a conservative phase table
// before ignition. If the budget fails, redesign the rocket — don't fly it.
//
// Numbers are vacuum KSP-like budgets, not leftover fuel from one flight.
// Hohmann / ejection math is cited in comments where it applies.
// Kerbin ascent is the only row with a gravity/drag pad (~15–25%).
// Reentry is 0 (chutes). Do not add Ike / Jool.

import { PARTS } from './parts.js';
import { BODIES } from './constants.js';
import { stagingStats } from './vessel.js';
import { hohmannTransfer, ejectionDeltaV } from './orbits.js';

const PARK_KERBIN = BODIES.kerbin.radius + 80_000;
const PARK_DUNA = BODIES.duna.radius + 55_000;

const kd = hohmannTransfer('kerbin', 'duna');
const ejKerbin = ejectionDeltaV(PARK_KERBIN, BODIES.kerbin.mu, kd.vInfDep);
const capDuna = ejectionDeltaV(PARK_DUNA, BODIES.duna.mu, kd.vInfArr);
const rLko = PARK_KERBIN;
const rMun = BODIES.mun.orbitRadius;
const aMun = (rLko + rMun) / 2;
const munTli = Math.sqrt(BODIES.kerbin.mu * (2 / rLko - 1 / aMun))
  - Math.sqrt(BODIES.kerbin.mu / rLko);

// Math vs table (do not treat a one-off flight as law):
//   Mun TLI from 80 km LKO ≈ 856 m/s → table 900 (pad)
//   Kerbin→Duna ejection @ 80 km ≈ 1072 m/s → table 1200 (pad)
//   Duna capture @ 55 km ≈ 617 m/s → table 450 (starting table; math is higher)
//   Duna surface ascent 1800 is the conservative number that killed the
//     2026-08-15 flight; not copied leftover fuel.
export const MATH = {
  munTli,
  dunaEjection: ejKerbin.dV,
  dunaCapture: capDuna.dV,
};

export const TARGET_G = {
  mun: BODIES.mun.surfaceGravity,   // ~1.63 m/s²
  duna: BODIES.duna.surfaceGravity, // ~2.94 m/s²
};

export const TWR_MIN = 1.2;

/**
 * Conservative vacuum budgets. role = which stage pot pays.
 * kerbin_ascent is split, not billed 100% to one pot:
 *   1-stage: lander (everything is lander).
 *   2-stage: lifter first, remainder from lander (circularize on the upper stage).
 *   3+: lifter first, remainder from leftover transfer — never the lander.
 * After ascent, remaining transfer pays transfer/capture/ejection as today.
 * 2-stage later transfer phases still bill to the lander (lifter is gone).
 */
export const MISSIONS = {
  'mun-roundtrip': {
    id: 'mun-roundtrip',
    label: 'Mun round trip',
    target: 'mun',
    phases: [
      { id: 'kerbin_ascent', label: 'Kerbin ascent to LKO', dv: 4200, role: 'lifter' },
      { id: 'mun_transfer', label: 'Trans-Munar injection', dv: 900, role: 'transfer' },
      { id: 'mun_capture', label: 'Mun orbit capture', dv: 350, role: 'transfer' },
      { id: 'mun_land', label: 'Mun landing', dv: 650, role: 'lander' },
      { id: 'mun_ascent', label: 'Mun ascent to orbit', dv: 650, role: 'lander' },
      { id: 'mun_return', label: 'Trans-Kerbin injection', dv: 350, role: 'lander' },
      // reentry = 0 (chutes)
    ],
  },
  'duna-roundtrip': {
    id: 'duna-roundtrip',
    label: 'Duna round trip',
    target: 'duna',
    phases: [
      { id: 'kerbin_ascent', label: 'Kerbin ascent to LKO', dv: 4200, role: 'lifter' },
      { id: 'duna_ejection', label: 'Kerbin ejection to Duna', dv: 1200, role: 'transfer' },
      { id: 'duna_capture', label: 'Duna orbit capture', dv: 450, role: 'transfer' },
      { id: 'duna_land', label: 'Duna landing', dv: 900, role: 'lander' },
      { id: 'duna_ascent', label: 'Duna ascent to orbit', dv: 1800, role: 'lander' },
      { id: 'duna_return', label: 'Duna ejection home', dv: 800, role: 'lander' },
    ],
  },
};

export function cloneDesign(design) {
  return {
    name: design?.name,
    stack: [...(design?.stack ?? [])],
    radials: (design?.radials ?? []).map((r) => ({
      part: r.part, sym: r.sym, host: r.host,
    })),
  };
}

/** Map stagingStats rows (bottom = lifter → top = lander) onto roles. */
export function assignStages(design) {
  const stages = stagingStats(design);
  const n = stages.length;
  const roles = [];
  if (n === 1) {
    roles.push('lander');
  } else if (n === 2) {
    roles.push('lifter', 'lander');
  } else if (n >= 3) {
    roles.push('lifter');
    for (let i = 1; i < n - 1; i++) roles.push('transfer');
    roles.push('lander');
  }
  const pots = { lifter: 0, transfer: 0, lander: 0 };
  const mapped = stages.map((s, i) => {
    const role = roles[i];
    pots[role] += s.dv;
    return { ...s, role };
  });
  return { stages: mapped, roles, pots, n };
}

/** Charge a mission role onto the pots this craft actually has. */
export function resolveRole(phaseRole, pots) {
  if (pots[phaseRole] > 0 || phaseRole === 'lander') return phaseRole;
  if (phaseRole === 'transfer') {
    // 2-stage rule: transfer phases billed to the lander (lifter already gone).
    return pots.lander > 0 || pots.lifter <= 0 ? 'lander' : 'lifter';
  }
  if (phaseRole === 'lifter') {
    // 1-stage rule: everything is the lander.
    return pots.lander > 0 || pots.transfer <= 0 ? 'lander' : 'transfer';
  }
  return phaseRole;
}

function landerThrustAndWet(design, mapped) {
  const lander = [...mapped].reverse().find((s) => s.role === 'lander')
    ?? mapped[mapped.length - 1];
  const wet = lander?.wet ?? 0;
  const stack = design.stack ?? [];
  // Highest-index engine in the topmost engine section (lander).
  const secs = stackSections(stack);
  const engineSecs = secs.filter((s) => s.parts.some((id) => PARTS[id]?.engine));
  const landerSec = engineSecs[engineSecs.length - 1];
  let thrust = 0;
  if (landerSec) {
    for (let i = landerSec.start; i <= landerSec.end; i++) {
      const def = PARTS[stack[i]];
      if (def?.engine) thrust += def.engine.thrustVac;
    }
    for (const r of design.radials ?? []) {
      if (r.host >= landerSec.start && r.host <= landerSec.end) {
        const def = PARTS[r.part];
        if (def?.engine) thrust += def.engine.thrustVac * (r.sym || 1);
      }
    }
  }
  return { wet, thrust, lander };
}

/**
 * Pay kerbin_ascent from the pots a real flight would use.
 * have = what was available to pay this phase; margin = have - need.
 * paid shows the split so tests/MCP can see who circularized.
 */
function payKerbinAscent(pots, n, ph) {
  const need = ph.dv;
  if (n <= 1) {
    const have = pots.lander ?? 0;
    pots.lander = have - need;
    return {
      id: ph.id,
      label: ph.label,
      role: 'lander',
      need,
      have,
      margin: have - need,
      paid: { lander: need },
    };
  }
  if (n === 2) {
    const lifterHave = pots.lifter ?? 0;
    const landerHave = pots.lander ?? 0;
    const fromLifter = Math.min(lifterHave, need);
    const fromLander = need - fromLifter;
    const have = lifterHave + landerHave;
    pots.lifter = lifterHave - fromLifter;
    pots.lander = landerHave - fromLander;
    return {
      id: ph.id,
      label: ph.label,
      role: 'lifter',
      need,
      have,
      margin: have - need,
      paid: { lifter: fromLifter, lander: fromLander },
    };
  }
  // 3+: lifter first, leftover transfer. Never the lander.
  const lifterHave = pots.lifter ?? 0;
  const transferHave = pots.transfer ?? 0;
  const fromLifter = Math.min(lifterHave, need);
  const fromTransfer = need - fromLifter;
  const have = lifterHave + transferHave;
  pots.lifter = lifterHave - fromLifter;
  pots.transfer = transferHave - fromTransfer;
  return {
    id: ph.id,
    label: ph.label,
    role: 'lifter',
    need,
    have,
    margin: have - need,
    paid: { lifter: fromLifter, transfer: fromTransfer },
  };
}

export function planMission(design, missionId) {
  const mission = MISSIONS[missionId];
  if (!mission) {
    throw new Error(`Unknown mission "${missionId}". Use: ${Object.keys(MISSIONS).join(', ')}`);
  }
  const assigned = assignStages(design);
  const pots = { ...assigned.pots };
  const phases = [];
  const fail = [];

  for (const ph of mission.phases) {
    let row;
    if (ph.id === 'kerbin_ascent') {
      row = payKerbinAscent(pots, assigned.n, ph);
    } else {
      const role = resolveRole(ph.role, assigned.pots);
      const have = pots[role] ?? 0;
      const need = ph.dv;
      const margin = have - need;
      pots[role] = have - need;
      row = { id: ph.id, label: ph.label, role, need, have, margin };
    }
    phases.push(row);
    if (row.margin < 0) fail.push({ id: row.id, need: row.need, have: row.have, margin: row.margin });
  }

  const g = TARGET_G[mission.target];
  if (g && assigned.stages.length) {
    const { wet, thrust } = landerThrustAndWet(design, assigned.stages);
    if (wet > 0 && thrust > 0) {
      const twr = thrust / (wet * g);
      if (twr < TWR_MIN) {
        fail.push({
          id: 'lander_twr',
          need: TWR_MIN,
          have: twr,
          margin: twr - TWR_MIN,
        });
      }
    }
  }

  let suggestion = null;
  if (fail.length) {
    const f = fail[0];
    if (f.id === 'lander_twr') {
      suggestion = `Lander TWR ${f.have.toFixed(2)} < ${TWR_MIN} on ${mission.target}; more thrust or less wet mass.`;
    } else {
      const row = phases.find((p) => p.id === f.id);
      const short = Math.ceil(-f.margin);
      suggestion = `${f.id} short ${short} m/s on ${row?.role ?? 'stage'} (have ${f.have.toFixed(0)}, need ${f.need}). Add fuel to the ${row?.role ?? 'stage'} before ignition.`;
    }
  }

  return {
    ok: fail.length === 0,
    mission: missionId,
    stages: assigned.stages,
    phases,
    fail,
    suggestion,
  };
}

// ---------------------------------------------------------------------------
// Stack sections (index 0 = top). Decoupler sits in the lower section.
// ---------------------------------------------------------------------------

function stackSections(stack) {
  const secs = [];
  let start = stack.length - 1;
  let end = stack.length - 1;
  let parts = [];
  for (let i = stack.length - 1; i >= 0; i--) {
    parts.push(stack[i]);
    start = i;
    if (PARTS[stack[i]]?.decoupler) {
      secs.push({ start, end, parts });
      parts = [];
      start = i - 1;
      end = i - 1;
    }
  }
  if (parts.length) secs.push({ start, end, parts });
  return secs;
}

function roleSection(design, role) {
  const secs = stackSections(design.stack);
  const engineSecs = secs.filter((s) => s.parts.some((id) => PARTS[id]?.engine));
  if (!engineSecs.length) return null;
  if (engineSecs.length === 1) return engineSecs[0];
  if (engineSecs.length === 2) {
    return role === 'lifter' ? engineSecs[0] : engineSecs[1];
  }
  if (role === 'lifter') return engineSecs[0];
  if (role === 'lander') return engineSecs[engineSecs.length - 1];
  return engineSecs[1];
}

function engineIndex(stack, sec) {
  for (let i = sec.end; i >= sec.start; i--) {
    if (PARTS[stack[i]]?.engine) return i;
  }
  return sec.end;
}

function countPart(stack, sec, id) {
  let n = 0;
  for (let i = sec.start; i <= sec.end; i++) if (stack[i] === id) n++;
  return n;
}

function tankHost(stack, sec) {
  for (let i = sec.start; i <= sec.end; i++) if (stack[i] === 'tank-xl') return i;
  for (let i = sec.start; i <= sec.end; i++) {
    const def = PARTS[stack[i]];
    if (def?.fuel && !def.engine) return i;
  }
  return sec.start;
}

function insertStack(design, index, partId) {
  design.stack.splice(index, 0, partId);
  for (const r of design.radials) {
    if (r.host >= index) r.host++;
  }
}

function patchRole(design, role, shortfall) {
  const sec = roleSection(design, role);
  if (!sec) return null;
  if (role === 'lander') {
    const part = shortfall > 400 ? 'tank-m' : 'tank-s';
    const at = engineIndex(design.stack, sec);
    insertStack(design, at, part);
    return { reason: `lander short ${Math.ceil(shortfall)} m/s`, change: `insert ${part} above lander engine` };
  }
  if (role === 'transfer') {
    const at = engineIndex(design.stack, sec);
    insertStack(design, at, 'tank-l');
    return { reason: `transfer short ${Math.ceil(shortfall)} m/s`, change: 'insert tank-l in transfer section' };
  }
  // Lifter: tank-xl first. One SRB after 3 XL adds ~20 m/s vacuum, not a
  // 900 m/s ejection hole — keep inserting XL until the lifter covers
  // ascent. SRB only after many XL (TWR / last resort), not at 2–3.
  const xl = countPart(design.stack, sec, 'tank-xl');
  if (xl >= 8) {
    const host = tankHost(design.stack, sec);
    design.radials.push({ part: 'srb', sym: 1, host });
    return { reason: `lifter short ${Math.ceil(shortfall)} m/s`, change: `add srb radial on stack[${host}]` };
  }
  const at = engineIndex(design.stack, sec);
  insertStack(design, at, 'tank-xl');
  return { reason: `lifter short ${Math.ceil(shortfall)} m/s`, change: 'insert tank-xl above lifter engine' };
}

/** Transfer leftover spent on circularization. High → patch lifter, not Raven tanks. */
const ASCENT_XFER_SMALL = 400;
const LIFTER_COVERS_MOST = 3800;

function roleToPatch(plan, failRow) {
  const failRole = failRow?.role ?? 'lander';
  if (failRole !== 'transfer') return failRole;
  const ascent = plan.phases.find((p) => p.id === 'kerbin_ascent');
  const paidXfer = ascent?.paid?.transfer ?? 0;
  const lifterHave = plan.stages
    .filter((s) => s.role === 'lifter')
    .reduce((sum, s) => sum + s.dv, 0);
  // Only add transfer tank-l after the ascent remainder is small.
  if (paidXfer >= ASCENT_XFER_SMALL && lifterHave < LIFTER_COVERS_MOST) {
    return 'lifter';
  }
  return 'transfer';
}

export function redesignForBudget(design, missionId, { maxSteps = 8 } = {}) {
  const original = cloneDesign(design);
  let current = cloneDesign(design);
  let plan = planMission(current, missionId);
  if (plan.ok) {
    return { ok: true, design: original, steps: [], plan };
  }
  const steps = [];
  for (let i = 0; i < maxSteps; i++) {
    const phaseFail = plan.fail.find((f) => f.id !== 'lander_twr');
    if (!phaseFail) break;
    const row = plan.phases.find((p) => p.id === phaseFail.id);
    const role = roleToPatch(plan, row);
    const change = patchRole(current, role, -phaseFail.margin);
    if (!change) break;
    steps.push(change);
    plan = planMission(current, missionId);
    if (plan.ok) {
      return { ok: true, design: current, steps, plan };
    }
  }
  return { ok: false, design: current, steps, plan };
}

export function formatPlan(plan) {
  const lines = [];
  lines.push(`${plan.mission}  ${plan.ok ? 'OK' : 'FAIL'}`);
  for (const p of plan.phases) {
    const flag = p.margin >= 0 ? 'ok' : '!!';
    let line = `  ${flag} ${p.id.padEnd(16)} ${p.role.padEnd(8)} need ${String(p.need).padStart(5)}  have ${p.have.toFixed(0).padStart(5)}  margin ${p.margin.toFixed(0).padStart(6)}`;
    if (p.paid) {
      const bits = Object.entries(p.paid)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k} ${v.toFixed(0)}`);
      if (bits.length) line += `  paid ${bits.join('+')}`;
    }
    lines.push(line);
  }
  if (plan.suggestion) lines.push(`  → ${plan.suggestion}`);
  return lines.join('\n');
}

