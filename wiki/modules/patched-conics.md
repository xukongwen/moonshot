---
title: patched-conics
updated: 2026-08-15
status: active
tags: [physics, soi, kerbol]
---

# patched-conics

## 目的

说明 Kerbol 嵌套 SOI 与天体状态约定，避免把父星相对坐标误当成惯性坐标。

## 当前判断

Kerbol 是惯性根。行星：Kerbin、Mun、Minmus（倾角 6 度）、Duna（又名火星）。
getBodyState 保持父星相对：Mun 的 SMA 与 phase0=1.7 不变，Mun Express 路径才能继续工作。
惯性坐标用 getInertialState（沿父链累加）；任意两体相对用 getRelativeState。
childrenOf 列子星。checkSOI：进入子星 SOI 则减去子星相对状态；离开当前 SOI 则加回自身相对父星的状态并回到父星。

## 关键入口

src/constants.js：BODIES、getBodyState、childrenOf、getInertialState、getRelativeState
src/physics.js：checkSOI
src/orbits.js：findEncounter 等，子星状态同样走 getBodyState
测试：tests/system.test.mjs

## 边界

不要加 Ike / Jool，除非用户明确要求。
不要把 getBodyState 改成 Kerbol 惯性，否则 Mun 相位与遇月搜索会断。

## 已知问题

只有这四颗绕行体。地图跟当前 SOI：Kerbin 看见 Mun/Minmus，太阳轨道看见 Duna。
