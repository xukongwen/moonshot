# Moonshot

本仓库是 [dgreenheck/moonshot](https://github.com/dgreenheck/moonshot) 的 fork。

**原版作者：** [Daniel Greenheck](https://github.com/dgreenheck)（[@dgreenheck](https://github.com/dgreenheck)）。游戏本体——装配、飞行物理、开普勒轨道、Kerbin↔Mun、程序地形和座舱——都是他写的。

**这个 fork：** 由 **grok-bot（程序员）** 在原版上继续写。我们会在这个基础上一直完善，目标是做成 agent 能飞的小型 KSP。

This repo is a fork of [dgreenheck/moonshot](https://github.com/dgreenheck/moonshot) by **Daniel Greenheck**. The Kerbol system, interplanetary Hohmann, headless autopilot, and flight logs in this tree were added by **grok-bot**. We plan to keep building on it.

## 这个 fork 多了什么

- **Kerbol 嵌套 SOI：** Kerbol 为惯性根，Kerbin / Mun / Minmus / Duna（火星）。patched conics，出 SOI 换父星。
- **行星霍曼转移：** 窗口相位、逃逸 v∞、渐近线对准点火。已飞通 Kerbin → Duna 捕获（见 `DUNA_LOG.md`）。
- **无头驾驶：** `mcp/session.mjs` 同一套物理；`mcp/duna-hohmann.mjs`、`mcp/systemtour.mjs`、`mcp/roundtrip.mjs`。
- **日志和截图：** 关键节点 snapshot + 地图/飞行图，在 `logs/`。

```bash
npm install
npm run dev        # 打开打印的 URL（Chrome/Edge 走 WebGPU）
npm test           # 开普勒 / 天体树 / 霍曼
npm run mission    # 原版：无头自动驾驶登 Mun
node mcp/duna-hohmann.mjs   # Kerbin → Duna 霍曼
node mcp/systemtour.mjs     # 入轨、Minmus、逃出 Kerbin
```

## What is simulated

原版（Daniel Greenheck）已经有的：

- **Vehicle assembly** — stack parts, radial boosters, auto-staging, Δv / TWR / burn time, craft save/load.
- **Flight physics** — RK4, Isp(pressure), atmosphere, drag + CoP, reaction wheels, gimbal, SAS.
- **Orbital mechanics** — Kepler elements, elliptic and hyperbolic propagation, time warp (physics to 4×, on-rails to 100,000×).
- **Thermodynamics, staging, landing, cockpit** — as in upstream.

这个 fork 把「只有 Kerbin↔Mun」扩成了太阳系树：

- 天体状态相对父星；`checkSOI` / `findEncounter` 对任意子星通用。
- 霍曼：`hohmannTransfer('kerbin','duna')`、`ejectionDeltaV`、`planetPhaseDeg`。
- 地图跟当前 SOI：Kerbin 能看见 Mun 和 Minmus，太阳轨道能看见 Duna。

尺度仍是 KSP（Kerbin R=600 km，Mun 12,000 km）。CPU 双精度 + floating origin。`tests/orbits.test.mjs` 对 RK4，`tests/system.test.mjs` 锁 Mun 轨道数，`tests/hohmann.test.mjs` 锁 Duna 窗口，`tests/mission.test.mjs` 仍是原版登月自动驾驶。

## Controls

| Key | Action |
|---|---|
| `Space` | next stage |
| `Shift` / `Ctrl` | throttle up / down (`Z` full, `X` cut) |
| `W S A D Q E` | pitch / yaw / roll |
| `T` | SAS on/off · `1` hold · `2` prograde · `3` retrograde |
| `G` | landing legs |
| `P` | arm parachutes |
| `M` | map view |
| `,` / `.` | time warp |
| `H` | help |

## How to land on the Mun (stock "Mun Express")

和原版一样：东向入轨，等 Mun phase 到 *burn at*，霍曼到 Mun Pe 15–30 km，捕获后腿着陆。回家时 Kerbin Pe 瞄准 30–45 km。细节见上游 README 和 `ROUNDTRIP_LOG.md`。

## 接下来

还要在这套 patched conics 上继续做：更稳的入轨/再入、更好的中途修正、更多天体、agent 用的飞行接口。原版没做的机动节点、对接、EVA、生涯模式，也还没有。

## License / credit

原版版权和许可以 [dgreenheck/moonshot](https://github.com/dgreenheck/moonshot) 为准。本 fork 的新增代码同样归在这个仓库里，并明确致谢 Daniel Greenheck。
