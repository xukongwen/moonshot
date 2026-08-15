# Changelog

版本格式是 `0.<era>.<build>`，不是经典 Semver（不要把中间位当成「大功能」）。

- **0**（主版本）锁定为非正式版。脚本拒绝任何升到 1.x 的操作。升到 1.x 等于出正式版，必须用户亲口说「出正式版」。
- **era**（中间位）是代际，从 1 起。默认发布不加 era。只有用户明确要求换代时才用 `--era`（例如 0.1.12 → 0.2.0）。
- **build**（末位）是日常递增值。每次较大交付 +1：0.1.1、0.1.2、0.1.88…

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

