---
title: versioning
updated: 2026-08-16
status: active
tags: [version, release]
---

# versioning

## 目的

说明 Moonshot 的长期预发布版本：`0.<era>.<minor>.<build>`。默认只加 build。大版本和换代必须用户亲口说。

## 当前判断

`package.json` 从三位数 `0.1.6` 迁到四位数。第一次四位打板是 `0.1.1.1`（不要写成 0.1.7）。之后日常打板是 `0.1.1.2`、`0.1.1.3`……
游戏顶栏显示 `v` + package.json version（装配间和飞行）。
每次发布会把版本写到 README 的 `当前打板：**v0.1.1.1**`（三位或四位都能换）。

| 位 | 名字 | 谁加 | 开关 |
|---|---|---|---|
| 0 | 非正式 | 锁定 | `--major` 拒绝，除非用户说「出正式版」（现在永远不） |
| era | 代际 | 用户说「换代」 | `--era` → `0.(era+1).1.0` |
| minor | 大版本 | 用户说「大版本」 | `--minor` → `0.era.(minor+1).0` |
| build | 打板 | 默认 | 末位 +1 |

三位数 `0.E.B` 仍能解析：当成 `{ major:0, era:E, minor: 缺 }`。第一次从 `0.1.6` 打板变成 `0.1.1.1`，不要变成 `0.1.7`。已是四位则 `0.1.1.1` + build → `0.1.1.2`。

没有显著提交时脚本跳过，避免小修刷版本。`--force` 仍加 build。`--major` 永远拒绝。

## 关键入口

scripts/release.mjs
tests/release.test.mjs
CHANGELOG.md
README.md
wiki/releases/
package.json 的 release 脚本

## 边界

不要每个小修都跑 package.json 里的 release 脚本。
禁止自行升到 1.x。
不要自己加 `--minor`（除非用户说「大版本」）。
不要自己加 `--era`（除非用户说「换代」）。
不要把 era / minor 推断成「大功能该升了」。
脚本不提交、不推远程。
用户说「打板」才走完整收尾：wiki + release + 提交推送。
