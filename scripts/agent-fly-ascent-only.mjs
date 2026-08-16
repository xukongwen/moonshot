// Pad → ascent only. No LLM. Never lights Sparrow for TDI/LKO.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { callTool, session } from "../mcp/server.mjs";
import { STOCK } from "../src/stock.js";
import { planMission, formatPlan, cloneDesign } from "../src/plan.js";
import { stagingStats } from "../src/vessel.js";
import { readFlightCheck, transferFuelKg, roleEngines } from "../src/agent-muscles.js";
import { serializeSnapshot, writeSnapshot } from "../mcp/snapshot.mjs";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const LOG_DIR = join(ROOT, "logs");
const SNAP_DIR = join(ROOT, "logs/snapshots");
mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(SNAP_DIR, { recursive: true });

function ignitedNames(st) {
  return (st?.parts ?? [])
    .filter((p) => p.alive !== false && p.ignited && p.def?.engine)
    .map((p) => p.def.name);
}

function dumpSnap(tag) {
  if (!session.st) return null;
  const snap = serializeSnapshot(session.st, { tag, craft: session.craftName });
  const path = writeSnapshot(snap, SNAP_DIR);
  return { tag, path, t: snap.t, body: snap.body, landed: snap.landed, dead: snap.dead };
}

const design = cloneDesign(STOCK["Duna Hauler"]);
design.name = "Duna Hauler";
const paper = planMission(design, "duna-roundtrip");
const stats = stagingStats(design);
const nL = design.stack.filter((x) => x === "tank-l").length;
const nXl = design.stack.filter((x) => x === "tank-xl").length;
const nSrb = design.radials.find((r) => r.part === "srb")?.sym ?? 0;

const result = {
  startedAt: new Date().toISOString(),
  craft: "Duna Hauler",
  stack: [...design.stack],
  radials: design.radials.map((r) => ({ ...r })),
  transfer: `${nL - 1}× tank-l + tank-m Raven`,
  lifter: `${nXl}× tank-xl Titan + ${nSrb} SRB`,
  padTwrSL: stats[0]?.twrSL ?? null,
  padWetKg: stats[0]?.wet ?? null,
  planOk: paper.ok,
  planText: formatPlan(paper),
  change: process.env.DUNA_CAMPAIGN_CHANGE || "ascent-only verify",
  llm: false,
  invented: false,
  nodes: [],
  snapshots: {},
};

console.log("== ascent-only", result.startedAt);
console.log("pad twrSL", result.padTwrSL, "wet", result.padWetKg);
console.log(result.planText);

callTool("ksp_lang", { lang: "zh" });
const flight = callTool("ksp_new_flight", { craft: "Duna Hauler" });
console.log("pad", JSON.stringify({
  craft: flight.craft, landed: flight.landed, body: flight.body,
  fuel_kg: flight.fuel_kg, nParts: session.st?.parts?.length,
  transferFuelKg: transferFuelKg(session.st),
}));
callTool("ksp_agent_plan", { text: "去火星再回来" });
result.snapshots.pad = dumpSnap("agent-fly-pad");

const origStep = session.step.bind(session);
let lastLogT = -999;
const wall0 = Date.now();
session.step = (seconds, dt) => {
  const out = origStep(seconds, dt);
  const st = session.st;
  if (st && st.t - lastLogT >= 25 && st.landed === false && st.body === "kerbin" && st.t < 900) {
    lastLogT = st.t;
    const c = readFlightCheck(st, { stageIdx: session.stageIdx });
    console.log(
      `  ascent MET ${st.t.toFixed(1)}s  ${c.orbitText}  alt=${c.altKm != null ? c.altKm.toFixed(1) : "—"} km`
      + `  fuel=${c.fuelKg != null ? c.fuelKg.toFixed(0) : "—"} kg  xfer=${transferFuelKg(st).toFixed(0)}`
      + `  stage=${session.stageIdx} wall=${((Date.now() - wall0) / 1000).toFixed(0)}s`,
    );
  }
  return out;
};

const t0 = Date.now();
let out;
try {
  out = callTool("ksp_agent_step");
} catch (err) {
  console.error("ascent THREW", err);
  out = { ok: false, thought: String(err?.stack || err) };
}
session.step = origStep;

const check = session.st ? readFlightCheck(session.st, { stageIdx: session.stageIdx ?? 0 }) : null;
const { lander, transfer } = session.st ? roleEngines(session.st) : {};
const rec = {
  nodeId: "ascent",
  ok: !!out?.ok,
  thought: out?.thought ?? "",
  t: session.st?.t ?? null,
  body: check?.body ?? null,
  landed: check?.landed ?? null,
  dead: check?.dead ?? null,
  peKm: check?.peKm ?? null,
  apKm: check?.apKm ?? null,
  orbitText: check?.orbitText ?? null,
  fuelKg: check?.fuelKg ?? null,
  transferFuelKg: session.st ? transferFuelKg(session.st) : null,
  landerName: lander?.def?.name ?? null,
  transferName: transfer?.def?.name ?? null,
  ignited: ignitedNames(session.st),
  stageIdx: session.stageIdx ?? null,
  wallMs: Date.now() - t0,
};
result.nodes.push(rec);
result.snapshots.ascent = dumpSnap("agent-fly-ascent");
result.stopped = rec.ok ? null : { nodeId: "ascent", reason: rec.thought };
result.verdict = rec.ok
  ? `ascent ok ${rec.orbitText} transferFuelKg ${rec.transferFuelKg}`
  : `failed on ascent: ${rec.thought}`;
result.finishedAt = new Date().toISOString();

const outPath = join(LOG_DIR, "agent-fly-ascent-only.json");
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log("ascent", JSON.stringify(rec, null, 2));
console.log("wrote", outPath);
console.log("verdict", result.verdict);
