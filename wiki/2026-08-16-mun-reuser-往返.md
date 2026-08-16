---
title: Mun Reuser 地月往返
updated: 2026-08-16
status: active
tags: [moonshot, mun, recover, agent]
---

# Mun Reuser 地月往返

数字只来自 `logs/mun-reuser-result.json`（2026-08-16T05:35:47Z 全垫，`MUN_REUSER_REDESIGN=0`）。没改物理。未打板。

## 船

库存 `Mun Reuser`：着陆 pod/chute/shield/dec/tank-l/tank-s/Kestrel + LT-2；转移 5×tank-l + tank-m + Falcon；助推 dec-l/adapter/3×XL/Titan + LT-25 + fins + 2 SRB（host 19）。TWR 1.656，湿重 102710 kg。纸面预算不扣 Titan 8500 kg 储备。

## 全垫实数

| 节点 | 结果 |
|---|---|
| ascent | LKO 72×91 km，总油 8324 kg，Falcon 3824 kg |
| recover | Titan 落地 Kerbin，离垫 **2766 m / 2.77 km**，触地 **2.50 m/s**，water=false，crashed=false，剩 1615 kg。**不是上垫** |
| window | 相位 111.6°（目标 110.8°） |
| tli | 88×10051 km，总油 4643 kg |
| coast | mun 1689×∞ km |
| capture | 1689×2223 km，Falcon 干后 Kestrel 接手，总油 3970 kg |
| jettison | 丢掉 Falcon + 转移罐，只剩着陆器 |
| land | mun landed，**1828 kg**，lander-only（无 Falcon/Titan/Sparrow） |
| rise | 22×28 km，965 kg |
| home | Kerbin 开伞落地，触地 **1.17 m/s**，剩 **655 kg**，dead=false |

判定：助推回收是；Mun lander-only 是；Kerbin home 是；上垫否。

图：`logs/shots/mun-reuser-recover.png` · `mun-reuser-mun-land.png` · `mun-reuser-home.png`（全垫快照，不是隔离重放）。

## 回家怎么飞

不要 `hohmannTransfer('mun','kerbin')`（父母不同，会追太阳尺度 v∞，曾把 965 kg 烧到 7 kg 仍停在 mun 1472×∞）。

从月轨向内逃逸：对准 inward 射出角，顺速度烧到离开缪恩 SOI 或 v∞ 够把科比因近点压到约 70 km，再 `finishHomeAtKerbin`（倒推近点进大气 + 开伞）。沿速度一直烧到 `a<0` 会抬成 9827×28377，每圈切缪恩。

捕获必须 `allowLander: true`：Falcon 143 kg 烧干后点 Kestrel。

## 失败过的船（不要再走）

Sparrow 转移入轨死；Falcon 4×XL 回收下水 43.7 km / 14.94 m/s；6/7/8×L+M 入轨干死；5×L+2M 解体或卡椭圆。5×L+M 是能回收+入轨+TLI 的上限。

## 入口

- `src/stock.js` Mun Reuser
- `src/agent-burns.js` `leaveMunForKerbin` / `runHomeMuscle` / `finishHomeAtKerbin`
- `scripts/agent-fly-mun-reuser.mjs`
- `logs/mun-reuser-result.json`
- `logs/snapshots/mun-reuser-{recover,land,home}.json`
