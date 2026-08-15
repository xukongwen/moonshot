---
title: saves
updated: 2026-08-15
status: active
tags: [save, mcp, vab, flight]
---

# saves

## 目的

说明整局游戏存档（session），不是飞船文件。

## 当前判断

format 是 `moonshot-save`，formatVersion 1。文档含 workshop、crafts 袋、以及 flight（mode=flight 时）。
Craft save ≠ game save：`ksp_vab_save` / localStorage `moonshot-crafts` 只存设计；`ksp_save` / `moonshot-saves` 存整局。
无头槽位在 `mcp/saves/*.json`（gitignore，目录靠 .gitkeep）。浏览器用 localStorage 键 `moonshot-saves`。
飞行块先还原 design 再套 snapshot（serializeSnapshot 字段），然后 stage / warp / sas / cam / map。
F5 写入槽名「快速存档」，F9 读选中槽，没有选中就读快速存档。

MCP：ksp_save、ksp_load、ksp_saves_list、ksp_saves_delete。

## 关键入口

src/save.js — 格式、校验、浏览器仓库
mcp/saves.mjs — Node 目录仓库
mcp/session.mjs — captureSave / applySave
mcp/server.mjs — 四个工具
src/main.js — 浏览器存档/读档、F5/F9
tests/saves.test.mjs

## 边界

不要用游戏存档替代飞船保存。不要把 mcp/saves 的 json 提交进 git。
读档飞行必须先 start(design) 再 applySnapshot，不能拿库存船硬套零件。
