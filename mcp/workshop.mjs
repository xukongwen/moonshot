// DOM-free Vehicle Assembly workshop. Same design rules as src/vab.js so
// headless MCP can build, save, and launch crafts without a browser.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARTS } from '../src/parts.js';
import { STOCK } from '../src/stock.js';
import { buildVesselParts, stagingStats, stackGeometry } from '../src/vessel.js';
import { t } from '../src/i18n.js';

const DEFAULT_CRAFTS = join(dirname(fileURLToPath(import.meta.url)), 'crafts.json');

function validIds() {
  return Object.keys(PARTS).join(', ');
}

function requirePart(id) {
  if (!PARTS[id]) {
    throw new Error(`Unknown part "${id}". Valid ids: ${validIds()}`);
  }
  return PARTS[id];
}

export class Workshop {
  /** opts.craftsPath — persist file; default mcp/crafts.json. Inject in tests. */
  constructor(opts = {}) {
    this.craftsPath = opts.craftsPath ?? DEFAULT_CRAFTS;
    this.design = { name: t('vab.untitled'), stack: [], radials: [] };
    this.selected = -1;
  }

  addStackPart(id, at) {
    const def = requirePart(id);
    if (def.radial && !def.decoupler && (id === 'srb' || id === 'fins' || id === 'legs' || id === 'legs-xl')) {
      throw new Error(t('vab.radialOnly', { name: def.name }));
    }
    const insert = at != null
      ? Math.max(0, Math.min(this.design.stack.length, Number(at)))
      : (this.selected >= 0 ? this.selected + 1 : this.design.stack.length);
    this.design.stack.splice(insert, 0, id);
    for (const r of this.design.radials) if (r.host >= insert) r.host++;
    this.selected = insert;
    return this.snapshot();
  }

  removeStackPart(i) {
    const idx = Number(i);
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.design.stack.length) {
      throw new Error(`Invalid stack index ${i}. Stack length ${this.design.stack.length}.`);
    }
    this.design.stack.splice(idx, 1);
    this.design.radials = this.design.radials.filter((r) => r.host !== idx);
    for (const r of this.design.radials) if (r.host > idx) r.host--;
    if (this.selected >= this.design.stack.length) this.selected = this.design.stack.length - 1;
    return this.snapshot();
  }

  moveStackPart(i, dir) {
    const idx = Number(i);
    const d = Number(dir);
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.design.stack.length) {
      throw new Error(`Invalid stack index ${i}. Stack length ${this.design.stack.length}.`);
    }
    const j = idx + d;
    if (j < 0 || j >= this.design.stack.length) return this.snapshot();
    const s = this.design.stack;
    [s[idx], s[j]] = [s[j], s[idx]];
    for (const r of this.design.radials) {
      if (r.host === idx) r.host = j;
      else if (r.host === j) r.host = idx;
    }
    this.selected = j;
    return this.snapshot();
  }

  addRadial(part, sym, host) {
    requirePart(part);
    const h = host != null ? Number(host) : this.selected;
    if (!Number.isInteger(h) || h < 0 || !this.design.stack[h]) {
      throw new Error(t('vab.selectStack'));
    }
    const def = PARTS[part];
    const n = (def.fins || def.legs) ? 1 : Math.max(1, Number(sym) || 1);
    this.design.radials.push({ part, sym: n, host: h });
    return this.snapshot();
  }

  removeRadial(i) {
    const idx = Number(i);
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.design.radials.length) {
      throw new Error(`Invalid radial index ${i}. Radials length ${this.design.radials.length}.`);
    }
    this.design.radials.splice(idx, 1);
    return this.snapshot();
  }

  clear() {
    this.design = { name: this.design.name, stack: [], radials: [] };
    this.selected = -1;
    return this.snapshot();
  }

  setName(name) {
    this.design.name = (name && String(name).trim()) || t('vab.untitled');
    return this.snapshot();
  }

  select(i) {
    const idx = Number(i);
    if (idx === -1) {
      this.selected = -1;
      return this.snapshot();
    }
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.design.stack.length) {
      throw new Error(`Invalid stack index ${i}. Use -1 for none, or 0..${this.design.stack.length - 1}.`);
    }
    this.selected = idx;
    return this.snapshot();
  }

  loadStock(name) {
    const src = STOCK[name];
    if (!src) {
      throw new Error(`Unknown stock craft "${name}". Available: ${Object.keys(STOCK).join(', ')}`);
    }
    this.design = structuredClone(src);
    this.design.name = name;
    this.design.radials ??= [];
    this.selected = -1;
    return this.snapshot();
  }

  /** Replace the current VAB design (used by ksp_redesign). */
  applyDesign(design) {
    if (!design || !Array.isArray(design.stack)) {
      throw new Error('applyDesign requires { name, stack, radials }');
    }
    this.design = {
      name: design.name || this.design.name,
      stack: [...design.stack],
      radials: (design.radials ?? []).map((r) => ({ part: r.part, sym: r.sym, host: r.host })),
    };
    this.selected = -1;
    return this.snapshot();
  }

  stats() {
    const stages = stagingStats(this.design);
    const parts = buildVesselParts(this.design);
    const geom = stackGeometry(parts);
    const wet = parts.reduce((s, p) => s + p.def.mass * p.sym + p.fuel + (p.ablator || 0), 0);
    const totalDv = stages.reduce((s, x) => s + x.dv, 0);
    return {
      stages: stages.map((s) => ({
        label: s.label,
        dv: s.dv,
        twrSL: s.twrSL,
        twrVac: s.twrVac,
        burnTime: s.burnTime,
        wet: s.wet,
        prop: s.prop,
      })),
      parts: parts.length,
      height_m: geom.totalLength,
      mass_t: wet / 1000,
      totalDv,
    };
  }

  validateLaunch() {
    const parts = buildVesselParts(this.design);
    if (!parts.some((p) => p.def.pod)) return { ok: false, error: t('vab.noPod') };
    if (!parts.some((p) => p.def.engine)) return { ok: false, error: t('vab.noEngine') };
    return { ok: true };
  }

  snapshot() {
    return {
      name: this.design.name,
      stack: [...this.design.stack],
      radials: this.design.radials.map((r) => ({ part: r.part, sym: r.sym, host: r.host })),
      selected: this.selected,
      stats: this.stats(),
      parts: this.design.stack.map((id, i) => ({
        id,
        name: PARTS[id]?.name ?? id,
        index: i,
        category: PARTS[id]?.category,
      })),
      radialParts: this.design.radials.map((r, i) => ({
        index: i,
        part: r.part,
        name: PARTS[r.part]?.name ?? r.part,
        sym: r.sym,
        host: r.host,
      })),
      design: structuredClone(this.design),
    };
  }

  readAll() {
    try {
      const data = JSON.parse(readFileSync(this.craftsPath, 'utf8'));
      if (data && typeof data === 'object' && !Array.isArray(data)) return data;
      return {};
    } catch (err) {
      if (err.code === 'ENOENT') return {};
      throw err;
    }
  }

  writeAll(all) {
    mkdirSync(dirname(this.craftsPath), { recursive: true });
    writeFileSync(this.craftsPath, JSON.stringify(all, null, 2) + '\n');
  }

  save(name) {
    if (name != null) this.setName(name);
    const all = this.readAll();
    all[this.design.name] = structuredClone(this.design);
    this.writeAll(all);
    return { saved: this.design.name, ...this.snapshot() };
  }

  load(name) {
    const all = this.readAll();
    if (!all[name]) {
      const saved = Object.keys(all).join(', ') || '(none)';
      throw new Error(`No saved craft "${name}". Saved: ${saved}`);
    }
    this.design = structuredClone(all[name]);
    this.design.radials ??= [];
    this.design.stack ??= [];
    if (!this.design.name) this.design.name = name;
    this.selected = -1;
    return this.snapshot();
  }

  listSaved() {
    return Object.keys(this.readAll());
  }

  deleteSaved(name) {
    const all = this.readAll();
    if (!all[name]) {
      const saved = Object.keys(all).join(', ') || '(none)';
      throw new Error(`No saved craft "${name}". Saved: ${saved}`);
    }
    delete all[name];
    this.writeAll(all);
    return { deleted: name, saved: Object.keys(all) };
  }
}

export function listPartsCatalog() {
  return Object.entries(PARTS).map(([id, def]) => ({
    id,
    name: def.name,
    category: def.category,
    size: def.size,
    mass: def.mass,
    fuel: def.fuel ?? 0,
    engine: def.engine
      ? {
        thrustVac: def.engine.thrustVac,
        ispVac: def.engine.ispVac,
        ispSL: def.engine.ispSL,
        throttleable: def.engine.throttleable,
        srb: !!def.engine.srb,
      }
      : null,
    radial: !!def.radial,
  }));
}

export { DEFAULT_CRAFTS };
