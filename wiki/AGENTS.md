---
title: Wiki AGENTS
updated: 2026-08-15
status: active
tags: [wiki, agents]
---

# Wiki AGENTS

永远说中文。不要把整份 log 或 index 变更流水倒进聊天。

## 新会话

先读 wiki/active-memory.md（L1）。不要默认通读 index.md 或 log.md。
近窗日志用 grep 取 dated 行；更早见 wiki/log/ 月卷。

## 写入

持久结果写进 wiki，不写散落 markdown。
草稿进 wiki/drafts/。
正式页：井号标题；有用就加 YAML title / updated / status / tags。
页形：目的 / 当前判断 / 关键入口 / 边界。
做完：改页 + log.md 一行 + 结构变了才改 index + 跑 curator。
计划完成标 status: done。遗忘 = 离开 Active，不删文件。

## 边界

代码是行为真相。wiki 编译知识。
不要 commit / push，除非用户明确要求。
不要加 Ike / Jool，除非用户明确要求。
飞行用截图证明（图有真相）。不要发明遥测数字。

## 版本

较大功能后跑 `npm run release`（只加 0.1.N）。不要每个小修都跑。
禁止自行升到 1.x；用户没说「出正式版」就拒绝。
换代（0.2.0）只有用户明确说换代才 `--era`。

## 打板

用户说「打板」= 收 wiki + npm run release + 提交并推送到自己的 fork。没说打板不要推送。
打板 / release 必须把版本写到 README（脚本会改，不要手改）。
