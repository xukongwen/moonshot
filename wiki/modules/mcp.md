---
title: mcp
updated: 2026-08-15
status: active
tags: [mcp, vab]
---

# mcp

## 目的

说明无头 MCP 如何覆盖原版人类操作：飞行、VAB、地图、语言。

## 当前判断

stdio 入口是 mcp/server.mjs（还不是 Cursor connector）。
DOM-free 车间：mcp/workshop.mjs。无头飞船在 mcp/crafts.json。浏览器 VAB 用 localStorage 键 moonshot-crafts。整局游戏存档另见 mcp/saves/ 与 moonshot-saves。不要混。
发射校验：必须有 command pod 和 engine。
测试 tests/workshop.test.mjs 会从空车间重建 Mun Express。

38 个工具：原 34 个加上 ksp_save、ksp_load、ksp_saves_list、ksp_saves_delete（整局存档，见 modules/saves.md）。ksp_vab_save 仍只存飞船。

## 关键入口

工具表：wiki/api/mcp-tools.md
车间：mcp/workshop.mjs
会话：mcp/session.mjs
测试：tests/workshop.test.mjs · tests/saves.test.mjs

## 边界

ksp_vab_save 写入 mcp/crafts.json，不写浏览器 localStorage。
ksp_step / ksp_coast 单次最多 120 秒。
尚未接 Cursor MCP connector。

## 已知问题

两套 craft 存储会让「浏览器里保存的船」在无头侧看不见。
