---
title: Mun Express
updated: 2026-08-15
status: active
tags: [mission, mun]
---

# 任务：Mun Express

## 目的

指向库存登月船与相关测试，不把整份飞行日志贴进来。

## 当前判断

库存船 Mun Express。自动驾驶入口 tests/mission.test.mjs。
历史记录（ROUNDTRIP_LOG）：LKO 74 x 90 km，Mun 24 x 2107 km。早期往返再入坠毁，不要把「已经回家」写成当前事实。
当前 mission.test 是否必过、落点与剩余燃料，以 tests/mission.test.mjs 和它写出的 FLIGHT_LOG.md 为准，本页不另断言。

## 关键入口

tests/mission.test.mjs
FLIGHT_LOG.md
ROUNDTRIP_LOG.md
mcp/roundtrip.mjs

## 边界

不要把某一次成功着陆或某一次坠毁推广成永远如此。
不要发明新的轨道数字。

## 已知问题

往返再入曾在 ROUNDTRIP_LOG 里失败。回家不是已交付能力。
