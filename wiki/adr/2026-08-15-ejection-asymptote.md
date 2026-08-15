---
title: ADR ejection asymptote
updated: 2026-08-15
status: active
tags: [adr, hohmann]
---

# ADR：逃逸点火对准双曲线渐近线

## 目的

锁定 TDI 点火相位，避免在几何 midnight 烧出一条错过 Duna 的双曲线。

## 当前判断

决定：TDI 必须对准双曲线渐近线，而不是几何 midnight。
几何 midnight（速度几乎与 Kerbin 绕日速度同向）把双曲线近点放在背日线；转弯后 vInf 大约偏 59 度，转移会错过 Duna 数百万公里。
正确做法：在渐近线对准的真近点角点火，让剩余 vInf 沿 Kerbin 绕日顺行。有限推力燃烧绕该点居中。

2026-08-15 按此飞通：窗口误差 0.04 度，TDI vInf 874，中途 +11 m/s，Duna 捕获 19188 x 47378 km。

## 关键入口

mcp/duna-hohmann.mjs 里 TDI / EJECTION 段
wiki/modules/hohmann.md
DUNA_LOG.md

## 边界

本 ADR 只定点火相位，不定船型或中途修正策略。
不要把 midnight 对齐重新当成默认。

## 已知问题

有限推力使实际 vInf 低于理想 918，仍需一次小的中途修正。
