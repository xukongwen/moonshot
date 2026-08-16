#!/usr/bin/env node
/**
 * Moonshot 预发布版本：0.<era>.<minor>.<build>
 * 0 锁定非正式版。默认只加 build。不 commit、不 push。
 *
 *   node scripts/release.mjs
 *   node scripts/release.mjs --build|--minor|--era|--force|--dry-run|--tag
 *   --minor 仅当用户说「大版本」；--era 仅当用户说「换代」
 *   --major 永远拒绝（除非用户说「出正式版」，现在永远不）
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const PKG_PATH = path.join(REPO_ROOT, "package.json");
const CHANGELOG_PATH = path.join(REPO_ROOT, "CHANGELOG.md");
const README_PATH = path.join(REPO_ROOT, "README.md");
const INDEX_PATH = path.join(REPO_ROOT, "wiki/index.md");
const LOG_PATH = path.join(REPO_ROOT, "wiki/log.md");
const RELEASES_DIR = path.join(REPO_ROOT, "wiki/releases");

const MAJOR_REFUSE = "升到 1.x 等于出正式版，必须用户亲口说「出正式版」。";

const SKIP_SUBJECT = /^(Merge |chore:|wip:)/i;
const SIGNIFICANT_SUBJECT = /^(Add |Feat|feat|feat:)/i;
const SIGNIFICANT_PATHS = [
  "mcp/",
  "src/orbits.js",
  "src/constants.js",
  "src/physics.js",
  "src/i18n.js",
  "src/vab.js",
  "src/flight.js",
  "src/hud.js",
  "src/main.js",
  "scripts/wiki-auto-curator.mjs",
  "scripts/release.mjs",
  "wiki/Moonshot",
  "wiki/SCHEMA",
  "wiki/modules/",
  "wiki/Wiki",
];

const CHANGELOG_HEADER = `\
# Changelog

版本格式是 \`0.<era>.<minor>.<build>\`，不是经典 Semver。

- **0**（主版本）锁定为非正式版。脚本拒绝任何升到 1.x 的操作。升到 1.x 等于出正式版，必须用户亲口说「出正式版」。
- **era**（第二位）是代际，从 1 起。只有用户明确说「换代」才用 \`--era\`（例如 0.1.1.8 → 0.2.1.0）。
- **minor**（第三位）是大版本。只有用户明确说「大版本」才用 \`--minor\`（例如 0.1.1.8 → 0.1.2.0）。
- **build**（末位）是日常打板。默认发布只加 build：0.1.1.1、0.1.1.2…
`;

function parseVersion(version) {
  const m = String(version ?? "").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!m) throw new Error(`invalid version: ${version}`);
  if (m[4] !== undefined) {
    return { major: Number(m[1]), era: Number(m[2]), minor: Number(m[3]), build: Number(m[4]) };
  }
  // 3-part 0.E.B → { major:0, era:E, minor: missing }
  return { major: Number(m[1]), era: Number(m[2]), minor: null, build: Number(m[3]) };
}

function assertUnofficial(major, nextMajor) {
  if (major >= 1 || nextMajor >= 1) {
    throw new Error(MAJOR_REFUSE);
  }
}

export function bumpVersion(version, kind) {
  const { major, era, minor, build } = parseVersion(version);
  assertUnofficial(major, major);
  if (kind === "major") {
    throw new Error(MAJOR_REFUSE);
  }
  let next;
  if (kind === "era") {
    if (major !== 0) throw new Error(MAJOR_REFUSE);
    next = `0.${era + 1}.1.0`;
  } else if (kind === "minor") {
    const nextMinor = minor == null ? 1 : minor + 1;
    next = `0.${era}.${nextMinor}.0`;
  } else if (kind === "build") {
    // First build from 3-part 0.1.6 → 0.1.1.1 (do not become 0.1.7)
    next = minor == null ? `${major}.${era}.1.1` : `${major}.${era}.${minor}.${build + 1}`;
  } else {
    throw new Error(`unknown kind: ${kind}`);
  }
  const parsed = parseVersion(next);
  assertUnofficial(parsed.major, parsed.major);
  return next;
}

function pathSignificant(file) {
  const norm = String(file).split(path.sep).join("/");
  return SIGNIFICANT_PATHS.some((p) => norm === p || norm.startsWith(p));
}

export function isSignificant(commits) {
  for (const c of commits || []) {
    const subject = c.subject || "";
    if (SKIP_SUBJECT.test(subject)) continue;
    if (SIGNIFICANT_SUBJECT.test(subject)) return true;
    if ((c.files || []).some(pathSignificant)) return true;
  }
  return false;
}

export function planRelease({ version, commits, kind, force } = {}) {
  const k = kind || "build";
  if (k === "major") {
    throw new Error(MAJOR_REFUSE);
  }
  if (!force && !isSignificant(commits)) {
    return { next: version, kind: k, skip: true };
  }
  return { next: bumpVersion(version, k), kind: k, skip: false };
}

function git(args) {
  return spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

export function collectCommits() {
  const tagR = git(["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*"]);
  const tag = tagR.status === 0 ? String(tagR.stdout || "").trim() : "";
  const logArgs = tag
    ? ["log", `${tag}..HEAD`, "--format=%H\t%s", "--no-merges"]
    : ["log", "--format=%H\t%s", "--no-merges"];
  const logR = git(logArgs);
  const lines = String(logR.stdout || "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);
  return lines.map((line) => {
    const tab = line.indexOf("\t");
    const hash = tab === -1 ? line : line.slice(0, tab);
    const subject = tab === -1 ? "" : line.slice(tab + 1);
    const filesR = git(["diff-tree", "--no-commit-id", "--name-only", "-r", hash]);
    const files = String(filesR.stdout || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    return { hash, subject, files };
  });
}

function todayShanghai() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shortHash(hash) {
  return String(hash || "").slice(0, 7);
}

function changelogCommits(commits) {
  return (commits || []).filter((c) => !SKIP_SUBJECT.test(c.subject || ""));
}


const README_STAMP_RE = /当前打板：\*\*v\d+\.\d+\.\d+(?:\.\d+)?\*\*/;

export function applyReadmeVersion(text, next) {
  const stamp = `当前打板：**v${next}**`;
  if (README_STAMP_RE.test(text)) {
    text = text.replace(README_STAMP_RE, stamp);
    text = text.replace(/`0\.<era>\.<build>`/g, "`0.<era>.<minor>.<build>`");
    return text;
  }
  const line = `${stamp}（非正式预发布，\`0.<era>.<minor>.<build>\`）。记录见 [CHANGELOG.md](./CHANGELOG.md)。`;
  if (/^## 版本/m.test(text)) {
    return text.replace(/^(## 版本)[ \t]*\n*/m, `$1\n\n${line}\n`);
  }
  const trimmed = text.replace(/\s*$/, "");
  return `${trimmed}\n\n## 版本\n\n${line}\n`;
}

function writeReadmeVersion(next) {
  const text = fs.readFileSync(README_PATH, "utf8");
  fs.writeFileSync(README_PATH, applyReadmeVersion(text, next));
}

function writePackageVersion(next) {
  // Game UI reads package.json via src/version.js — next release updates the top-bar label.
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
  pkg.version = next;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n");
}

function writeChangelog(next, date, commits) {
  const bullets = changelogCommits(commits)
    .map((c) => `- ${c.subject} (\`${shortHash(c.hash)}\`)`)
    .join("\n");
  const section = `## ${next} — ${date}\n\n${bullets || "- （无条目）"}\n`;
  const baseline = `## 0.1.0 — 2026-08-15\n\n- Daniel Greenheck 原版。\n`;
  if (!fs.existsSync(CHANGELOG_PATH)) {
    fs.writeFileSync(CHANGELOG_PATH, `${CHANGELOG_HEADER}\n${section}\n${baseline}\n`);
    return;
  }
  let text = fs.readFileSync(CHANGELOG_PATH, "utf8");
  if (text.includes(`## ${next} —`)) return;
  const idx = text.search(/^## /m);
  if (idx === -1) {
    text = `${text.trimEnd()}\n\n${section}\n`;
  } else {
    text = `${text.slice(0, idx)}${section}\n${text.slice(idx)}`;
  }
  fs.writeFileSync(CHANGELOG_PATH, text);
}

function writeReleasePage(next, date, commits) {
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
  const dest = path.join(RELEASES_DIR, `v${next}.md`);
  const bullets = changelogCommits(commits)
    .map((c) => `- ${c.subject} (\`${shortHash(c.hash)}\`)`)
    .join("\n");
  const body = `\
---
title: v${next}
updated: ${date}
status: active
tags: [release]
---

# v${next}

## 目的

记录预发布 \`v${next}\`（\`0.<era>.<minor>.<build>\`）这一次交付，方便 agent 对照 CHANGELOG 和入口，而不是当正式版。

## 当前判断

这是非正式版。主版本锁在 0。默认只加 build；大版本要用户说「大版本」，换代要用户说「换代」。
升到 1.x 等于出正式版，必须用户亲口说「出正式版」。

提交：

${bullets || "- （无条目）"}

## 关键入口

CHANGELOG.md
wiki/releases/v${next}.md
wiki/modules/versioning.md
package.json version 字段
README.md 当前打板行
scripts/release.mjs

## 边界

不 commit、不 push。不要把本次当成 1.x。不要自行 \`--minor\` 或 \`--era\`。
`;
  fs.writeFileSync(dest, body);
}

function writeLogLine(next, date) {
  const line = `- [${date}] 发布 v${next}。`;
  let text = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, "utf8") : "";
  if (text.includes(line)) return;
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^- \[\d{4}-\d{2}-\d{2}\]/.test(l));
  if (idx === -1) {
    text = `${text.trimEnd()}\n${line}\n`;
  } else {
    lines.splice(idx, 0, line);
    text = lines.join("\n");
    if (!text.endsWith("\n")) text += "\n";
  }
  fs.writeFileSync(LOG_PATH, text);
}

function updateIndex(next, date) {
  if (!fs.existsSync(INDEX_PATH)) return;
  let text = fs.readFileSync(INDEX_PATH, "utf8");
  if (/更新日期：\d{4}-\d{2}-\d{2}/.test(text)) {
    text = text.replace(/更新日期：\d{4}-\d{2}-\d{2}/, `更新日期：${date}`);
  }
  if (!/releases\//.test(text)) {
    if (/^## 目录\n/m.test(text)) {
      text = text.replace(/## 目录\n+/, (m) => `${m}- 发布：releases/\n`);
    } else {
      text += `\n## 目录\n\n- 发布：releases/\n`;
    }
  }
  if (!text.includes(`v${next}`)) {
    if (/^## 当前入口\n/m.test(text)) {
      text = text.replace(/## 当前入口\n/, `## 当前入口\n\n- 发布 v${next}\n`);
    } else {
      text += `\n## 当前入口\n\n- 发布 v${next}\n`;
    }
  }
  fs.writeFileSync(INDEX_PATH, text);
}

function runCurator() {
  const r = spawnSync(process.execPath, ["scripts/wiki-auto-curator.mjs"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    throw new Error(`wiki-auto-curator exited ${r.status}`);
  }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    tag: args.includes("--tag"),
    major: args.includes("--major"),
    kind: args.includes("--era") ? "era" : args.includes("--minor") ? "minor" : "build",
  };
}

function printPlan(current, plan, commits) {
  if (plan.skip) {
    console.log("skip: no significant changes");
    return;
  }
  console.log(`${current} → ${plan.next} (${plan.kind})`);
  const listed = changelogCommits(commits);
  console.log(`commits: ${listed.length}`);
  for (const c of listed) {
    console.log(`- ${c.subject} (\`${shortHash(c.hash)}\`)`);
  }
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.major) {
    console.error(MAJOR_REFUSE);
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
  const current = pkg.version;
  const commits = collectCommits();

  let plan;
  try {
    plan = planRelease({
      version: current,
      commits,
      kind: opts.kind,
      force: opts.force,
    });
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }

  if (opts.dryRun) {
    if (plan.skip) console.log("skip: no significant changes");
    else printPlan(current, plan, commits);
    process.exit(0);
  }

  if (plan.skip) {
    console.log("skip: no significant changes");
    process.exit(0);
  }

  const date = todayShanghai();
  writePackageVersion(plan.next);
  writeReadmeVersion(plan.next);
  writeChangelog(plan.next, date, commits);
  writeReleasePage(plan.next, date, commits);
  writeLogLine(plan.next, date);
  updateIndex(plan.next, date);
  runCurator();

  if (opts.tag) {
    const name = `v${plan.next}`;
    const tagR = git(["tag", "-a", name, "-m", name]);
    if (tagR.status !== 0) {
      console.error(tagR.stderr || `git tag failed for ${name}`);
      process.exit(1);
    }
    console.log(`tagged ${name} (no push)`);
  }

  console.log(`released ${plan.next} (${plan.kind})`);
}

function isMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    main();
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }
}
