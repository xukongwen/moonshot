// Pure flight/design checker. Writes thoughts from real fields only.
// No LLM. Does not invent kg, Δv, or stage names.

import { PARTS } from './parts.js';
import { BODIES } from './constants.js';
import { buildVesselParts, buildStagePlan } from './vessel.js';
import { formatBudgetFail } from './agent-goal.js';

const DRY_KG = 1;
const DANGER_IDS = new Set(['capture', 'land']);

function loc(lang) {
  return lang === 'en' ? 'en' : 'zh';
}

function engineNickname(partId) {
  const name = PARTS[partId]?.name;
  if (!name) return null;
  const m = String(name).match(/"([^"]+)"/);
  return m ? m[1] : null;
}

/** Bottom-up engine sections (index 0 = lifter). Same split as plan.js assignStages. */
export function engineSections(stack) {
  const s = stack ?? [];
  const secs = [];
  let start = s.length - 1;
  let end = s.length - 1;
  let parts = [];
  for (let i = s.length - 1; i >= 0; i--) {
    parts.push(s[i]);
    start = i;
    if (PARTS[s[i]]?.decoupler) {
      secs.push({ start, end, parts });
      parts = [];
      start = i - 1;
      end = i - 1;
    }
  }
  if (parts.length) secs.push({ start, end, parts });
  return secs.filter((sec) => sec.parts.some((id) => PARTS[id]?.engine));
}

function roleForIndex(i, n) {
  if (n <= 1) return 'lander';
  if (n === 2) return i === 0 ? 'lifter' : 'lander';
  if (i === 0) return 'lifter';
  if (i === n - 1) return 'lander';
  return 'transfer';
}

function packRole(sections, role) {
  const list = sections.filter((s) => s.role === role);
  if (!list.length) return null;
  const nicks = [...new Set(list.map((s) => s.nickname).filter(Boolean))];
  return {
    role,
    nickname: nicks.length === 1 ? nicks[0] : null,
    sections: list,
  };
}

/**
 * Transfer / lander / lifter from the design stack.
 * Nickname is the catalog engine quote (Raven, Sparrow, …) on that role
 * section — never a guessed part name.
 */
export function identifyRoles(design) {
  const secs = engineSections(design?.stack ?? []);
  const n = secs.length;
  const sections = secs.map((sec, i) => {
    const role = roleForIndex(i, n);
    const engId = [...sec.parts].reverse().find((id) => PARTS[id]?.engine) ?? null;
    return { ...sec, role, engineId: engId, nickname: engineNickname(engId) };
  });
  return {
    sections,
    transfer: packRole(sections, 'transfer'),
    lander: packRole(sections, 'lander'),
    lifter: packRole(sections, 'lifter'),
  };
}

export function roleLabel(role, nickname, lang) {
  if (nickname) return nickname;
  const en = loc(lang) === 'en';
  if (role === 'lander') return en ? 'lander' : '着陆器';
  if (role === 'transfer') return en ? 'transfer stage' : '转移级';
  if (role === 'lifter') return en ? 'lifter' : '助推级';
  return role || (en ? 'stage' : '级');
}

/** Sum live non-SRB fuel in a role's stack range. Missing parts → null (do not guess). */
export function fuelInRole(parts, roleInfo) {
  if (!roleInfo?.sections?.length || !Array.isArray(parts)) return null;
  let fuel = 0;
  let saw = false;
  for (const p of parts) {
    if (p.alive === false) continue;
    if (p.def?.engine?.srb) continue;
    if (p.fuel == null || !Number.isFinite(p.fuel)) continue;
    const idx = p.stackIndex;
    if (idx == null) continue;
    if (roleInfo.sections.some((s) => idx >= s.start && idx <= s.end)) {
      fuel += p.fuel;
      saw = true;
    }
  }
  return saw ? fuel : null;
}

function roleForStageIdx(design, stageIdx) {
  if (!design?.stack || stageIdx == null || !Number.isFinite(stageIdx)) return null;
  const parts = buildVesselParts(design);
  const plan = buildStagePlan(parts);
  const ev = plan[stageIdx];
  const key = ev?.ignite?.[0];
  if (!key) return null;
  const p = parts.find((x) => x.key === key);
  if (!p) return null;
  const roles = identifyRoles(design);
  const sec = roles.sections.find((s) => p.stackIndex >= s.start && p.stackIndex <= s.end);
  return sec?.role ?? null;
}

function currentAndNext(state) {
  const nodes = state?.nodes ?? [];
  let current = null;
  if (state?.nodeId) current = nodes.find((n) => n.id === state.nodeId) ?? null;
  if (!current) current = nodes.find((n) => n.status === 'current') ?? null;
  const idx = current ? nodes.findIndex((n) => n.id === current.id) : -1;
  const next = idx >= 0 ? (nodes[idx + 1] ?? null) : null;
  return { current, next };
}

function isCoastAfterEscape(state, node) {
  if (!node || node.id !== 'coast') return false;
  const nodes = state?.nodes ?? [];
  const i = nodes.findIndex((n) => n.id === 'coast');
  const prev = i > 0 ? nodes[i - 1] : null;
  if (prev && (prev.id === 'escape' || prev.id === 'tli')) return true;
  return nodes.some((n) => (n.id === 'escape' || n.id === 'tli') && n.status === 'done');
}

function isDangerNode(state, node) {
  if (!node) return false;
  if (DANGER_IDS.has(node.id)) return true;
  return isCoastAfterEscape(state, node);
}

function beforeJettisonOrLand(state) {
  const { current } = currentAndNext(state);
  if (!current) return false;
  return current.id !== 'jettison' && current.id !== 'land'
    && current.id !== 'rise' && current.id !== 'home';
}

function landerIsLive(input, roles) {
  const parts = input.parts;
  // Live parts exist: trust ignition only. stageIdx is the NEXT unused
  // stage (drop Raven / light Sparrow), not "Sparrow is burning".
  if (Array.isArray(parts) && parts.length) {
    if (!roles.lander) return false;
    const lit = parts.find((p) => p.ignited && p.alive !== false && p.def?.engine && !p.def.engine.srb);
    if (!lit) return false;
    return roles.lander.sections.some((s) => lit.stackIndex >= s.start && lit.stackIndex <= s.end);
  }
  if (input.check?.liveRole === 'lander') return true;
  const fromIdx = roleForStageIdx(input.design, input.check?.stageIdx);
  return fromIdx === 'lander';
}

function transferFuelOf(input, roles) {
  const raw = input.check?.transferFuelKg;
  if (raw != null && Number.isFinite(raw)) return raw;
  return fuelInRole(input.parts, roles.transfer);
}

function fmtFuelKg(kg) {
  if (kg == null || !Number.isFinite(kg)) return null;
  return `${Math.round(kg)} kg`;
}

function orbitOf(check) {
  return check?.orbitText && check.orbitText !== '—' ? check.orbitText : null;
}

function atmoKmOf(check) {
  const body = BODIES[check?.body];
  if (!body || body.atmoHeight == null) return null;
  return body.atmoHeight / 1000;
}

function thoughtTransferDry(xferName, kg, lang) {
  const fuel = fmtFuelKg(kg);
  const en = loc(lang) === 'en';
  if (fuel) {
    return en
      ? `${xferName} is dry (${fuel}). Do not light the lander for the next burn.`
      : `${xferName} 干了（${fuel}），下一刀不要点着陆器。`;
  }
  return en
    ? `${xferName} is dry. Do not light the lander for the next burn.`
    : `${xferName} 干了，下一刀不要点着陆器。`;
}

function thoughtLanderEarly(landerName, lang) {
  const en = loc(lang) === 'en';
  const extra = landerName && landerName !== (en ? 'lander' : '着陆器')
    ? (en ? ` (${landerName})` : `（${landerName}）`)
    : '';
  return en
    ? `Lander${extra} is already lit, transfer not jettisoned yet. Do not burn the lander on this cut.`
    : `已经点着陆器${extra}，还没丢掉转移级。下一刀不要拿着陆器烧。`;
}

function thoughtDead(check, lang) {
  const orbit = orbitOf(check);
  const en = loc(lang) === 'en';
  if (orbit) return en ? `Vessel dead. Orbit ${orbit}.` : `船毁了。轨道 ${orbit}。`;
  return en ? 'Vessel dead.' : '船毁了。';
}

function thoughtSuborbital(check, lang) {
  if (check?.peKm == null || !Number.isFinite(check.peKm)) return '';
  const pe = `${check.peKm.toFixed(0)} km`;
  const orbit = orbitOf(check);
  const en = loc(lang) === 'en';
  if (orbit) {
    return en
      ? `Pe ${pe}, still in atmosphere. Orbit ${orbit}.`
      : `近拱点 ${pe}，还在大气里。轨道 ${orbit}。`;
  }
  return en ? `Pe ${pe}, still in atmosphere.` : `近拱点 ${pe}，还在大气里。`;
}

function thoughtPreStep(label, fuelKg, lang) {
  const fuel = fmtFuelKg(fuelKg);
  const en = loc(lang) === 'en';
  const name = label || (en ? 'cut' : '这一刀');
  if (fuel) {
    return en ? `Next cut: ${name}. Fuel ${fuel}.` : `下一刀：${name}。剩油 ${fuel}。`;
  }
  return en ? `Next cut: ${name}.` : `下一刀：${name}。`;
}

/**
 * @param {{
 *   check?: object,
 *   design?: object,
 *   parts?: object[],
 *   state?: object,
 *   plan?: object,
 *   lang?: string,
 *   when?: 'pre-step'|'post-step'|'inspect',
 * }} input
 * @returns {{ thoughts: string[], thought: string, flags: object, roles: object, transferFuelKg: number|null, landerFuelKg: number|null }}
 */
export function runChecks(input = {}) {
  const lang = loc(input.lang);
  const when = input.when || 'inspect';
  const state = input.state ?? {};
  const plan = input.plan ?? state.plan ?? null;
  const check = input.check ?? {};
  const roles = identifyRoles(input.design);
  const { current, next } = currentAndNext(state);
  const thoughts = [];
  const flags = {
    budgetFail: false,
    transferDry: false,
    landerEarly: false,
    dead: false,
    suborbital: false,
  };

  const budget = plan && plan.ok === false ? plan.fail?.[0] : null;
  if (budget && (when === 'pre-step' || when === 'inspect')) {
    const t = formatBudgetFail(budget, lang);
    if (t) {
      thoughts.push(t);
      flags.budgetFail = true;
    }
  }

  const xferFuel = transferFuelOf(input, roles);
  const danger = isDangerNode(state, current) || isDangerNode(state, next);
  if (roles.transfer && xferFuel != null && xferFuel <= DRY_KG && danger) {
    const name = roleLabel('transfer', roles.transfer.nickname, lang);
    thoughts.push(thoughtTransferDry(name, xferFuel, lang));
    flags.transferDry = true;
  }

  if (roles.transfer && landerIsLive(input, roles) && beforeJettisonOrLand(state)) {
    const name = roleLabel('lander', roles.lander?.nickname, lang);
    thoughts.push(thoughtLanderEarly(name, lang));
    flags.landerEarly = true;
  }

  const ascentDone = (state.nodes ?? []).some((n) => n.id === 'ascent' && n.status === 'done');
  if (when !== 'pre-step') {
    if (check.dead) {
      thoughts.push(thoughtDead(check, lang));
      flags.dead = true;
    } else if (!check.landed && ascentDone) {
      const atmo = atmoKmOf(check);
      if (check.peKm != null && Number.isFinite(check.peKm) && atmo != null && check.peKm < atmo) {
        const t = thoughtSuborbital(check, lang);
        if (t) {
          thoughts.push(t);
          flags.suborbital = true;
        }
      }
    }
  }

  if (when === 'pre-step' && thoughts.length === 0 && current) {
    thoughts.push(thoughtPreStep(current.label, check.fuelKg, lang));
  }

  return {
    thoughts,
    thought: thoughts[thoughts.length - 1] || '',
    flags,
    roles,
    transferFuelKg: xferFuel,
    landerFuelKg: fuelInRole(input.parts, roles.lander),
    currentId: current?.id ?? null,
    nextId: next?.id ?? null,
  };
}

/** Pad + failed budget: obvious "don't ignite" case. Caller may warn or refuse. */
export function shouldRefuseStep(input = {}) {
  const state = input.state ?? {};
  const plan = input.plan ?? state.plan ?? null;
  const check = input.check ?? {};
  const { current } = currentAndNext(state);
  if (plan && plan.ok === false && check.landed && current?.id === 'ascent') {
    const fail = plan.fail?.[0];
    return {
      refuse: true,
      reason: 'budget-pad',
      thought: fail ? formatBudgetFail(fail, input.lang) : '',
    };
  }
  return { refuse: false, reason: null, thought: '' };
}
