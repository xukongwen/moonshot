// Readable flight recorder for headless Moonshot flights.
// Events + adaptive telemetry, markdown + JSONL.

import { mkdirSync, writeFileSync, appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { BODIES, fmtTime, fmtDist } from '../src/constants.js';

const JSONL_PATH = '/workspace/moonshot/logs/flight.jsonl';
const DEFAULT_MD = '/workspace/moonshot/ROUNDTRIP_LOG.md';

const DEFAULT_CAPTIONS = {
  '01-pad': 'Pad / prelaunch — Mun Express on the Kerbin pad',
  '02-lko': 'LKO after MECO — stable Kerbin orbit',
  '02-lko-map': 'LKO map',
  '03-tli': 'TLI cutoff — trans-Munar coast, still Kerbin SOI',
  '03-tli-map': 'TLI map (transfer + Mun encounter)',
  '03-minmus-soi': 'Minmus SOI / approaching Minmus',
  '03-minmus-soi-map': 'Minmus SOI map',
  '04-mun-soi': 'Mun SOI / approaching the Mun',
  '04-mun-soi-map': 'Mun SOI map',
  '04-minmus-orbit': 'Minmus orbit after MOI',
  '04-minmus-orbit-map': 'Minmus orbit map',
  '05-mun-orbit': 'Mun orbit after MOI',
  '05-mun-orbit-map': 'Mun orbit map',
  '05-escape': 'Escape burn — leaving Kerbin SOI',
  '05-escape-map': 'Escape burn map — Kerbin system (Mun + Minmus)',
  '06-mun-revs': 'After 3 Mun revolutions',
  '06-mun-revs-map': 'Mun revs map',
  '06-soi-exit': 'Kerbin SOI exit — now orbiting Kerbol',
  '06-soi-exit-map': 'Kerbin SOI exit map — solar frame',
  '07-tki': 'Kerbin return / TKI cutoff',
  '07-tki-map': 'TKI map',
  '07-solar': 'Solar orbit around Kerbol',
  '07-solar-map': 'Solar map — Kerbol, Kerbin, Duna',
  '08-return': 'Return coast / reentry (or abort state)',
  '08-return-map': 'Return map',
};

export class FlightLog {
  constructor(session, {
    craft = 'Mun Express',
    pilot = 'autopilot (`mcp/roundtrip.mjs`)',
    title = 'MOONSHOT — Round-trip Flight Log',
    mdPath = DEFAULT_MD,
    captions = null,
    wipeJsonl = true,
    extraMarkdown = '',
  } = {}) {
    this.session = session;
    this.craft = craft;
    this.pilot = pilot;
    this.title = title;
    this.mdPath = mdPath;
    this.captions = { ...DEFAULT_CAPTIONS, ...(captions || {}) };
    this.extraMarkdown = extraMarkdown;
    this.entries = [];
    this.lastSample = -1e9;
    this.result = 'in progress';
    this.jsonlPath = JSONL_PATH;
    mkdirSync('/workspace/moonshot/logs', { recursive: true });
    mkdirSync('/workspace/moonshot/logs/snapshots', { recursive: true });
    if (wipeJsonl) writeFileSync(this.jsonlPath, '');
  }

  /** Serializable flight state for in-game screenshot rendering. */
  snapshot(tag) {
    const st = this.session?.st;
    if (!st) return null;
    const safe = String(tag).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_|_$/g, '') || 'snap';
    const data = {
      tag,
      t: st.t,
      body: st.body,
      pos: [st.pos.x, st.pos.y, st.pos.z],
      vel: [st.vel.x, st.vel.y, st.vel.z],
      quat: [st.quat.x, st.quat.y, st.quat.z, st.quat.w],
      throttle: st.throttle,
      landed: !!st.landed,
      dead: !!st.dead,
      craft: this.session.craftName,
      parts: st.parts.map((p) => ({
        key: p.key,
        fuel: p.fuel,
        ignited: !!p.ignited,
        chuteState: p.chuteState ?? null,
        legsDown: p.legsDown ?? null,
        alive: !!p.alive,
        stackIndex: p.stackIndex,
      })),
    };
    const path = `/workspace/moonshot/logs/snapshots/${safe}.json`;
    writeFileSync(path, JSON.stringify(data, null, 2));
    console.log(`  [snapshot] ${path}`);
    return path;
  }

  snap() {
    const t = this.session.telemetry();
    return {
      t: t.t,
      body: t.body,
      alt: t.alt_m,
      v: t.speed_ms,
      m: t.mass_t * 1000,
      fuel: t.fuel_kg,
      thr: t.throttle,
      situation: t.situation,
      pe: t.pe_m,
      ap: t.ap_m,
    };
  }

  appendJsonl(entry) {
    appendFileSync(this.jsonlPath, JSON.stringify(entry) + '\n');
  }

  evt(tag, msg) {
    const s = this.snap();
    const entry = { kind: 'evt', tag, msg, ...s };
    this.entries.push(entry);
    this.appendJsonl(entry);
    const met = 'T+' + fmtTime(s.t);
    console.log(`  ${met.padEnd(12)} ${String(tag).padEnd(14)} ${msg}`);
  }

  sample(force = false, notes = '') {
    const st = this.session?.st;
    if (!st) return;
    const interval = st.throttle > 0 ? 15 : 900;
    if (force || st.t - this.lastSample >= interval) {
      this.lastSample = st.t;
      const s = this.snap();
      const entry = { kind: 'tlm', notes, ...s };
      this.entries.push(entry);
      this.appendJsonl(entry);
    }
  }

  setResult(text) {
    this.result = text;
    this.appendJsonl({ kind: 'result', text });
  }

  setExtraMarkdown(md) {
    this.extraMarkdown = md || '';
    this.appendJsonl({ kind: 'extra', text: this.extraMarkdown });
  }

  loadJsonl(path = this.jsonlPath) {
    if (!existsSync(path)) return;
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    this.entries = [];
    for (const line of lines) {
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.kind === 'result') this.result = obj.text;
      else if (obj.kind === 'extra') this.extraMarkdown = obj.text || '';
      else this.entries.push(obj);
    }
  }

  renderMarkdown() {
    const met = (t) => 'T+' + fmtTime(t);
    const lines = [];
    lines.push(`# ${this.title}`);
    lines.push('');
    lines.push(
      `**Craft:** ${this.craft} (stock) · **Pilot:** ${this.pilot} · ` +
      '**Physics:** live game engine, headless (`SimSession`)',
    );
    lines.push(`**Result:** ${this.result}`);
    lines.push('');
    if (this.extraMarkdown) {
      lines.push(this.extraMarkdown.replace(/\s+$/, ''));
      lines.push('');
    }
    lines.push('## Events');
    lines.push('');
    lines.push('```text');
    for (const e of this.entries) {
      if (e.kind !== 'evt') continue;
      lines.push(`${met(e.t).padEnd(12)} ${String(e.tag).padEnd(13)} ${e.msg}`);
    }
    lines.push('```');
    lines.push('');
    lines.push('## Screenshots');
    lines.push('');
    lines.push('In-game captures from the live Three.js flight view (snapshot replay).');
    lines.push('');
    const shotDir = '/workspace/moonshot/logs/shots';
    if (existsSync(shotDir)) {
      const shots = readdirSync(shotDir).filter((f) => f.endsWith('.png') && !f.startsWith('_')).sort();
      if (shots.length) {
        for (const f of shots) {
          const key = f.replace(/\.png$/, '');
          const cap = this.captions[key] || key;
          lines.push(`### ${cap}`);
          lines.push('');
          lines.push(`![${cap}](logs/shots/${f})`);
          lines.push('');
        }
      } else {
        lines.push('_No screenshots yet — run `node scripts/shots.mjs`._');
        lines.push('');
      }
    } else {
      lines.push('_No screenshots yet — run `node scripts/shots.mjs`._');
      lines.push('');
    }
    lines.push('## Telemetry');
    lines.push('');
    lines.push('Sampled every 15 s under thrust, every 15 min on coasts.');
    lines.push('');
    lines.push('| MET | Body | Altitude | Velocity | Mass | Liquid fuel | Throttle | notes |');
    lines.push('|---|---|--:|--:|--:|--:|--:|---|');
    for (const e of this.entries) {
      if (e.kind !== 'tlm') continue;
      const b = BODIES[e.body];
      const bodyName = b?.aka ? `${b.name} / ${b.aka}` : (b?.name ?? e.body);
      lines.push(
        `| ${met(e.t)} | ${bodyName} | ${fmtDist(Math.max(0, e.alt))} | ` +
        `${e.v.toFixed(0)} m/s | ${(e.m / 1000).toFixed(2)} t | ${e.fuel.toFixed(0)} kg | ` +
        `${(e.thr * 100).toFixed(0)}% | ${e.notes || ''} |`,
      );
    }
    lines.push('');
    return lines.join('\n');
  }

  write(path = this.mdPath) {
    writeFileSync(path, this.renderMarkdown());
    return path;
  }
}
