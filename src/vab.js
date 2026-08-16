// Vehicle Assembly Building: palette, stack/radial editing, staging stats,
// craft save/load, stock craft, 3D preview.

import * as THREE from 'three/webgpu';
import { PARTS, CATEGORIES, RADIAL_PARTS, partInfoHTML } from './parts.js';
import { buildVesselParts, stagingStats, stackGeometry } from './vessel.js';
import { buildVesselGroup, setLegs } from './vesselviz.js';
import { STOCK } from './stock.js';
import { t, STRINGS, stageLabel } from './i18n.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'moonshot-crafts';

function untitledNames() {
  return [STRINGS.en['vab.untitled'], STRINGS.zh['vab.untitled']];
}

export class VAB {
  /** ctx: { scene, camera, onLaunch } — scene/camera owned by main. */
  constructor(ctx) {
    this.ctx = ctx;
    this.design = { name: t('vab.untitled'), stack: [], radials: [] };
    this.selected = -1;       // selected stack index
    this.group = null;
    this.activeCategory = 'Pods';
    this.buildUI();
  }

  buildUI() {
    this.renderTabs();
    this.renderPalette();

    const radialSel = $('radial-part');
    for (const id of RADIAL_PARTS) {
      const o = document.createElement('option');
      o.value = id; o.textContent = PARTS[id].name;
      radialSel.appendChild(o);
    }

    $('btn-radial-add').onclick = () => this.addRadial();
    $('btn-clear').onclick = () => { this.design = { name: this.design.name, stack: [], radials: [] }; this.refresh(); };
    $('btn-save').onclick = () => this.save();
    $('load-select').onchange = (e) => { if (e.target.value) this.load(e.target.value); };
    $('btn-stock-hopper').onclick = () => this.loadStock('Suborbital Hopper');
    $('btn-stock-mun').onclick = () => this.loadStock('Mun Express');
    $('btn-stock-duna').onclick = () => this.loadStock('Duna Hauler');
    $('btn-launch').onclick = () => this.launch();
    $('craft-name').value = this.design.name;
    $('craft-name').oninput = (e) => { this.design.name = e.target.value || t('vab.untitled'); };
    this.refreshLoadList();
  }

  renderTabs() {
    const tabs = $('palette-tabs');
    if (!tabs.children.length) {
      for (const cat of CATEGORIES) {
        const b = document.createElement('button');
        b.dataset.cat = cat;
        b.onclick = () => { this.activeCategory = cat; this.renderPalette(); };
        tabs.appendChild(b);
      }
    }
    [...tabs.children].forEach((b) => {
      b.textContent = t(`cat.${b.dataset.cat}`);
      b.classList.toggle('active', b.dataset.cat === this.activeCategory);
    });
  }

  renderPalette() {
    this.renderTabs();
    const pal = $('palette');
    pal.innerHTML = '';
    for (const [id, def] of Object.entries(PARTS)) {
      if (def.category !== this.activeCategory) continue;
      const b = document.createElement('button');
      b.className = 'part-btn';
      const meta = def.engine
        ? `${(def.engine.thrustVac / 1000).toFixed(0)} kN · Isp ${def.engine.ispVac}s`
        : def.fuel ? t('vab.fuelKg', { n: def.fuel }) : `${(def.mass / 1000).toFixed(2)} t`;
      b.innerHTML = `<span class="pname">${def.name}</span><span class="pmeta">${def.size} m · ${meta}</span>`;
      b.onmouseenter = () => { $('part-info').innerHTML = partInfoHTML(def); };
      b.onclick = () => this.addStackPart(id);
      pal.appendChild(b);
    }
  }

  addStackPart(id) {
    if (PARTS[id].radial && !PARTS[id].decoupler) {
      // radial-only parts can't go in the stack (except none currently)
      if (id === 'srb' || id === 'fins' || id === 'legs' || id === 'legs-xl') {
        $('part-info').innerHTML = `<b>${t('vab.radialOnly', { name: PARTS[id].name })}</b>`;
        return;
      }
    }
    const at = this.selected >= 0 ? this.selected + 1 : this.design.stack.length;
    this.design.stack.splice(at, 0, id);
    // shift radial hosts below the insertion point
    for (const r of this.design.radials) if (r.host >= at) r.host++;
    this.selected = at;
    this.refresh();
  }

  addRadial() {
    if (this.selected < 0 || !this.design.stack[this.selected]) {
      $('part-info').innerHTML = t('vab.selectStack');
      return;
    }
    const part = $('radial-part').value;
    // legs/fins are already full ×4 sets — symmetry doesn't apply
    const sym = (PARTS[part].fins || PARTS[part].legs) ? 1 : parseInt($('radial-sym').value, 10);
    this.design.radials.push({ part, sym, host: this.selected });
    this.refresh();
  }

  removeStackPart(i) {
    this.design.stack.splice(i, 1);
    this.design.radials = this.design.radials.filter((r) => r.host !== i);
    for (const r of this.design.radials) if (r.host > i) r.host--;
    if (this.selected >= this.design.stack.length) this.selected = this.design.stack.length - 1;
    this.refresh();
  }

  moveStackPart(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= this.design.stack.length) return;
    const s = this.design.stack;
    [s[i], s[j]] = [s[j], s[i]];
    for (const r of this.design.radials) {
      if (r.host === i) r.host = j;
      else if (r.host === j) r.host = i;
    }
    this.selected = j;
    this.refresh();
  }

  refresh() {
    this.syncUntitledName();
    this.renderTabs();
    this.renderPalette();
    this.renderStackList();
    this.renderStats();
    this.rebuildPreview();
  }

  syncUntitledName() {
    const names = untitledNames();
    if (names.includes(this.design.name) || names.includes($('craft-name').value)) {
      this.design.name = t('vab.untitled');
      $('craft-name').value = this.design.name;
    }
  }

  renderStackList() {
    const list = $('stack-list');
    list.innerHTML = '';
    if (!this.design.stack.length) {
      list.innerHTML = `<div class="dim">${t('vab.emptyStack')}</div>`;
      return;
    }
    this.design.stack.forEach((id, i) => {
      const item = document.createElement('div');
      item.className = 'stack-item' + (i === this.selected ? ' selected' : '');
      const name = document.createElement('span');
      name.className = 'pname';
      name.textContent = PARTS[id].name;
      item.appendChild(name);
      for (const [sym, fn] of [['↑', () => this.moveStackPart(i, -1)], ['↓', () => this.moveStackPart(i, 1)], ['✕', () => this.removeStackPart(i)]]) {
        const b = document.createElement('button');
        b.textContent = sym;
        b.onclick = (e) => { e.stopPropagation(); fn(); };
        item.appendChild(b);
      }
      item.onclick = () => { this.selected = i; this.renderStackList(); };
      list.appendChild(item);

      this.design.radials.forEach((r, ri) => {
        if (r.host !== i) return;
        const rl = document.createElement('div');
        rl.className = 'stack-item radial';
        const rn = document.createElement('span');
        rn.className = 'pname';
        rn.textContent = `${PARTS[r.part].name} ×${r.sym}`;
        rl.appendChild(rn);
        const del = document.createElement('button');
        del.textContent = '✕';
        del.onclick = () => { this.design.radials.splice(ri, 1); this.refresh(); };
        rl.appendChild(del);
        list.appendChild(rl);
      });
    });
  }

  renderStats() {
    const stats = stagingStats(this.design);
    $('stage-stats').innerHTML = stats.length
      ? stats.map((s, i) => `
        <div class="stage-block">
          <span class="sname">${t('vab.stageN', { n: stats.length - i })}</span> — ${stageLabel(s.label)}<br>
          Δv <b>${s.dv.toFixed(0)} m/s</b> · TWR ${s.twrSL.toFixed(2)} SL / ${s.twrVac.toFixed(2)} ${t('part.vac')}<br>
          <span class="dim">${t('vab.burn', { s: s.burnTime.toFixed(0), mass: (s.wet / 1000).toFixed(1) })}</span>
        </div>`).join('')
      : `<div class="dim">${t('vab.noEnginesStaged')}</div>`;

    const parts = buildVesselParts(this.design);
    const geom = stackGeometry(parts);
    const wet = parts.reduce((s, p) => s + p.def.mass * p.sym + p.fuel + (p.ablator || 0), 0);
    const totalDv = stats.reduce((s, x) => s + x.dv, 0);
    $('craft-stats').innerHTML =
      `${t('vab.partsLine', { n: parts.length, h: geom.totalLength.toFixed(1) })} <b>${(wet / 1000).toFixed(2)} t</b><br>` +
      `${t('vab.totalDv')} <b>${totalDv.toFixed(0)} m/s</b><br>` +
      `<span class="dim">${t('vab.munHint')}</span>`;
  }

  rebuildPreview() {
    const { scene } = this.ctx;
    if (this.group) scene.remove(this.group);
    const parts = buildVesselParts(this.design);
    const { group, meshByKey } = buildVesselGroup(parts);
    setLegs(meshByKey, parts, true);
    this.group = group;
    scene.add(group);
    const h = group.userData.geom.totalLength;
    this.ctx.frame(h); // let main position the camera for a rocket of height h
  }

  save() {
    const all = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    all[this.design.name] = this.design;
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
    this.refreshLoadList();
    $('part-info').textContent = t('vab.saved', { name: this.design.name });
  }

  refreshLoadList() {
    const sel = $('load-select');
    while (sel.options.length > 1) sel.remove(1);
    const all = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    for (const name of Object.keys(all)) {
      const o = document.createElement('option');
      o.value = name; o.textContent = name;
      sel.appendChild(o);
    }
  }

  load(name) {
    const all = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    if (!all[name]) return;
    this.design = all[name];
    this.design.radials ??= [];
    $('craft-name').value = this.design.name;
    this.selected = -1;
    this.refresh();
  }

  loadStock(name) {
    this.design = structuredClone(STOCK[name]);
    this.design.name = name;
    $('craft-name').value = name;
    this.selected = -1;
    this.refresh();
  }

  /** Restore workshop fields from a game save (not a craft file). */
  applyWorkshop(workshop) {
    const w = workshop || {};
    this.design = {
      name: w.name || t('vab.untitled'),
      stack: Array.isArray(w.stack) ? [...w.stack] : [],
      radials: Array.isArray(w.radials) ? structuredClone(w.radials) : [],
    };
    this.selected = Number.isInteger(w.selected) ? w.selected : -1;
    if (this.selected >= this.design.stack.length) this.selected = this.design.stack.length - 1;
    $('craft-name').value = this.design.name;
    this.refresh();
  }

  launch() {
    const parts = buildVesselParts(this.design);
    if (!parts.some((p) => p.def.pod)) {
      $('part-info').innerHTML = `<b style="color:#ff8d7e">${t('vab.noPod')}</b>`;
      return;
    }
    if (!parts.some((p) => p.def.engine)) {
      $('part-info').innerHTML = `<b style="color:#ff8d7e">${t('vab.noEngine')}</b>`;
      return;
    }
    this.ctx.onLaunch(structuredClone(this.design));
  }

  show() {
    $('vab').classList.remove('hidden');
    if (!this.group) this.refresh();
  }

  hide() { $('vab').classList.add('hidden'); }
}
