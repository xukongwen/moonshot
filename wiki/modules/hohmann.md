---
title: hohmann
updated: 2026-08-16
status: active
tags: [orbits, duna]
---

# hohmann

## 目的

记录 Kerbin 到 Duna 霍曼窗口、逃逸点火约定，以及已飞通的一次捕获。

## 当前判断

src/orbits.js 导出 planetPhaseDeg、hohmannTransfer、ejectionDeltaV。
Kerbin 到 Duna 计算值：tT 75.51 d，phase 44.36 度，vInfDep 918，vInfArr 826。680 km 圆轨道 ejection 约 1072 m/s。

2026-08-15 已飞：窗口误差 0.04 度，TDI 后 vInf 874，中途修正 +11 m/s，Duna 捕获 19188 x 47378 km，剩燃料 519 kg。
逃逸必须对准双曲线渐近线（约离 midnight 59 度），不能在几何 midnight 点火。
2026-08-16 agent 逃逸（Duna Hauler，窗口快照）：只点 Falcon，烧到计算 v∞ 目标 918，实际 v∞ 839，转移级干（0 kg），轨道 81 × ∞ km；滑行在 kerbol 最近 316718 km，transfer-dry，未进 Duna。

## 关键入口

公式：src/orbits.js
脚本：mcp/duna-hohmann.mjs
日志：DUNA_LOG.md
测试：tests/hohmann.test.mjs
决策：wiki/adr/2026-08-15-ejection-asymptote.md
任务指针：wiki/missions/duna-hohmann.md

## 边界

数字只来自上述日志与测试，不要发明新遥测。
回程霍曼公式对称。2026-08-16 agent 路径已回家（Kerbin 触地 1.18 m/s），见 [../2026-08-16-agent-duna-往返.md](../2026-08-16-agent-duna-往返.md)。不要把本页 2026-08-15 的 519 kg 捕获写成那一次已经回家。

## 已知问题

有限推力 TDI 的 vInf（874）低于理想 918。靠中途 +11 m/s 把 Duna Pe 拉回来。
Agent 转移级烧干时 v∞ 839，中途矢量约 +40/−25 才能交会，但 Falcon 已干、不许点 Sparrow，滑行诚实失败。
2026-08-16 加厚 Falcon（+1 tank-l）从发射台入轨失败：Pe 62 × 4188 km，Falcon 干，未做 TDI。
Raven 4-tank 到了 Duna，捕获 −248×319 km（穿地），不是圆捕获。
