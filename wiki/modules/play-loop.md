---
title: play-loop
updated: 2026-08-16
status: active
tags: [play, agent, script, loop]
---

# play-loop

## 目的

总图 + 分步 + 回退：起飞前一张总图，短脚本做肌肉，agent 在命名结点上检查并计划下一刀。错误可以是难度；中途能停、能看、能改，出错回到更早结点。

## 当前判断

2026-08-16 用户口说：错误可以是好事（难度）。要脚本 + agent，不要一条巨脚本。把航程切成很多段；每过一个阶段，agent 出来检查并计划下一步。更好看；中途错误可以纠正。

程序员 + 用户拍板：

- **脚本 = 短肌肉，不做判断。** 重力转弯、自杀燃烧、rails/warp 滑行。一段做完就停。
- **agent = 脑，只在命名结点上醒。** 看燃料、轨道、还剩哪一级、剩余预算对剩余阶段，再选下一刀。
- **例结点：** LKO、回收助推、转移窗口、TDI/逃逸后、进 SOI、捕获、丢掉转移级、着陆、上升后。
- **0.1s 物理步不是 agent 的活。** agent 不跟每一个物理 tick。
- **结点必须能快照、能截图。** 观赏性：用户从云端看。
- **可恢复的失误是玩法。** 反例：2026-08-15/16 Duna TDI 把 Falcon 烧干、点着陆器；巨脚本把回家吃掉了。TDI 后若有结点，会停下来重计划。
- **agent 在结点读的是 Layer 1 预算（src/plan.js）。** Layer 2 失败病例还没做，以后再说。
- **现有 mun-return / duna-landing 测试仍是旧的一条龙脚本。** 在循环落地前当回归肌肉留着，本页这次不删。
- **起飞前要有一张总图。** agent 先做整体规划（任务阶段 + Layer 1 预算），再拆成结点一步步走。不是盲飞到结点才想。
- **出错就回到上一步，或更早的某步。** 每个结点落地一份快照（已有 session save / logs/snapshots）。纠偏 = 读回那个结点，改计划再往下，不是从发射台重开（除非总图本身坏了）。
- 这就是人类：先想整条任务，再一刀一刀烧，烧砸了 F9 回快速存档。

A1–A6 已做。2026-08-16 agent 路径 Duna 着陆并回家已飞通，瑕疵照写，见 [../2026-08-16-agent-duna-往返.md](../2026-08-16-agent-duna-往返.md)。mun-roundtrip 入轨后有一刀「回收助推」（R5），见 [../助推回收计划.md](../助推回收计划.md)。肌肉还粗。实现切片见 [游戏内Agent计划.md](../游戏内Agent计划.md)。

## 关键入口

src/plan.js
tests/lib/autopilot.mjs
mcp/server.mjs
wiki/总体计划.md
wiki/modules/flight-planning.md
wiki/游戏内Agent计划.md

## 边界

不要开始 RL。
不要让 agent 每个物理 tick 都飞。
不要用过场动画替换物理。
不要删 mun-return / duna-landing 回归脚本，直到循环落地。
