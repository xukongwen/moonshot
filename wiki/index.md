# Moonshot Wiki

更新日期：2026-08-15

## Active Memory（L1 · agent 默认）

先读 [`active-memory.md`](./active-memory.md)、[`memory-registry.json`](./memory-registry.json)、[`lint-report.md`](./lint-report.md)。
**不要**把本页「变更」区或整份 `log.md` 当作深入理解的默认输入。

整理：`node scripts/wiki-auto-curator.mjs` · 计划：[`Wiki Auto-Curator 架构.md`](./Wiki%20Auto-Curator%20架构.md)
## 目录

- 发布：releases/
- 宪法：Moonshot 宪法.md
- 规则：AGENTS.md · SCHEMA.md
- 整理：Wiki Auto-Curator 架构.md
- 计划：交汇对接架构计划.md
- 模块：modules/patched-conics.md · modules/hohmann.md · modules/mcp.md · modules/i18n.md · modules/versioning.md · modules/saves.md
- 决策：adr/2026-08-15-parent-relative-body-state.md · adr/2026-08-15-ejection-asymptote.md
- 工具：api/mcp-tools.md
- 任务：missions/duna-hohmann.md · missions/mun-express.md

## 当前入口

- 发布 v0.1.3

- 交汇对接：R1–R6 已落地（2336 m / 8.34 m/s，硬对接可分离），见 交汇对接架构计划.md

- 发布 v0.1.2

- 整局存档 + 0.1.N 版本 + 打板

- 发布 v0.1.1

### 2026-08-15 变更

- Kerbol patched-conic：Kerbin / Mun / Minmus / Duna
- Kerbin 到 Duna 霍曼已飞通（见 DUNA_LOG.md）
- MCP VAB 无头装配，34 个工具
- Wiki bootstrap：宪法、模块、ADR、curator
