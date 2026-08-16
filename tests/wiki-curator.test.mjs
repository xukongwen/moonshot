// Wiki auto-curator: registry, L1 Active, FORCE pages, cap 15.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

const r = spawnSync(process.execPath, ["scripts/wiki-auto-curator.mjs"], {
  cwd: root,
  encoding: "utf8",
});
check("curator exit 0", r.status === 0, (r.stderr || r.stdout || "").slice(0, 400));

const registryPath = join(root, "wiki/memory-registry.json");
const activePath = join(root, "wiki/active-memory.md");
check("memory-registry.json exists", existsSync(registryPath));
check("active-memory.md exists", existsSync(activePath));

const active = existsSync(activePath) ? readFileSync(activePath, "utf8") : "";
check("active-memory contains L1", active.includes("L1"));

const force = [
  "wiki/Moonshot 宪法.md",
  "wiki/游戏内Agent计划.md",
  "wiki/Wiki Auto-Curator 架构.md",
  "wiki/modules/patched-conics.md",
  "wiki/modules/hohmann.md",
  "wiki/modules/mcp.md",
  "wiki/modules/i18n.md",
  "wiki/modules/versioning.md",
  "wiki/modules/saves.md",
  "wiki/adr/2026-08-15-parent-relative-body-state.md",
  "wiki/adr/2026-08-15-ejection-asymptote.md",
  "wiki/api/mcp-tools.md",
];

let registry = { entries: [] };
if (existsSync(registryPath)) {
  registry = JSON.parse(readFileSync(registryPath, "utf8"));
}
const activeEntries = (registry.entries || []).filter((e) => e.memoryTier === "active");
check("active count <= 15", activeEntries.length <= 15, String(activeEntries.length));

for (const p of force) {
  const listed = active.includes(p.replace(/^wiki\//, "")) || active.includes(p);
  const inReg = (registry.entries || []).some((e) => e.path === p && e.memoryTier === "active");
  check(`FORCE listed ${p}`, listed || inReg, listed ? "md" : inReg ? "registry" : "missing");
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nwiki curator tests passed");
