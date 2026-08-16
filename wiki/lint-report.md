# Wiki Lint Report

> 由 `scripts/wiki-auto-curator.mjs` 生成。**只报告、不静默改宪法/ADR**。demote = 离开 Active/live 路由，不删文件。

| 字段 | 值 |
|---|---|
| 生成时间 | 2026-08-16T02:25:40.510Z |
| registry 条数 | 29 |
| Active 条数 | 13 |
| findings | 0 |
| demote 候选 | 0 |

## Demote 候选（可回滚）

- （无）

## 全部 Findings

- （清洁）

## 纪律

- digest 默认 Cold，不得进 FORCE_ACTIVE。
- 完成的计划应带 `status: done`（或表格状态列），以便自动 demote 分类。
- 高风险改写（宪法/CONTEXT）只进本报告，人工或工作流确认后再改。
- 重跑：`node scripts/wiki-auto-curator.mjs` 或 `npm run wiki:curator`。
