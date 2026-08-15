---
title: Duna Hohmann
updated: 2026-08-15
status: done
tags: [mission, duna]
---

# 任务：Kerbin 到 Duna 霍曼

## 目的

指向已飞通的行星转移，不把整份日志贴进 wiki。

## 当前判断

2026-08-15 无头自动驾驶飞通：窗口误差 0.04 度，TDI vInf 874，中途 +11 m/s，Duna 捕获 19188 x 47378 km，剩燃料 519 kg。
全文与截图在 DUNA_LOG.md。脚本 mcp/duna-hohmann.mjs。船是库存 Mun Express。

## 关键入口

DUNA_LOG.md
mcp/duna-hohmann.mjs
wiki/modules/hohmann.md
wiki/adr/2026-08-15-ejection-asymptote.md

## 边界

不要把 DUNA_LOG.md 全文复制到本页。
不要在本页发明新的轨道数字。

## 已知问题

有限推力 TDI 的 vInf 低于理想 918。
