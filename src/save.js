// Game-save document (whole session). Craft files are a different store.
// Browser-safe: no node:fs import. Node reads package.json via getBuiltinModule.

export const SAVE_FORMAT = 'moonshot-save';
export const SAVE_FORMAT_VERSION = 1;
export const BROWSER_SAVES_KEY = 'moonshot-saves';
export const QUICKSAVE_NAME = '快速存档';

export function detectGameVersion() {
  try {
    const getBuiltin = typeof process !== 'undefined' && process.getBuiltinModule;
    if (typeof getBuiltin === 'function') {
      const fs = getBuiltin('fs');
      const path = getBuiltin('path');
      const { fileURLToPath } = getBuiltin('url');
      const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg?.version) return String(pkg.version);
    }
  } catch { /* browser / unreadable */ }
  return '0.1.0';
}

function cloneWorkshop(w) {
  if (!w || typeof w !== 'object') {
    return { name: '', stack: [], radials: [], selected: -1 };
  }
  return {
    name: w.name ?? '',
    stack: Array.isArray(w.stack) ? [...w.stack] : [],
    radials: Array.isArray(w.radials) ? structuredClone(w.radials) : [],
    selected: w.selected ?? -1,
  };
}

/** Fill format / formatVersion / gameVersion / savedAt. */
export function buildSave(partial = {}) {
  return {
    format: SAVE_FORMAT,
    formatVersion: SAVE_FORMAT_VERSION,
    gameVersion: partial.gameVersion ?? detectGameVersion(),
    name: partial.name ?? '',
    savedAt: partial.savedAt ?? new Date().toISOString(),
    mode: partial.mode === 'flight' ? 'flight' : 'vab',
    lang: partial.lang === 'zh' ? 'zh' : 'en',
    workshop: cloneWorkshop(partial.workshop),
    crafts: partial.crafts && typeof partial.crafts === 'object' && !Array.isArray(partial.crafts)
      ? structuredClone(partial.crafts)
      : {},
    flight: partial.flight ?? null,
  };
}

/** Throws if format / version / workshop are missing or wrong. */
export function validateSave(obj) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('Invalid save: expected an object');
  }
  if (obj.format !== SAVE_FORMAT) {
    throw new Error(`Invalid save format "${obj.format ?? ''}". Expected "${SAVE_FORMAT}".`);
  }
  if (obj.formatVersion !== SAVE_FORMAT_VERSION) {
    throw new Error(`Unsupported save formatVersion ${obj.formatVersion}. Expected ${SAVE_FORMAT_VERSION}.`);
  }
  if (obj.workshop == null || typeof obj.workshop !== 'object' || Array.isArray(obj.workshop)) {
    throw new Error('Invalid save: missing workshop');
  }
  return obj;
}

/** Filesystem-safe slot name (keeps CJK). */
export function safeSlotName(name) {
  const cleaned = String(name ?? '')
    .trim()
    .replace(/[\/\\:*?"<>|\x00-\x1f]+/g, '_')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .slice(0, 80);
  return cleaned || 'save';
}

function vecToArr(v) {
  if (!v) return [0, 0, 0];
  if (Array.isArray(v)) return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
  return [v.x ?? 0, v.y ?? 0, v.z ?? 0];
}

function quatToArr(q) {
  if (!q) return [0, 0, 0, 1];
  if (Array.isArray(q)) return [Number(q[0]) || 0, Number(q[1]) || 0, Number(q[2]) || 0, Number(q[3]) ?? 1];
  return [q.x ?? 0, q.y ?? 0, q.z ?? 0, q.w ?? 1];
}

/** Snapshot fields matching mcp/snapshot.mjs serializeSnapshot (no node:fs). */
export function snapshotFromState(st, { tag = 'save', craft = null } = {}) {
  if (!st) throw new Error('snapshotFromState: missing state');
  return {
    tag,
    t: st.t,
    body: st.body,
    pos: vecToArr(st.pos),
    vel: vecToArr(st.vel),
    quat: quatToArr(st.quat),
    throttle: st.throttle ?? 0,
    landed: !!st.landed,
    dead: !!st.dead,
    craft: craft ?? null,
    parts: (st.parts ?? []).map((p) => ({
      key: p.key,
      fuel: p.fuel,
      ignited: !!p.ignited,
      chuteState: p.chuteState ?? null,
      legsDown: p.legsDown ?? null,
      alive: p.alive !== false,
      stackIndex: p.stackIndex,
    })),
  };
}

function browserStore() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readBrowserAll() {
  const ls = browserStore();
  if (!ls) return {};
  try {
    const data = JSON.parse(ls.getItem(BROWSER_SAVES_KEY) ?? '{}');
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
    return {};
  } catch {
    return {};
  }
}

export function listBrowserSaves() {
  return Object.keys(readBrowserAll());
}

export function writeBrowserSave(name, doc) {
  const ls = browserStore();
  if (!ls) throw new Error('No browser storage');
  const n = String(name || doc?.name || '').trim();
  if (!n) throw new Error('Save needs a name');
  const built = buildSave({ ...doc, name: n });
  validateSave(built);
  const all = readBrowserAll();
  all[n] = built;
  ls.setItem(BROWSER_SAVES_KEY, JSON.stringify(all));
  return built;
}

export function readBrowserSave(name) {
  const all = readBrowserAll();
  if (!all[name]) throw new Error(`No save "${name}"`);
  validateSave(all[name]);
  return all[name];
}

export function deleteBrowserSave(name) {
  const ls = browserStore();
  if (!ls) throw new Error('No browser storage');
  const all = readBrowserAll();
  if (!all[name]) throw new Error(`No save "${name}"`);
  delete all[name];
  ls.setItem(BROWSER_SAVES_KEY, JSON.stringify(all));
  return { deleted: name };
}
