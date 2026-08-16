---
title: 2026-08-16 agent Duna 往返
updated: 2026-08-16
status: done
tags: [mission, duna, agent]
---

# 2026-08-16 agent Duna 往返

## 目的

记下第一次走游戏内 agent 路径（一刀一刀，不是一条龙脚本）的 Duna 着陆并回家。数字只来自 `logs/agent-fly-duna-result.json`。瑕疵照写。

## 当前判断

飞通了。不是干净飞通。这次之前没打板。

船：库存 Duna Hauler。Sparrow 着陆器（tank-l + tank-m）+ Raven 转移（4× tank-l + tank-m）+ Titan 8× XL + 6 SRB。垫 TWR **1.205**。转移级是新加的 R-40 Raven（`eng-raven`：120 kN，Isp 360/90，900 kg，1.25 m）。目录 21→22。不是超级零件。

面板 A1–A6 已做：面板、目标→总图、走一步、回退、真检查、MCP `ksp_agent_*`。路径是 `ksp_agent_step` / 同一套函数，一刀一停。TDI / 中途 / Duna 捕获只点 Raven，没点 Sparrow。

### 这一次（result JSON）

1. 入轨 **72×144 km**，剩 12987 kg，转移级 6987 kg，Raven 亮
2. 窗口 **44.4°**
3. 逃逸 v∞ **861**（目标 918），101×∞ km，剩 8149 kg
4. 滑行进 duna，−171×∞ km，剩 7945 kg
5. 捕获 **−248×319 km**，Raven 干（6000 kg 全是着陆器油）
6. 丢级，Raven 没了
7. Duna 落地 AGL 0，**5849 kg**，Sparrow only。图 `logs/shots/agent-fly-land.png`
8. 上升 **59×130 km**，2590 kg（第一次失败见下）
9. 回家：先 Kerbin 相遇 **572×∞ km** / 1328 kg；再捕获 **572×1985 km** / 494 kg；伞+舱落地触地 **1.18 m/s**，AGL 0，剩 **317 kg**。图 `logs/shots/agent-fly-kerbin-land.png`

### 瑕疵

- Falcon-only TDI 到不了 Duna：v∞ 839 vs 918，CA 317 Mm（316718 km）。
- 加厚 Falcon 入轨失败：Pe 62×4188，或 5×L+M+9 XL（TWR 1.084）坠毁。纸面 `planMission` 乐观。
- 检查器假阳性：入轨后报「已经点 Sparrow」——当时用 `stageIdx`（下一发 Space），不是活发动机。后来改成只信点火。
- Raven 120 kN 接不住坏的 Titan 交接（−560×83 来不及抬 Pe）。入轨剖面改 loft Ap 140 km，才有 72×144。
- Duna 捕获近拱点穿地（−248 km），不是圆捕获。
- 上升第一次 48×54 km，还在 50 km 大气里。
- 回家第一次朝外（太阳向外），渐近线后来翻了。
- 相遇不是落地：572×∞ 还要再切一刀（捕获+伞）。
- 姿态仍是 quat 作弊；0.1s 物理不是 agent。
- 逃逸 / 着陆 / 上升 / 回家肌肉是新的，粗。
- 旧脚本 Duna 着陆更早就有，但回家失败（Falcon 干、点了 Sparrow）。

## 关键入口

logs/agent-fly-duna-result.json
logs/shots/agent-fly-land.png
logs/shots/agent-fly-kerbin-land.png
src/agent-step.js · src/agent-burns.js · src/agent-muscles.js
src/parts.js `eng-raven`
src/stock.js Duna Hauler
wiki/游戏内Agent计划.md
wiki/missions/duna-landing.md

## 边界

不要把 −248×319 写成圆轨道捕获。
不要把 572×∞ 相遇写成已经落地。
不要发明新数字。
不要把旧脚本 pad→Duna 着陆（Falcon 干、点 Sparrow、没回家）和这次 agent 路径混成一次。

## 已知问题

见上面瑕疵。肌肉还粗。姿态作弊还在。
