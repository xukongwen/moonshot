---
title: Wiki Auto-Curator 架构
updated: 2026-08-15
status: active
tags: [wiki, curator, memory]
---

# Wiki Auto-Curator 架构

## 目的

把 wiki 从只增不治变成 agent 可启动的工作集：L1 必读指针，L2 按需全文。遗忘 = 离开 Active，不是删文件。

## 当前判断

移植自 Nonos 的 Auto-Curator（MVP-1 到 MVP-4）。服务对象是 agent，不是人类导航美观。

L1 Active：FORCE 列表，硬顶不超过 15，一句话摘要。每会话先读 active-memory。
L2 Wiki：计划、ADR、模块、任务全文。registry 路由后再读 2 到 5 篇。
Log 近窗：最近 14 天。用 grep，禁止整份灌入。

动作：扫描 wiki 下的 markdown，写 memory-registry.json，生成 active-memory.md，把过期 log 卷到 log 月卷，剪 index 过期变更，写 lint-report.md。lint 只报告，不静默改宪法。

Registry 字段：path, memoryTier, memoryStatus, decayClass, summaryOneLiner, successor, lastReferencedAt, compactionState。
decayClass：constitutional, protocol, plan, episodic, digest。

## 关键入口

见本页末尾命令。测试文件在 tests 目录。产物是 active-memory、memory-registry、lint-report。

## 边界

不物理删除宪法、ADR、事故、任务指针。
digest、log、index 变更流水不得进 L1。
高风险改写只进 lint 报告。

## 已知问题

没有 nightly cron；本地或 CI 手动收尾跑。
没有用模型补 summaryOneLiner，规则摘要够用。
