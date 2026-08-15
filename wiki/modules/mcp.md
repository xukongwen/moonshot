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
DOM-free 车间：mcp/workshop.mjs。无头存档在 mcp/crafts.json。浏览器 VAB 用 localStorage 键 moonshot-crafts。两套仓库，不要混。
发射校验：必须有 command pod 和 engine。
测试 tests/workshop.test.mjs 会从空车间重建 Mun Express。

34 个工具：ksp_new_flight, ksp_telemetry, ksp_stage, ksp_throttle, ksp_sas, ksp_point, ksp_controls, ksp_legs, ksp_chutes, ksp_step, ksp_parts, ksp_vab_get, ksp_vab_set_name, ksp_vab_clear, ksp_vab_select, ksp_vab_add_part, ksp_vab_remove_part, ksp_vab_move_part, ksp_vab_add_radial, ksp_vab_remove_radial, ksp_vab_stock, ksp_vab_save, ksp_vab_list, ksp_vab_load, ksp_vab_delete, ksp_vab_launch, ksp_vab_stats, ksp_coast, ksp_warp, ksp_revert, ksp_relaunch, ksp_map, ksp_camera, ksp_lang。

## 关键入口

工具表：wiki/api/mcp-tools.md
车间：mcp/workshop.mjs
会话：mcp/session.mjs
测试：tests/workshop.test.mjs

## 边界

ksp_vab_save 写入 mcp/crafts.json，不写浏览器 localStorage。
ksp_step / ksp_coast 单次最多 120 秒。
尚未接 Cursor MCP connector。

## 已知问题

两套 craft 存储会让「浏览器里保存的船」在无头侧看不见。
