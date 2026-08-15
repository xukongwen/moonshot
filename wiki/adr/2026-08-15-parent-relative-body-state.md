---
title: ADR parent-relative body state
updated: 2026-08-15
status: active
tags: [adr, physics]
---

# ADR：getBodyState 保持父星相对

## 目的

锁定天体状态坐标系，避免为了「太阳系惯性」拆掉 Mun Express。

## 当前判断

决定：getBodyState(name, t) 返回相对 parent 的圆轨道状态，不是 Kerbol 惯性。
Mun 的 orbitRadius=12e6、phase0=1.7 保持不变，既有遇月搜索与 mission 路径才能继续用同一组数。
需要惯性时走 getInertialState；需要任意两体相对时走 getRelativeState。
checkSOI 进入子星 / 离开回父星都按这套相对状态加减。

## 关键入口

src/constants.js
src/physics.js checkSOI
wiki/modules/patched-conics.md
tests/system.test.mjs

## 边界

不要把 getBodyState 改成累加到 Kerbol。那会让 Mun SMA/相位语义漂移。
不在本 ADR 加新天体。

## 已知问题

调用方必须自己知道「当前 frame 是谁」。混用相对与惯性会 silently 飞飞错。
