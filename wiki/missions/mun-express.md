---
title: Mun Express
updated: 2026-08-16
status: active
tags: [mission, mun]
---

# 任务：Mun Express

## 目的

指向库存登月船与往返测试。表面只要着陆器，不要把转移级一起放下。

## 当前判断

库存 Mun Express：短着陆器是 pod + chute + heat-shield + tank-m + tank-s + Kestrel，一条 LT-2 环在着陆器 tank-s（host 5），收起贴罐。返回舱不挂腿；decouple: 3 之后是 pod+chute+shield，再入靠伞。Titan 段最下一节 XL 是 LT-25（host 16）。指挥舱 host 0 两块 OX-STAT（`sym: 2`，90°/270°，共面）+ 一块 Z-100；助推 host 16 再一块 Z-100。图 `logs/shots/panel-coplanar.png` · `legs-stowed-pod.png`。
低 Mun 轨道先丢掉 Sparrow 转移级，再动力下降。不要在 Sparrow 上着陆再分离。

tests/mun-return.test.mjs 一次通过（数字以 logs/mun-return-result.json 为准）：
Mun 2.87 m/s，剩 1251 kg，MET 14:00:22；Kerbin 10.74 m/s，MET 26:21:01。
截图 logs/shots/mun-landed.png（短栈，无 Sparrow / Titan）。快照 logs/snapshots/mun-landed.json。

早期 ROUNDTRIP_LOG 再入坠毁不要写成当前事实。mission.test.mjs 仍是只去 Mun 的历史入口。

## 关键入口

tests/mun-return.test.mjs
tests/lib/autopilot.mjs（dropToLander、tkiFromMun、kerbinReentry）
src/stock.js
logs/mun-return-result.json
logs/shots/mun-landed.png
FLIGHT_LOG.md
ROUNDTRIP_LOG.md

## 边界

不要把某一次成功着陆推广成永远如此。
不要发明新的轨道数字。
不要为了省燃料改回「转移级着陆」。

## 已知问题

着陆器腿在画面里不明显，截图里看起来像坐在喷口上。
