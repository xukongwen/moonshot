// Deterministic coarse-goal mapper. Pure: no document, no LLM.
// Human text → mun-roundtrip | duna-roundtrip → planMission budget + play-loop nodes.

import { MISSIONS, planMission, cloneDesign } from './plan.js';
import { STOCK } from './stock.js';
import { getLang } from './i18n.js';
import { nodesForMission } from './agent-plan.js';

const UNKNOWN_ZH = '听不懂，先说去月球还是去火星';
const UNKNOWN_EN = "Don't understand. Say Mun or Duna first.";

// First keyword in the string wins if both missions are mentioned.
const DUNA_RE = /火星|duna/i;
const MUN_RE = /月球|缪恩|登月|mun/i;

function hasStack(design) {
  return Array.isArray(design?.stack) && design.stack.length > 0;
}

function stockFor(missionId) {
  const name = missionId === 'duna-roundtrip' ? 'Duna Hauler' : 'Mun Express';
  const d = cloneDesign(STOCK[name]);
  d.name = name;
  return d;
}

export function parseGoal(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const dunaAt = s.search(DUNA_RE);
  const munAt = s.search(MUN_RE);
  if (dunaAt < 0 && munAt < 0) return null;
  const missionId = dunaAt >= 0 && (munAt < 0 || dunaAt <= munAt)
    ? 'duna-roundtrip'
    : 'mun-roundtrip';
  return { missionId, label: MISSIONS[missionId].label };
}

function thoughtOk(firstLabel, lang) {
  return lang === 'en'
    ? `Master plan written. Budget passed. First cut: ${firstLabel}.`
    : `总图已写。预算过了。第一刀：${firstLabel}。`;
}

/** Format plan.fail[0] the same way applyGoal does. Missing margin → no number. */
export function formatBudgetFail(fail, lang) {
  if (!fail || fail.id == null) return '';
  const en = lang === 'en';
  const id = fail.id;
  if (fail.margin == null || !Number.isFinite(fail.margin)) {
    return en
      ? `Budget failed: ${id}. Redesign before ignition.`
      : `预算不过：${id}。先改船再点火。`;
  }
  const abs = Math.abs(fail.margin);
  if (id === 'lander_twr') {
    const shown = abs.toFixed(2);
    return en
      ? `Budget failed: ${id} short ${shown} TWR. Redesign before ignition.`
      : `预算不过：${id} 差 ${shown} TWR。先改船再点火。`;
  }
  const shown = String(Math.round(abs));
  return en
    ? `Budget failed: ${id} short ${shown} m/s. Redesign before ignition.`
    : `预算不过：${id} 差 ${shown} m/s。先改船再点火。`;
}

function thoughtFail(fail, lang) {
  const body = formatBudgetFail(fail, lang);
  return lang === 'en' ? `Master plan written. ${body}` : `总图已写。${body}`;
}

function thoughtUnknown(lang) {
  return lang === 'en' ? UNKNOWN_EN : UNKNOWN_ZH;
}

/**
 * Map a rough request onto a mission budget. Does not mutate `design`.
 * Missing/empty design → stock matching the mission (Mun Express / Duna Hauler).
 * @returns {{ goal: string, missionId: string|null, plan: object|null, nodes: object[], thought: string }}
 */
export function applyGoal(text, design, lang) {
  const goal = String(text ?? '').trim();
  const loc = lang === 'en' || lang === 'zh' ? lang : getLang();
  const parsed = parseGoal(goal);
  if (!parsed) {
    return {
      goal,
      missionId: null,
      plan: null,
      nodes: [],
      thought: thoughtUnknown(loc),
    };
  }
  const used = hasStack(design) ? cloneDesign(design) : stockFor(parsed.missionId);
  const plan = planMission(used, parsed.missionId);
  const nodes = nodesForMission(parsed.missionId, loc);
  const first = nodes[0]?.label || '入轨';
  const thought = plan.ok
    ? thoughtOk(first, loc)
    : thoughtFail(plan.fail[0], loc);
  return {
    goal,
    missionId: parsed.missionId,
    plan,
    nodes,
    thought,
  };
}
