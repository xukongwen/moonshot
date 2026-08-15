#!/usr/bin/env node
/**
 * Wiki Auto-Curator (MVP-1..4)
 * - Scan wiki markdown into wiki/memory-registry.json
 * - Emit wiki/active-memory.md (capped by ACTIVE_CAP)
 * - Roll wiki/log.md into wiki/log/YYYY-MM.md
 * - Trim index.md dated changelog
 * - Emit wiki/lint-report.md (orphans, drift, demote candidates; no silent constitutional edits)
 *
 * Usage:
 *   node scripts/wiki-auto-curator.mjs
 *   node scripts/wiki-auto-curator.mjs --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const WIKI_ROOT = path.join(REPO_ROOT, "wiki");
const REGISTRY_PATH = path.join(WIKI_ROOT, "memory-registry.json");
const ACTIVE_PATH = path.join(WIKI_ROOT, "active-memory.md");
const LINT_PATH = path.join(WIKI_ROOT, "lint-report.md");
const LOG_PATH = path.join(WIKI_ROOT, "log.md");
const INDEX_PATH = path.join(WIKI_ROOT, "index.md");
const LOG_DIR = path.join(WIKI_ROOT, "log");

const ACTIVE_CAP = 15;
const LOG_KEEP_DAYS = 14;
const INDEX_CHANGELOG_KEEP_DAYS = 14;
const dryRun = process.argv.includes("--dry-run");
const FORCE_ACTIVE_SET = new Set();

const FORCE_ACTIVE = [
  "wiki/Moonshot 宪法.md",
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
for (const p of FORCE_ACTIVE) FORCE_ACTIVE_SET.add(p);

const LINT_SKIP_PREFIXES = [
  "wiki/log/",
  "wiki/index-changelog/",
  "wiki/api/",
  "wiki/receipts/",
  "wiki/debt/",
  "wiki/inbox/",
  "wiki/releases/",
  "wiki/digest/_template.md",
];

function walkMarkdown(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkMarkdown(full, out);
    else if (name.endsWith(".md")) out.push(full);
  }
  return out;
}

function relWiki(abs) {
  return path.relative(REPO_ROOT, abs).split(path.sep).join("/");
}

function firstHeading(text) {
  const m = text.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "";
}

function oneLinerFromBody(text, title) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("|") || t.startsWith("```") || t.startsWith("- [") || t.startsWith("状态：")) continue;
    if (t.startsWith(">") || t.startsWith("![")) continue;
    if (t === "---") continue;
    if (/^(title|updated|status|tags)\s*:/.test(t)) continue;
    if (/^(日期|更新日期|收集日|发布日|字段)\s*[:：]/.test(t)) continue;
    const clean = t.replace(/^[-*]\s+/, "").slice(0, 160);
    if (clean.length >= 12) return clean;
  }
  return title || "(no summary)";
}

function extractSuccessor(text) {
  const m =
    text.match(/实施真相已升格\s*→\s*`([^`]+)`/) ||
    text.match(/已指向正式计划[：:]\s*`([^`]+)`/) ||
    text.match(/successor:\s*(\S+)/i);
  if (!m) return null;
  let s = m[1].trim();
  if (!s.startsWith("wiki/")) s = s.startsWith("drafts/") ? `wiki/${s}` : s;
  return s;
}

function classify(rel, text) {
  const base = path.basename(rel);

  if (rel.startsWith("wiki/digest/") || rel.startsWith("wiki/inbox/")) {
    return { decayClass: rel.startsWith("wiki/inbox/") ? "episodic" : "digest", memoryTier: "cold", memoryStatus: "living" };
  }
  if (rel === "wiki/lint-report.md" || rel === "wiki/memory-registry.json") {
    return { decayClass: "protocol", memoryTier: "cold", memoryStatus: "living" };
  }
  if (rel === "wiki/active-memory.md") {
    return { decayClass: "protocol", memoryTier: "cold", memoryStatus: "living" };
  }
  if (rel === "wiki/log.md" || rel.startsWith("wiki/log/") || rel.startsWith("wiki/index-changelog/")) {
    return { decayClass: "episodic", memoryTier: "cold", memoryStatus: "living" };
  }
  if (rel.startsWith("wiki/releases/")) {
    return { decayClass: "episodic", memoryTier: "cold", memoryStatus: "living" };
  }
  if (rel === "wiki/index.md") {
    return { decayClass: "protocol", memoryTier: "cold", memoryStatus: "living" };
  }
  if (rel === "wiki/Moonshot 宪法.md" || rel.startsWith("wiki/adr/") || /宪法/.test(base)) {
    return { decayClass: "constitutional", memoryTier: "cold", memoryStatus: "living" };
  }
  if (rel.startsWith("wiki/api/")) {
    return { decayClass: "protocol", memoryTier: "cold", memoryStatus: "living" };
  }
  if (rel.startsWith("wiki/drafts/")) {
    const superseded = /已升格|实施真相已升格|已指向正式计划/.test(text);
    const open = /未拍板|讨论草案|开放问题/.test(text) && !superseded;
    return {
      decayClass: "plan",
      memoryTier: superseded ? "archive" : open ? "warm" : "cold",
      memoryStatus: superseded ? "superseded" : "living",
      successor: extractSuccessor(text),
    };
  }
  if (
    (/状态：\s*done\b|status:\s*done\b/i.test(text) || /\|\s*状态\s*\|\s*done\s*\|/i.test(text)) &&
    /计划/.test(base)
  ) {
    return { decayClass: "plan", memoryTier: "cold", memoryStatus: "done" };
  }
  // Explicit in-progress beats incidental「已落地」checkboxes in long plans.
  if (/待实施|进行中|已立项|frontier|下一刀|MVP-\d.*待|待做/.test(text) && /计划|草案/.test(base)) {
    return { decayClass: "plan", memoryTier: "warm", memoryStatus: "living" };
  }
  if (/已落地|Slice \d+[^\n]{0,40}已落地/.test(text) && /计划/.test(base)) {
    return { decayClass: "plan", memoryTier: "cold", memoryStatus: "done" };
  }
  if (/架构计划|实施计划|总计划/.test(base)) {
    return { decayClass: "plan", memoryTier: "cold", memoryStatus: "done" };
  }
  if (/事故|修复记录|receipts\//.test(rel) || /事故/.test(base)) {
    return { decayClass: "episodic", memoryTier: "cold", memoryStatus: "living" };
  }
  return { decayClass: "plan", memoryTier: "cold", memoryStatus: "living" };
}

function parseLogDate(line) {
  const m = line.match(/^- \[(\d{4}-\d{2}-\d{2})\]/);
  return m ? m[1] : null;
}

function daysAgo(isoDate, today = new Date()) {
  const d = new Date(`${isoDate}T12:00:00`);
  return Math.floor((today.getTime() - d.getTime()) / 86400000);
}

function buildRegistry(files) {
  const entries = [];
  for (const abs of files) {
    const rel = relWiki(abs);
    if (rel === "wiki/active-memory.md") continue;
    const text = fs.readFileSync(abs, "utf8");
    const title = firstHeading(text) || path.basename(rel, ".md");
    const c = classify(rel, text);
    const mtime = fs.statSync(abs).mtime.toISOString();
    entries.push({
      path: rel,
      title,
      memoryTier: c.memoryTier,
      memoryStatus: c.memoryStatus,
      decayClass: c.decayClass,
      summaryOneLiner: oneLinerFromBody(text, title),
      successor: c.successor || null,
      lastReferencedAt: null,
      mtime,
      compactionState: "full",
    });
  }
  // Force-active overrides (only these become L1)
  for (const p of FORCE_ACTIVE) {
    const e = entries.find((x) => x.path === p);
    if (e) {
      e.memoryTier = "active";
      // Still-forced plans are living for lint purposes even if body mentions 已落地.
      if (e.decayClass === "plan" || e.memoryStatus === "superseded" || e.memoryStatus === "done") {
        e.memoryStatus = "living";
      }
    }
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    activeCap: ACTIVE_CAP,
    logKeepDays: LOG_KEEP_DAYS,
    entries,
  };
}

function pickActive(registry) {
  const byPath = new Map(registry.entries.map((e) => [e.path, e]));
  const picked = [];
  // MVP: Active 只来自显式 FORCE 列表，避免旧计划/ADR 凭 mtime 挤进 L1。
  for (const p of FORCE_ACTIVE) {
    if (picked.length >= ACTIVE_CAP) break;
    const e = byPath.get(p);
    if (e && !picked.find((x) => x.path === p)) picked.push(e);
  }
  return picked.slice(0, ACTIVE_CAP);
}

function renderActiveMemory(picked, registry) {
  const lines = [
    "# Wiki Active Memory（L1）",
    "",
    "> agent 默认工作集。深入理解请按路径按需读取全文；**不要**通读 `wiki/log.md` 或整份 `wiki/index.md` 变更流水。",
    "",
    "| 字段 | 值 |",
    "|---|---|",
    `| 生成时间 | ${registry.generatedAt} |`,
    `| 条数 | ${picked.length} / ${ACTIVE_CAP} |`,
    "| Registry | [memory-registry.json](./memory-registry.json) |",
    "| 计划 | [Wiki Auto-Curator 架构.md](./Wiki%20Auto-Curator%20架构.md) |",
    "",
    "## Active（必读指针）",
    "",
  ];
  for (const e of picked) {
    const href =
      "./" +
      e.path
        .replace(/^wiki\//, "")
        .split("/")
        .map(encodeURIComponent)
        .join("/");
    lines.push(`- [${e.title}](${href}) — ${e.summaryOneLiner}`);
  }
  lines.push(
    "",
    "## 读取协议",
    "",
    "1. 先读本文件 + 根目录 `AGENTS.md` / `wiki/AGENTS.md` 指针。",
    "2. 任务相关再 `grep` / wiki search / 打开上表链接全文。",
    "3. 近窗日志：`grep '^- \\[' wiki/log.md | head`；更早见 `wiki/log/YYYY-MM.md`。",
    "4. 更新 registry：`node scripts/wiki-auto-curator.mjs`。",
    "",
  );
  return lines.join("\n");
}

function rollLog() {
  if (!fs.existsSync(LOG_PATH)) return { moved: 0, kept: 0 };
  const raw = fs.readFileSync(LOG_PATH, "utf8");
  const lines = raw.split(/\r?\n/);
  const keep = [];
  const byMonth = new Map();
  let moved = 0;
  let i = 0;
  // Preserve a short header if present before first dated entry
  while (i < lines.length && !parseLogDate(lines[i])) {
    // drop old auto header; we'll rewrite
    if (lines[i].startsWith("<!-- wiki-auto-curator:")) {
      i++;
      continue;
    }
    if (lines[i].startsWith("# ") && keep.length === 0) {
      i++;
      continue;
    }
    break;
  }
  while (i < lines.length) {
    const line = lines[i];
    const date = parseLogDate(line);
    if (!date) {
      // continuation / blank belonging to previous — attach to keep if last keep, else skip orphan noise at top
      if (keep.length) keep.push(line);
      i++;
      continue;
    }
    const age = daysAgo(date);
    const block = [line];
    i++;
    while (i < lines.length && !parseLogDate(lines[i])) {
      block.push(lines[i]);
      i++;
    }
    if (age > LOG_KEEP_DAYS) {
      const month = date.slice(0, 7);
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month).push(block.join("\n"));
      moved++;
    } else {
      keep.push(...block);
    }
  }
  if (!dryRun) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    for (const [month, blocks] of byMonth) {
      const dest = path.join(LOG_DIR, `${month}.md`);
      const header = `# Wiki Log · ${month}\n\n> 由 wiki-auto-curator 从 \`wiki/log.md\` 卷出；demote not delete。\n\n`;
      if (!fs.existsSync(dest)) {
        fs.writeFileSync(dest, header + blocks.join("\n\n") + "\n");
      } else {
        let content = fs.readFileSync(dest, "utf8");
        for (const b of blocks) {
          const key = b.slice(0, 120);
          if (!content.includes(key)) content = content.trimEnd() + "\n\n" + b + "\n";
        }
        fs.writeFileSync(dest, content);
      }
    }
    const header = [
      "<!-- wiki-auto-curator:near-window -->",
      `# Wiki Log（近 ${LOG_KEEP_DAYS} 天）`,
      "",
      `> 更早条目已卷到 [\`wiki/log/\`](./log/)。生成：\`node scripts/wiki-auto-curator.mjs\`。`,
      "",
      "",
    ].join("\n");
    fs.writeFileSync(LOG_PATH, header + keep.join("\n").replace(/^\n+/, "") + (keep.length ? "\n" : ""));
  }
  return { moved, kept: keep.filter((l) => parseLogDate(l)).length, months: [...byMonth.keys()] };
}

function collectInboundRefs(files) {
  const refs = new Map(); // targetRel -> Set(fromRel)
  const ensure = (t) => {
    if (!refs.has(t)) refs.set(t, new Set());
    return refs.get(t);
  };
  for (const abs of files) {
    const from = relWiki(abs);
    const text = fs.readFileSync(abs, "utf8");
    const mdLinks = [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
    const wikiLinks = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
    for (const raw of [...mdLinks, ...wikiLinks]) {
      let t = raw.split(/[?#]/)[0].trim();
      if (!t || t.startsWith("http") || t.startsWith("mailto:")) continue;
      try {
        t = decodeURIComponent(t);
      } catch {
        /* keep raw */
      }
      let target;
      if (t.startsWith("wiki/")) target = t;
      else if (t.startsWith("./") || t.startsWith("../") || !t.startsWith("/")) {
        const fromDir = path.posix.dirname(from);
        target = path.posix.normalize(path.posix.join(fromDir, t));
      } else continue;
      if (!target.endsWith(".md")) {
        if (fs.existsSync(path.join(REPO_ROOT, `${target}.md`))) target = `${target}.md`;
        else continue;
      }
      ensure(target).add(from);
    }
  }
  return refs;
}

function runLint(registry, files, activePaths) {
  const byPath = new Map(registry.entries.map((e) => [e.path, e]));
  const inbound = collectInboundRefs(files);
  const findings = [];

  for (const p of FORCE_ACTIVE) {
    if (!byPath.has(p)) {
      findings.push({
        severity: "error",
        code: "force-active-missing",
        path: p,
        message: "FORCE_ACTIVE 路径不存在；Active 列表会缺项。",
        action: "fix-force-list",
      });
    }
  }

  for (const e of registry.entries) {
    if (e.decayClass === "digest" && e.memoryTier === "active") {
      findings.push({
        severity: "error",
        code: "digest-in-active",
        path: e.path,
        message: "digest 不应进入 L1 Active。",
        action: "demote",
      });
    }
    if (e.memoryStatus === "superseded" && !e.successor) {
      findings.push({
        severity: "warn",
        code: "superseded-without-successor",
        path: e.path,
        message: "已标记 superseded 但无 successor。",
        action: "add-successor",
      });
    }
    if (e.successor && !byPath.has(e.successor) && !fs.existsSync(path.join(REPO_ROOT, e.successor))) {
      findings.push({
        severity: "warn",
        code: "broken-successor",
        path: e.path,
        message: `successor 不存在: ${e.successor}`,
        action: "fix-successor",
      });
    }
    if (
      e.memoryStatus === "done" &&
      FORCE_ACTIVE_SET.has(e.path) &&
      e.decayClass === "plan"
    ) {
      findings.push({
        severity: "warn",
        code: "done-still-force-active",
        path: e.path,
        message: "计划已 done 但仍在 FORCE_ACTIVE；考虑移出 L1（不删文件）。",
        action: "demote-from-force-active",
      });
    }
    if (
      e.decayClass === "plan" &&
      e.memoryStatus === "living" &&
      /计划/.test(e.path) &&
      !FORCE_ACTIVE_SET.has(e.path)
    ) {
      const abs = path.join(REPO_ROOT, e.path);
      if (fs.existsSync(abs)) {
        const text = fs.readFileSync(abs, "utf8");
        if (/已落地/.test(text) && !/\| 状态 \|/.test(text) && !/状态：\s*done|status:\s*done/i.test(text)) {
          findings.push({
            severity: "info",
            code: "missing-done-status",
            path: e.path,
            message: "正文含「已落地」但无显式 status: done；建议补状态字段以便 demote。",
            action: "add-status-done",
          });
        }
      }
    }
  }

  for (const e of registry.entries) {
    if (LINT_SKIP_PREFIXES.some((p) => e.path === p || e.path.startsWith(p))) continue;
    if (
      [
        "wiki/log.md",
        "wiki/index.md",
        "wiki/active-memory.md",
        "wiki/lint-report.md",
        "wiki/memory-registry.json",
      ].includes(e.path)
    ) {
      continue;
    }
    if (e.decayClass === "constitutional" || FORCE_ACTIVE_SET.has(e.path)) continue;
    const refs = inbound.get(e.path);
    if (!refs || refs.size === 0) {
      // also check basename hits in index/active
      const base = path.basename(e.path);
      let mentioned = false;
      for (const hub of [INDEX_PATH, ACTIVE_PATH, LOG_PATH]) {
        if (fs.existsSync(hub) && fs.readFileSync(hub, "utf8").includes(base)) {
          mentioned = true;
          break;
        }
      }
      if (!mentioned) {
        findings.push({
          severity: "info",
          code: "orphan-page",
          path: e.path,
          message: "未发现入站 markdown/wiki 链接（可能仍被路径字符串引用）。",
          action: "link-or-archive",
        });
      }
    }
  }

  for (const p of activePaths) {
    if (!byPath.has(p)) {
      findings.push({
        severity: "error",
        code: "active-drift",
        path: p,
        message: "active-memory 指向的路径不在 registry。",
        action: "rerun-curator",
      });
    }
  }

  const demoteCandidates = findings.filter((f) =>
    ["demote", "demote-from-force-active", "add-status-done"].includes(f.action),
  );

  const report = renderLintReport(findings, demoteCandidates, registry, activePaths);
  if (!dryRun) fs.writeFileSync(LINT_PATH, report);
  return {
    findings: findings.length,
    bySeverity: {
      error: findings.filter((f) => f.severity === "error").length,
      warn: findings.filter((f) => f.severity === "warn").length,
      info: findings.filter((f) => f.severity === "info").length,
    },
    demoteCandidates: demoteCandidates.length,
  };
}

function renderLintReport(findings, demoteCandidates, registry, activePaths) {
  const lines = [
    "# Wiki Lint Report",
    "",
    "> 由 `scripts/wiki-auto-curator.mjs` 生成。**只报告、不静默改宪法/ADR**。demote = 离开 Active/live 路由，不删文件。",
    "",
    `| 字段 | 值 |`,
    `|---|---|`,
    `| 生成时间 | ${registry.generatedAt} |`,
    `| registry 条数 | ${registry.entries.length} |`,
    `| Active 条数 | ${activePaths.length} |`,
    `| findings | ${findings.length} |`,
    `| demote 候选 | ${demoteCandidates.length} |`,
    "",
    "## Demote 候选（可回滚）",
    "",
  ];
  if (!demoteCandidates.length) lines.push("- （无）", "");
  else {
    for (const f of demoteCandidates) {
      lines.push(`- \`${f.code}\` · \`${f.path}\` — ${f.message}`);
    }
    lines.push("");
  }
  lines.push("## 全部 Findings", "");
  if (!findings.length) {
    lines.push("- （清洁）", "");
  } else {
    const order = { error: 0, warn: 1, info: 2 };
    const sorted = [...findings].sort(
      (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || a.path.localeCompare(b.path),
    );
    for (const f of sorted) {
      lines.push(`- **${f.severity}** \`${f.code}\` · [\`${f.path}\`](./${f.path.replace(/^wiki\//, "").split("/").map(encodeURIComponent).join("/")}) — ${f.message} _(action: ${f.action})_`);
    }
    lines.push("");
  }
  lines.push(
    "## 纪律",
    "",
    "- digest 默认 Cold，不得进 FORCE_ACTIVE。",
    "- 完成的计划应带 `status: done`（或表格状态列），以便自动 demote 分类。",
    "- 高风险改写（宪法/CONTEXT）只进本报告，人工或工作流确认后再改。",
    "- 重跑：`node scripts/wiki-auto-curator.mjs` 或 `npm run wiki:curator`。",
    "",
  );
  return lines.join("\n");
}

function trimIndexChangelog() {
  if (!fs.existsSync(INDEX_PATH)) return { removedSections: 0 };
  let text = fs.readFileSync(INDEX_PATH, "utf8");
  const activeBanner = [
    "## Active Memory（L1 · agent 默认）",
    "",
    "先读 [`active-memory.md`](./active-memory.md)、[`memory-registry.json`](./memory-registry.json)、[`lint-report.md`](./lint-report.md)。",
    "**不要**把本页「变更」区或整份 `log.md` 当作深入理解的默认输入。",
    "",
    "整理：`node scripts/wiki-auto-curator.mjs` · 计划：[`Wiki Auto-Curator 架构.md`](./Wiki%20Auto-Curator%20架构.md)",
    "",
  ].join("\n");

  // Ensure banner after title block
  if (!text.includes("## Active Memory（L1 · agent 默认）")) {
    text = text.replace(
      /(更新日期：[^\n]+\n\n)/,
      `$1${activeBanner}`,
    );
    if (!text.includes("## Active Memory（L1 · agent 默认）")) {
      text = text.replace(/^(# Moonshot Wiki\n)/, `$1\n${activeBanner}`);
    }
  } else {
    text = text.replace(
      /## Active Memory（L1 · agent 默认）[\s\S]*?(?=## )/,
      activeBanner,
    );
  }

  // Trim dated ### YYYY-MM-DD 变更 sections inside 当前入口 older than keep days
  const sectionRe = /(### (\d{4}-\d{2}-\d{2}) 变更\n[\s\S]*?)(?=### \d{4}-\d{2}-\d{2} 变更\n|## (?!#)|$)/g;
  let removedSections = 0;
  const archiveDir = path.join(WIKI_ROOT, "index-changelog");
  const archived = [];
  text = text.replace(sectionRe, (full, _body, date) => {
    if (daysAgo(date) > INDEX_CHANGELOG_KEEP_DAYS) {
      removedSections++;
      archived.push({ date, full });
      return "";
    }
    return full;
  });

  if (!dryRun && archived.length) {
    fs.mkdirSync(archiveDir, { recursive: true });
    for (const { date, full } of archived) {
      const month = date.slice(0, 7);
      const dest = path.join(archiveDir, `${month}.md`);
      const header = `# Index Changelog · ${month}\n\n> 从 \`wiki/index.md\`「当前入口」卷出。\n\n`;
      if (!fs.existsSync(dest)) fs.writeFileSync(dest, header + full + "\n");
      else {
        const prev = fs.readFileSync(dest, "utf8");
        if (!prev.includes(date)) fs.writeFileSync(dest, prev.trimEnd() + "\n\n" + full + "\n");
      }
    }
  }

  // Collapse excessive blank lines
  text = text.replace(/\n{3,}/g, "\n\n");
  if (!dryRun) fs.writeFileSync(INDEX_PATH, text);
  return { removedSections };
}

function main() {
  const files = walkMarkdown(WIKI_ROOT).filter((abs) => {
    const rel = relWiki(abs);
    return rel !== "wiki/lint-report.md";
  });
  const registry = buildRegistry(files);
  const picked = pickActive(registry);
  const activeSet = new Set(picked.map((e) => e.path));
  for (const e of registry.entries) {
    e.memoryTier = activeSet.has(e.path) ? "active" : e.memoryTier === "active" ? "cold" : e.memoryTier;
  }
  const activeMd = renderActiveMemory(picked, registry);
  const logResult = rollLog();
  const indexResult = trimIndexChangelog();
  const lintResult = runLint(registry, files, picked.map((e) => e.path));

  if (!dryRun) {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n");
    fs.writeFileSync(ACTIVE_PATH, activeMd);
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        files: files.length,
        registryEntries: registry.entries.length,
        active: picked.length,
        activePaths: picked.map((e) => e.path),
        log: logResult,
        index: indexResult,
        lint: lintResult,
        wrote: dryRun
          ? []
          : [REGISTRY_PATH, ACTIVE_PATH, LINT_PATH, LOG_PATH, INDEX_PATH],
      },
      null,
      2,
    ),
  );
}

main();
