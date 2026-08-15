// Assemble a funny giraffe-neck craft via MCP callTool (not Workshop class).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callTool } from '../mcp/server.mjs';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const OUT = join(ROOT, 'logs/funny-craft.json');
mkdirSync(join(ROOT, 'logs'), { recursive: true });

const NAME = '这也能飞？';
const STACK = [
  'chute',
  'pod-mk1',
  'heat-shield',
  'tank-s', 'tank-s', 'tank-s', 'tank-s', 'tank-s', 'tank-s',
  'decoupler-s',
  'tank-xl',
  'tank-xl',
  'eng-titan',
];

const calls = [];
const errors = [];

function summarize(result) {
  if (result == null) return result;
  if (typeof result !== 'object') return result;
  const out = {};
  if (result.name != null) out.name = result.name;
  if (result.stack) out.stack = result.stack;
  if (result.radials) out.radials = result.radials;
  if (result.selected != null) out.selected = result.selected;
  if (result.saved != null) out.saved = result.saved;
  if (result.totalDv != null) {
    out.totalDv = result.totalDv;
    out.mass_t = result.mass_t;
    out.height_m = result.height_m;
    out.parts = result.parts;
    out.stages = result.stages;
  } else if (result.stats) {
    out.stats = {
      totalDv: result.stats.totalDv,
      mass_t: result.stats.mass_t,
      height_m: result.stats.height_m,
      parts: result.stats.parts,
    };
  }
  return out;
}

function invoke(name, args = {}) {
  const entry = { tool: name, args };
  try {
    const result = callTool(name, args);
    entry.ok = true;
    entry.result = result;
    calls.push(entry);
    console.log(`OK  ${name} ${JSON.stringify(args)}`);
    console.log('   ', JSON.stringify(summarize(result)));
    return result;
  } catch (err) {
    const message = err?.message || String(err);
    entry.ok = false;
    entry.error = message;
    calls.push(entry);
    errors.push({ tool: name, args, error: message });
    console.error(`ERR ${name} ${JSON.stringify(args)} → ${message}`);
    return null;
  }
}

function nthIndex(stack, id, n = 1) {
  let seen = 0;
  for (let i = 0; i < stack.length; i++) {
    if (stack[i] === id) {
      seen++;
      if (seen === n) return i;
    }
  }
  throw new Error(`stack has no ${id} #${n}: ${JSON.stringify(stack)}`);
}

// 1. clear
invoke('ksp_vab_clear');

// 2. name
invoke('ksp_vab_set_name', { name: NAME });

// 3. stack parts in human order (top → bottom)
for (const id of STACK) {
  invoke('ksp_vab_add_part', { id });
}

let snap = invoke('ksp_vab_get');
if (!snap) throw new Error('ksp_vab_get failed after stack');

// 7. move titan up then back (prove move works) before radials attach
const titanAt = nthIndex(snap.stack, 'eng-titan');
const moved = invoke('ksp_vab_move_part', { index: titanAt, dir: -1 });
if (moved) {
  invoke('ksp_vab_move_part', { index: moved.selected, dir: 1 });
}

snap = invoke('ksp_vab_get');
const firstXl = nthIndex(snap.stack, 'tank-xl', 1);
const secondXl = nthIndex(snap.stack, 'tank-xl', 2);
const titan = nthIndex(snap.stack, 'eng-titan');

// 4. first tank-xl: SRB ×6 + legs
invoke('ksp_vab_select', { index: firstXl });
invoke('ksp_vab_add_radial', { id: 'srb', sym: 6 });
invoke('ksp_vab_add_radial', { id: 'legs' });

// 5. second tank-xl: SRB ×6
invoke('ksp_vab_select', { index: secondXl });
invoke('ksp_vab_add_radial', { id: 'srb', sym: 6 });

// 6. titan: fins
invoke('ksp_vab_select', { index: titan });
invoke('ksp_vab_add_radial', { id: 'fins' });

// 8. stats + get
const stats = invoke('ksp_vab_stats');
const got = invoke('ksp_vab_get');

// 9. save
const saved = invoke('ksp_vab_save', { name: NAME });

const payload = {
  at: new Date().toISOString(),
  name: NAME,
  design: got?.design ?? { name: NAME, stack: got?.stack, radials: got?.radials },
  stack: got?.stack ?? null,
  radials: got?.radials ?? null,
  selected: got?.selected ?? null,
  stats,
  snapshot: got,
  saved: saved ? { saved: saved.saved } : null,
  calls: calls.map(({ tool, args, ok, error, result }) => ({
    tool,
    args,
    ok,
    error: error || null,
    summary: summarize(result),
  })),
  errors,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');

console.log('\n===== FINAL DESIGN =====');
console.log(JSON.stringify({ name: NAME, stack: got?.stack, radials: got?.radials }, null, 2));
console.log('\n===== STATS =====');
console.log(JSON.stringify(stats, null, 2));
console.log('\n===== GET =====');
console.log(JSON.stringify({
  name: got?.name,
  stack: got?.stack,
  radials: got?.radials,
  selected: got?.selected,
  stats: got?.stats,
}, null, 2));
console.log(`\nwrote ${OUT}`);
if (errors.length) {
  console.error(`\n${errors.length} tool error(s)`);
  process.exit(1);
}
