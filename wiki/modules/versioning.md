---
title: versioning
updated: 2026-08-15
status: active
tags: [version, release]
---

# versioning

## 目的

说明 Moonshot 的长期预发布版本：`0.<era>.<build>`。agent 只加 build，不把中间位当成经典 Semver 的 minor。

## 当前判断

`package.json` 从 `0.1.0` 起。第一次真实发布是 `0.1.1`，之后较大交付变成 `0.1.2`、`0.1.88`……可以持续很多年。
游戏顶栏显示 `v` + package.json version（装配间和飞行）。

- **0** 锁定非正式版。升到 1.x 等于出正式版，必须用户亲口说「出正式版」。脚本没有把仓库升到 1.0 的开关。
- **era** 极少换代。默认 `npm run release` 不加 era。只有用户明确说换代才 `--era`（例如 0.1.12 → 0.2.0）。
- **build** 是会狂涨的那位。每次较大交付 +1。

没有显著提交时脚本跳过，避免小修刷版本。`--force` 仍加 build。`--major` 永远拒绝。

## 关键入口

scripts/release.mjs
tests/release.test.mjs
CHANGELOG.md
wiki/releases/
package.json 的 release 脚本

## 边界

不要每个小修都跑 `npm run release`。
禁止自行升到 1.x。
不要把 era 推断成「大功能该升了」。
脚本不 commit、不 push。
用户说「打板」才走完整收尾：wiki + release + 提交推送。
