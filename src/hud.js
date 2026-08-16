// DOM HUD: readouts, stage list, orbit panel, messages, banners, endcard.

import { fmtTime, fmtDist, BODIES } from './constants.js';
import { feedTanks } from './vessel.js';
import { t, bodyName, getLang, stageLabel } from './i18n.js';
import { ecCap } from './power.js';

const $ = (id) => document.getElementById(id);

function bodyLabel(id) {
  const n = bodyName(id);
  return getLang() === 'en' ? n.toUpperCase() : n;
}

export const HUD = {
  setMET(tSec) { $('met').textContent = `T+ ${fmtTime(tSec)}`; },

  setSituation(text) { $('situation').textContent = text; },

  setWarp(w, rails) {
    $('warp-display').textContent = `${t('hud.warp')} ${w}×${rails ? ` (${t('hud.rails')})` : ''}`;
    $('warp-display').style.color = w > 1 ? '#ffd479' : '#7e93b0';
  },

  setThrottle(th) { $('throttle-fill').style.height = `${(th * 100).toFixed(0)}%`; },

  setSAS(on, mode) {
    $('sas-ind').classList.toggle('on', on);
    $('sas-mode-ind').textContent = {
      hold: t('sas.hold'),
      prograde: t('sas.prograde'),
      retrograde: t('sas.retrograde'),
    }[mode] ?? '';
  },

  readouts(info, st, vspeed) {
    $('ro-alt').textContent = `${t('hud.alt')} ${fmtDist(Math.max(0, info.alt))}`;
    $('ro-agl').textContent = `${t('hud.agl')} ${fmtDist(Math.max(0, info.agl))}`;
    $('ro-vspeed').textContent = `${t('hud.vspd')} ${vspeed >= 0 ? '+' : ''}${vspeed.toFixed(1)} m/s`;
    $('ro-accel').textContent = `${t('hud.acc')} ${info.accelG.toFixed(1)} g`;
    $('ro-speed').textContent = `${info.alt > 60_000 ? t('hud.orb') : t('hud.srf')} ${info.speed.toFixed(info.speed < 100 ? 1 : 0)} m/s`;
    $('ro-mode').textContent = info.alt > 60_000 ? t('hud.orbVel') : t('hud.srfVel');
    $('ro-mass').textContent = `${t('hud.mass')} ${(st.massProps.m / 1000).toFixed(2)} t`;
    const ecEl = $('ro-ec');
    if (ecEl) {
      const cap = ecCap(st);
      const ec = st.ec ?? 0;
      ecEl.textContent = `${t('hud.ec')} ${ec.toFixed(0)} / ${cap.toFixed(0)}`;
      if (ec <= 0 || cap <= 0) ecEl.style.color = '#ff5040';
      else if (ec < 0.2 * cap) ecEl.style.color = '#ffae42';
      else ecEl.style.color = '';
    }
    const tf = info.maxTempFrac;
    const el = $('ro-temp');
    if (tf > 0.85) { el.textContent = t('hud.tempCrit'); el.style.color = '#ff5040'; }
    else if (tf > 0.6) { el.textContent = t('hud.tempHigh'); el.style.color = '#ffae42'; }
    else { el.textContent = t('hud.tempOk'); el.style.color = '#5d7088'; }
  },

  /** Stage list + fuel bars. */
  stages(plan, stageIndex, parts, sections) {
    const list = $('stage-list');
    list.innerHTML = plan.map((ev, i) => {
      const cls = i < stageIndex ? 'spent' : i === stageIndex ? 'current' : '';
      const names = [
        ...ev.ignite.map((k) => parts.find((p) => p.key === k)?.def.name).filter(Boolean),
        ev.decouple !== null ? t('stage.decouple') : null,
        ev.dropRadials.length ? t('stage.dropBoosters') : null,
        ev.chutes ? t('stage.parachutes') : null,
      ].filter(Boolean).join(', ');
      return `<div class="stage-block ${cls}"><span class="sname">S${plan.length - 1 - i}</span> ${names || stageLabel(ev.label)}</div>`;
    }).join('');

    // one gauge per tank, top-to-bottom; tanks feeding a lit engine highlighted
    const litSections = new Set();
    for (const ep of parts) {
      if (ep.alive && ep.ignited && ep.def.engine && !ep.def.engine.srb) {
        for (const tk of feedTanks(parts, sections, ep)) litSections.add(tk.key);
      }
    }
    const tanks = parts
      .filter((p) => p.alive && p.def.fuel)
      .sort((a, b) => a.stackIndex - b.stackIndex);
    $('resource-bars').innerHTML = tanks.map((tk) => {
      const cap = tk.def.fuel * tk.sym;
      const active = litSections.has(tk.key) || (tk.def.engine?.srb && tk.ignited && tk.fuel > 0);
      const label = tk.def.engine?.srb ? `${tk.def.name} ×${tk.sym}` : tk.def.name;
      return `
      <div class="bar-row${active ? '' : ' inactive'}">
        <div class="bar-label"><span>${active ? '▶ ' : ''}${label}</span><span>${tk.fuel.toFixed(0)} kg</span></div>
        <div class="bar-track"><div class="bar-fill ${tk.def.engine?.srb ? '' : 'fuel'}" style="width:${(100 * tk.fuel / Math.max(1, cap)).toFixed(1)}%"></div></div>
      </div>`;
    }).join('');
  },

  orbit(st, els, extra) {
    const body = BODIES[st.body];
    const name = bodyLabel(st.body);
    const title = getLang() === 'en' && body.aka ? `${name} / ${body.aka}` : name;
    $('orbit-title').textContent = `${t('hud.orbit')} — ${title}`;
    const R = BODIES[st.body].radius;
    const rows = [];
    const row = (k, v) => rows.push(`<div><span class="k">${k}</span>${v}</div>`);
    if (els) {
      row(t('orb.ap'), els.a > 0 ? fmtDist(els.ra - R) : '—');
      row(t('orb.pe'), fmtDist(els.rp - R));
      if (extra.tAp !== null && isFinite(extra.tAp)) row(t('orb.tAp'), fmtTime(extra.tAp));
      if (isFinite(extra.tPe)) row(t('orb.tPe'), fmtTime(extra.tPe));
      row(t('orb.ecc'), els.e.toFixed(3));
      if (els.period) row(t('orb.period'), fmtTime(els.period));
      row(t('orb.inc'), `${(Math.acos(Math.min(1, Math.abs(els.what.y))) * 180 / Math.PI).toFixed(1)}°`);
    }
    if (extra.phase !== null) {
      row(t('orb.munPhase'), `${extra.phase.toFixed(1)}° <span class="dim">${t('orb.burnAt', { deg: extra.transferPhase.toFixed(0) })}</span>`);
    }
    if (extra.dunaPhase != null && Number.isFinite(extra.dunaPhase)) {
      const tgt = extra.dunaTarget ?? 0;
      row(t('orb.dunaWindow'), `${extra.dunaPhase.toFixed(1)}° <span class="dim">${t('orb.hohmann', { deg: tgt.toFixed(0) })}</span>`);
    }
    if (extra.vesselDunaPhase != null && Number.isFinite(extra.vesselDunaPhase)) {
      row(t('orb.dunaPhase'), `${extra.vesselDunaPhase.toFixed(1)}°`);
    }
    if (extra.encounter) {
      const child = extra.encounter.child || 'mun';
      row(t('orb.encounter', { name: bodyLabel(child) }), '');
      row(t('orb.soiEntry'), fmtTime(extra.encounter.tEnter - st.t));
      const pe = extra.encounter.periapsis ?? extra.encounter.munPeriapsis;
      row(child === 'mun' ? t('orb.munPe') : t('orb.bodyPe', { name: bodyName(child) }), fmtDist(pe));
    }
    if (extra.targetNav && extra.targetNav.range_m != null) {
      row(t('hud.target'), extra.targetName ?? extra.targetNav.target ?? '—');
      row(t('hud.range'), fmtDist(extra.targetNav.range_m));
      const c = extra.targetNav.closing_ms;
      row(t('hud.closing'), `${c >= 0 ? '+' : ''}${c.toFixed(1)} m/s`);
      if (extra.dockState) row(t('hud.dock'), t(`hud.dock${extra.dockState[0].toUpperCase()}${extra.dockState.slice(1)}`));
    }
    $('orbit-data').innerHTML = rows.join('');
  },

  targetReadouts(nav, dockState, name) {
    const box = $('rdv-panel');
    if (!box) return;
    if (!nav || nav.range_m == null) {
      box.classList.add('hidden');
      return;
    }
    box.classList.remove('hidden');
    const el = (id, s) => { const n = $(id); if (n) n.textContent = s; };
    el('ro-target', `${t('hud.target')} ${name ?? nav.target ?? ''}`);
    el('ro-range', `${t('hud.range')} ${fmtDist(nav.range_m)}`);
    const c = nav.closing_ms;
    el('ro-closing', `${t('hud.closing')} ${c >= 0 ? '+' : ''}${Number(c).toFixed(1)} m/s`);
    const ds = dockState ?? 'free';
    const key = `hud.dock${ds[0].toUpperCase()}${ds.slice(1)}`;
    el('ro-dock', `${t('hud.dock')} ${t(key)}`);
  },

  msg(text, cls = '') {
    const log = $('msglog');
    const div = document.createElement('div');
    div.className = `msg ${cls}`;
    div.textContent = text;
    log.appendChild(div);
    while (log.children.length > 6) log.removeChild(log.firstChild);
    setTimeout(() => div.classList.add('fade'), 3500);
    setTimeout(() => div.remove(), 5000);
  },

  banner(text, ms = 4200) {
    const b = $('banner');
    b.textContent = text;
    b.classList.remove('hidden');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => b.classList.add('hidden'), ms);
  },

  endcard(title, text, good = false) {
    $('endcard-title').textContent = title;
    $('endcard-title').className = good ? 'good' : '';
    $('endcard-text').innerHTML = text;
    $('endcard').classList.remove('hidden');
  },

  hideEndcard() { $('endcard').classList.add('hidden'); },

  toggleHelp(force) {
    const h = $('help');
    const show = force ?? h.classList.contains('hidden');
    h.classList.toggle('hidden', !show);
  },
};
