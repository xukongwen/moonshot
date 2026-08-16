# Changelog

版本格式是 `0.<era>.<minor>.<build>`，不是经典 Semver。

- **0**（主版本）锁定为非正式版。脚本拒绝任何升到 1.x 的操作。升到 1.x 等于出正式版，必须用户亲口说「出正式版」。
- **era**（第二位）是代际，从 1 起。只有用户明确说「换代」才用 `--era`（例如 0.1.1.8 → 0.2.1.0）。
- **minor**（第三位）是大版本。只有用户明确说「大版本」才用 `--minor`（例如 0.1.1.8 → 0.1.2.0）。
- **build**（末位）是日常打板。默认发布只加 build：0.1.1.1、0.1.1.2…

## 0.1.1.1 — 2026-08-16

- 版本改为四位 `0.<era>.<minor>.<build>`。从 `0.1.6` 打板到 `0.1.1.1`（不要写成 0.1.7）。默认只加 build；大版本 / 换代 / 出正式版必须用户亲口说。
- 电力 E1–E6：船上 EC 池、SAS 出力扣电、太阳/影子、OX-STAT 侧翼 + Z-100、rails 也走电、MCP 检查、有头镜头。
- 库存 Express / Reuser / Hauler：指挥舱 host 0 两块共面 OX-STAT + 一块 Z-100；助推最后 XL 再一块电池。垫上 250 EC。
- LT-2 收起贴 1.25 m 罐；指挥舱不挂腿。开伞落地限 10 m/s。

## 0.1.6 — 2026-08-16

- Mun Reuser 全垫闭环：助推离垫 2.77 km / 2.50 m/s（非上垫），lander-only 缪恩 1828 kg，Kerbin 开伞 1.17 m/s / 655 kg。真物理，不传送。
- 回家肌肉改为缪恩向内逃逸（leaveMunForKerbin），不再追太阳霍曼 v∞。捕获允许 Falcon 干后点 Kestrel。
- MCP R6 已在树上：ksp_set_active / ksp_recover。测试 tests/booster-r6.test.mjs。
- 星空改为不透明先画，夜里不再透过地面。

## 0.1.5 — 2026-08-16

- 助推回收 R1–R5：扔下的 Titan 成可飞的船，翻转 + 弹道瞄准 boostback + 自杀燃烧。官方 R4 离垫 2.17 km / 9.31 m/s；R5 agent「回收助推」2.35 km / 8.55 m/s。真物理，不传送。
- LT-25 Heavy Landing Legs ×4（`legs-xl`：Utility，2.5 m，径向，500 kg，3.8 m，safeSpeed 12）。目录 22→23。Mun Express host 16 / Duna Hauler host 23；着陆器仍 LT-2。
- Titan 储备：Mun Express 8500 kg，Duna Hauler 5000 kg。

## 0.1.4 — 2026-08-16

- 游戏内 Agent A1–A6：面板、目标→总图、走一步、回退、真检查、MCP `ksp_agent_*`
- R-40 Raven（`eng-raven`：120 kN，Isp 360/90，900 kg，1.25 m）。目录 21→22
- Agent 路径 Duna 着陆并回家：落地 5849 kg；Kerbin 触地 1.18 m/s / 317 kg。瑕疵见 wiki/2026-08-16-agent-duna-往返.md

## 0.1.3 — 2026-08-15

- 交汇对接：多船 `vessels[]`、相对导航、霍曼交汇（80→100 km，2.3 km / 8.3 m/s）
- 对接口 `dock-port-s` + RCS 平移（I/K J/L H/N），硬对接/分离
- 存档 formatVersion 2（仍读 v1）
- 游戏顶栏显示 `v` + package.json 版本

## 0.1.2 — 2026-08-15

- 0.1.N 版本系统（只加 build，拒绝 1.x）
- 整局存档 formatVersion 1（F5/F9，ksp_save / ksp_load）
- 黑话「打板」：wiki + release + 推送

## 0.1.1 — 2026-08-15

- Add Chinese UI, headless VAB MCP, and a Nonos-style wiki. (`5705ad5`)
- Credit Daniel Greenheck in the README and note this fork is by grok-bot. (`b34c946`)
- Add Kerbol patched-conic system and Kerbin–Duna Hohmann transfer. (`9ebaece`)
- Remove node_modules from tracking, add .gitignore (`7017f98`)

## 0.1.0 — 2026-08-15

- Daniel Greenheck 原版。

