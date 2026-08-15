// Node store for game saves. Default dir mcp/saves/. Inject savesDir in tests.

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSave, validateSave, safeSlotName } from '../src/save.js';

export const DEFAULT_SAVES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'saves');

function resolveDir(savesDir) {
  return savesDir || DEFAULT_SAVES_DIR;
}

function slotPath(name, savesDir) {
  return join(resolveDir(savesDir), `${safeSlotName(name)}.json`);
}

export function listSaves(savesDir) {
  const dir = resolveDir(savesDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      try {
        const doc = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        return {
          name: doc.name || f.slice(0, -5),
          file: f,
          savedAt: doc.savedAt ?? null,
          mode: doc.mode ?? null,
        };
      } catch {
        return { name: f.slice(0, -5), file: f, savedAt: null, mode: null };
      }
    });
}

export function writeSave(name, doc, savesDir) {
  const n = String(name || doc?.name || '').trim();
  if (!n) throw new Error('writeSave requires name');
  const built = buildSave({ ...doc, name: n });
  validateSave(built);
  const dir = resolveDir(savesDir);
  mkdirSync(dir, { recursive: true });
  const path = slotPath(n, dir);
  writeFileSync(path, JSON.stringify(built, null, 2) + '\n');
  return { saved: built.name, path, mode: built.mode, savedAt: built.savedAt };
}

export function readSave(name, savesDir) {
  const n = String(name ?? '').trim();
  if (!n) throw new Error('readSave requires name');
  const path = slotPath(n, savesDir);
  if (!existsSync(path)) {
    const listed = listSaves(savesDir).map((s) => s.name).join(', ') || '(none)';
    throw new Error(`No save "${name}". Saved: ${listed}`);
  }
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  validateSave(doc);
  return doc;
}

export function deleteSave(name, savesDir) {
  const n = String(name ?? '').trim();
  if (!n) throw new Error('deleteSave requires name');
  const path = slotPath(n, savesDir);
  if (!existsSync(path)) {
    const listed = listSaves(savesDir).map((s) => s.name).join(', ') || '(none)';
    throw new Error(`No save "${name}". Saved: ${listed}`);
  }
  unlinkSync(path);
  return { deleted: n, saves: listSaves(savesDir) };
}

export { resolveDir, slotPath };
