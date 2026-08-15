---
title: Wiki SCHEMA
updated: 2026-08-15
status: active
tags: [wiki, schema]
---

# Wiki SCHEMA

## 目的

规定 Moonshot wiki 的目录、页形和收尾同步。Wiki 编译知识，不替代代码。

## 目录

wiki/SCHEMA.md
wiki/AGENTS.md
wiki/index.md                  短目录加指针，不是 changelog 堆
wiki/log.md                    近窗 14 天；更早卷到 wiki/log/YYYY-MM.md
wiki/log/
wiki/active-memory.md          GENERATED L1，帽 15
wiki/memory-registry.json      GENERATED
wiki/lint-report.md            GENERATED
wiki/drafts/                   未完成
wiki/adr/                      决策
wiki/modules/                  子系统真相
wiki/missions/                 已飞任务指针，不是全文日志
wiki/api/                      agent 可读 MCP 目录
wiki/releases/                 预发布说明（0.era.build）

## 页形

正式页：YAML frontmatter 写 title / updated / status / tags（有用就写）；正文必须有井号标题。
status：active | done | cold（正文也可写 已立项 / 进行中 / done）。
章节默认：目的 / 当前判断 / 关键入口 / 边界 / 已知问题。
草稿只进 wiki/drafts/。

## 同步

持久工作之后：更新对应页；log.md 加一行日期条目；结构变了才改 index.md 短指针；然后跑 curator。
遗忘 = 离开 Active，不删文件。中文。
