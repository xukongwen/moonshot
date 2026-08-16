---
title: Moonshot 宪法
updated: 2026-08-15
status: active
tags: [constitution]
---

# Moonshot 宪法

## 目的

给 agent 一份不可漂移的仓库级判断：这是什么、代码与 wiki 谁说了算、哪些事默认不做。

## 当前判断

- 本仓是 [dgreenheck/moonshot](https://github.com/dgreenheck/moonshot) 的 fork。这个 fork 由 **grok-bot（程序员）** 继续写；用户 fork 在 https://github.com/xukongwen/moonshot 。
- 语言是 **JavaScript + three.js**，不是 TypeScript。
- 物理是 **patched-conic Kerbol 系统**。agent MCP 必须覆盖原版人类能做的每一个动作。
- **Wiki 是 agent 长期语义记忆**；**代码是行为真相**。wiki 编译知识，不替代源码。
- 截图证明飞行（「图有真相」）。不要用文字日志冒充已经飞过。
- 长期方向见 `wiki/总体计划.md`：有居民的小世界之间跑物流；现在不改尺度。

## 关键入口

- 新会话：`wiki/active-memory.md`，规则 `wiki/AGENTS.md`
- 天体 / SOI：`wiki/modules/patched-conics.md`
- 霍曼：`wiki/modules/hohmann.md`
- MCP：`wiki/modules/mcp.md`、`wiki/api/mcp-tools.md`

## 边界

- 不要加 Ike / Jool，除非用户明确要求。
- 不要 commit / push，除非用户明确要求。
- 不要发明遥测数字；数字只来自代码、测试或已有飞行日志。

## 已知问题

- MCP stdio 服务器已有，尚未做成 Cursor connector。
- 对接已做，见 `wiki/交汇对接架构计划.md`。
- 原版没有的机动节点、EVA、生涯模式，这里也还没有。
