---
title: Duna landing
updated: 2026-08-16
status: active
tags: [mission, duna]
---

# 任务：Duna / 火星着陆

## 目的

指向库存 Duna Hauler 与着陆测试。霍曼转移本身见 duna-hohmann.md。

## 当前判断

库存船 Duna Hauler（`src/stock.js`）。`ksp_vab_stock` 认这个名字。

2026-08-16 加 R-40 "Raven"（`eng-raven`：Isp vac 360 / SL 90，推力 120 kN，质量 900 kg）。默认 Hauler 转移级换成 Raven，仍是 4× tank-l + tank-m + 8 XL Titan + 6 SRB，pad twrSL **1.205**。agent 路径从垫飞：LKO **72×144 km**，转移级 6987 kg，Raven 亮、Sparrow 未点。TDI v∞ **861**（目标 918），Raven 剩 2148 kg。滑行进 Duna，捕获 **−248×319 km**，Raven 干。丢掉转移级后着陆器落地，剩 **5849 kg**，AGL 0。上升改 loft 后从落地快照入轨 **59×130 km** / 2590 kg。回家 Kerbin 相遇 572×∞ km / 1328 kg；捕获 **572×1985 km** / 494 kg，伞+舱落地触地 **1.18 m/s**，AGL 0，剩 **317 kg**，Sparrow only。全过程（含瑕疵）见 [../2026-08-16-agent-duna-往返.md](../2026-08-16-agent-duna-往返.md)。数字只以 `logs/agent-fly-duna-result.json` 为准。截图 `logs/shots/agent-fly-ascent.png` · `agent-fly-land.png` · `agent-fly-rise.png` · `agent-fly-home.png` · `agent-fly-kerbin-capture.png` · `agent-fly-kerbin-land.png`。

2026-08-16 更早库存是 4× tank-l + tank-m Falcon、8× XL + 6 SRB（`Duna Hauler Light` 同款）。83 km / turnStart 180 + 水平偏置圆化轨道：LKO **72×90 km**，剩油 11231 kg，转移级 **5231 kg**，Falcon 亮、Sparrow 未点，pad twrSL **1.202**。一次加厚实验 5×L+M + 9 XL + 6 SRB：pad TWR 1.084（<1.15），MET 82 s / ~0.5 km 坠毁，Titan 仍亮。10 XL TWR 1.005 没飞，没再堆 SRB，没点 Sparrow，没声称到 Duna。先前 5×L+M + 8 XL 是 Pe 62×4188、Falcon 干。数字只以 `logs/agent-fly-duna-result.json` 为准。截图 `logs/shots/agent-fly-ascent.png`。

2026-08-15 后一次（`logs/duna-roundtrip-result.json`）：6× SRB-30 挂在最后一级 XL 上，stagingStats twrSL = 1.202，湿重 206610 kg。垫起飞成功，LKO 72 × 90 km、剩 11210 kg。窗口 44.40°（目标 44.36°，误差 0.04°），TDI 渐近线对准 α=-59.5°，v∞ 864（目标 918）。中途 CA0 114.24 Mm，Δv +40 / 径向 −25，进 Duna SOI。捕获 723 × 44582 km。低轨后只留 Sparrow 着陆器。触地 9.58 m/s、剩 1494 kg、MET 4624:31:23、未坠毁、伞已开。截图 `logs/shots/duna-landed.png`。表面起飞停在 −21 × 51 km，没有 Kerbin 返回。数字只以 `logs/LANDING_LOG.md` 为准。

更早的 Mun Express Kerbin→Duna 霍曼（捕获、不着陆）仍见 duna-hohmann.md / DUNA_LOG.md。

## 关键入口

src/stock.js
src/parts.js
tests/duna-landing.test.mjs
logs/agent-fly-duna-result.json
logs/LANDING_LOG.md
logs/duna-roundtrip-result.json
logs/shots/agent-fly-land.png
logs/shots/duna-landed.png
wiki/2026-08-16-agent-duna-往返.md
wiki/missions/duna-hohmann.md
wiki/adr/2026-08-15-ejection-asymptote.md

## 边界

不要把轨道起步写成这一次的 pad-to-pad。
不要发明新的轨道数字。

## 已知问题

TDI 把 Falcon 烧干并点着着陆器，触地只剩 1494 kg。同一次表面起飞停在 −21 × 51 km，没有 Kerbin 返回。
Falcon 4-tank TDI 不够（v∞ 839 vs 918）。Raven 4-tank 到了 Duna 并落地；上升一度停在 48×54 km，loft 后再飞 59×130 km，回家已落到 Kerbin。
