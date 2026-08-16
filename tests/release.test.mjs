// Release scheme: 0.<era>.<build> — unofficial, build increments, never 1.x.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bumpVersion, planRelease, applyReadmeVersion } from "../scripts/release.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name} ${detail}`);
  }
};

check("bump 0.1.0 build → 0.1.1", bumpVersion("0.1.0", "build") === "0.1.1");
check("bump 0.1.88 build → 0.1.89", bumpVersion("0.1.88", "build") === "0.1.89");
check("bump 0.1.12 era → 0.2.0", bumpVersion("0.1.12", "era") === "0.2.0");

let majorThrew = false;
let majorMsg = "";
try {
  bumpVersion("0.1.0", "major");
} catch (e) {
  majorThrew = true;
  majorMsg = e.message || String(e);
}
check("bump major throws", majorThrew);
check("bump major mentions 正式版", majorMsg.includes("正式版"));

let oneXThrew = false;
try {
  bumpVersion("1.0.0", "build");
} catch (e) {
  oneXThrew = /正式版|1\.x/.test(e.message || String(e));
}
check("bump 1.x throws", oneXThrew);

const addPlan = planRelease({
  version: "0.1.0",
  commits: [{ hash: "abc1234", subject: "Add Chinese UI", files: [] }],
  kind: "build",
  force: false,
});
check("plan Add-commit → 0.1.1", addPlan.next === "0.1.1" && addPlan.kind === "build" && addPlan.skip === false);

const skipPlan = planRelease({
  version: "0.1.0",
  commits: [{ hash: "def5678", subject: "docs: typo", files: ["README.md"] }],
  kind: "build",
  force: false,
});
check("plan no significant + !force → skip", skipPlan.skip === true);

const majorCli = spawnSync(process.execPath, ["scripts/release.mjs", "--major"], {
  cwd: root,
  encoding: "utf8",
});
const majorOut = `${majorCli.stdout || ""}${majorCli.stderr || ""}`;
check("--major exits non-zero", majorCli.status !== 0, `status=${majorCli.status}`);
check("--major mentions 正式版", majorOut.includes("正式版"), majorOut.slice(0, 200));

const dry = spawnSync(process.execPath, ["scripts/release.mjs", "--dry-run"], {
  cwd: root,
  encoding: "utf8",
});
const dryOut = `${dry.stdout || ""}${dry.stderr || ""}`;
check("--dry-run exits 0", dry.status === 0, dryOut.slice(0, 300));

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
check("package.json version is 0.x.x", /^0\.\d+\.\d+$/.test(pkg.version), pkg.version);
const parts = String(pkg.version).split(".").map(Number);
const expectedNext = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
const mentionsNext = dryOut.includes(expectedNext) || dryOut.includes("0.1.1") || /skip/i.test(dryOut);
check(`--dry-run mentions ${expectedNext} or 0.1.1 or skip`, mentionsNext, dryOut.slice(0, 300));


const replaced = applyReadmeVersion("前言\n当前打板：**v0.1.2**\n后记", "0.1.3");
check("applyReadmeVersion replaces stamp", replaced.includes("当前打板：**v0.1.3**") && !replaced.includes("当前打板：**v0.1.2**"));
const inserted = applyReadmeVersion("## 版本\n\n旧说明。\n", "0.2.0");
check("applyReadmeVersion inserts under heading", inserted.includes("当前打板：**v0.2.0**") && inserted.indexOf("## 版本") < inserted.indexOf("当前打板：**v0.2.0**"));
const readmeText = readFileSync(join(root, "README.md"), "utf8");
check(
  "README.md on disk has current stamp",
  readmeText.includes("当前打板：**v" + pkg.version + "**"),
  pkg.version
);

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nrelease tests passed");
