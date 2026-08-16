---
title: MCP tools
updated: 2026-08-16
status: active
tags: [api, mcp]
---

# MCP tools

agent 可读工具目录。描述来自 mcp/server.mjs 的 TOOLS。共 52 个。

| 工具 | 含义 |
|---|---|
| ksp_new_flight | 用库存船在 Kerbin 发射台开新飞行并重置会话 |
| ksp_telemetry | 读飞行 HUD：高度、速度、轨道、燃料、分级、时间加速、相机、电（ec / ecCap / ecGen / eclipsed / panelW）和 wheelsLive |
| ksp_stage | 空格：下一级（点火、分离、丢助推或开伞） |
| ksp_throttle | 油门 0..1 |
| ksp_sas | 稳定辅助：off / hold / prograde / retrograde |
| ksp_point | 瞬间改姿态（与 mission 自动驾驶相同的作弊指头） |
| ksp_controls | 俯仰/偏航/滚转杆量 -1..1，省略轴不变 |
| ksp_legs | 收放着陆腿 |
| ksp_chutes | 武装降落伞（安全时自动开） |
| ksp_step | 推进仿真，单次最多 120 秒；时间加速大于 4x 走 on-rails |
| ksp_parts | VAB 零件目录 |
| ksp_vab_get | 看当前设计：堆栈、径向、选中件、分级与 Dv |
| ksp_vab_set_name | 写飞船名 |
| ksp_vab_clear | 清空堆栈和径向，保留名字 |
| ksp_vab_select | 点选堆栈件，-1 取消 |
| ksp_vab_add_part | 往堆栈加零件；径向件必须走 add_radial |
| ksp_vab_remove_part | 删堆栈件并丢掉挂在上面的径向件 |
| ksp_vab_move_part | 堆栈上下移动 |
| ksp_vab_add_radial | 径向挂助推/翼/腿 |
| ksp_vab_remove_radial | 删一条径向挂件 |
| ksp_vab_stock | 载入库存 Hopper 或 Mun Express |
| ksp_vab_save | 存到 mcp/crafts.json，不是浏览器 localStorage |
| ksp_vab_list | 列出用户船加库存名 |
| ksp_vab_load | 载入用户船（库存用 stock） |
| ksp_vab_delete | 从 mcp/crafts.json 删用户船 |
| ksp_vab_launch | 校验（要有舱和引擎）并从当前设计起飞 |
| ksp_vab_stats | 读 VAB 分级与 Dv 面板 |
| ksp_coast | 滑行等待，单次最多 120 秒 |
| ksp_warp | 时间加速 0..8 |
| ksp_revert | 结束飞行回车间，设计保留 |
| ksp_relaunch | 同一设计再上发射台 |
| ksp_map | 开关地图 |
| ksp_camera | 轨道相机方位/俯仰/距离 |
| ksp_lang | 切 UI 语言 en / zh |
| ksp_save | F5 / 存档：整局写入 mcp/saves/ |
| ksp_load | F9 / 读档：整局读回 |
| ksp_saves_list | 列出游戏存档槽 |
| ksp_saves_delete | 删除游戏存档槽 |
| ksp_vessels | 列出会话里的船：id、name、body、高度、状态 |
| ksp_spawn_orbital | 把库存船或设计放到开普勒轨道（圆轨道 ap=pe） |
| ksp_target | 选定目标船，或 null 取消 |
| ksp_translate | RCS 平移杆量，体轴 -1..1（+y 机头） |
| ksp_dock | 尝试捕获；门槛满足即硬焊 |
| ksp_undock | 拆开焊接并给一点分离 |
| ksp_plan | 用 mun-roundtrip / duna-roundtrip 的 Δv 预算给当前 VAB 或库存船打分，不飞 |
| ksp_redesign | 按预算给缺油的级加罐或 SRB；VAB 当前设计写回车间，库存名只返回新设计不改 stock.js |
| ksp_agent_get | 读 agent 面板状态：visible、goal、missionId、结点、当前刀、思考、running、有快照的结点、plan.ok / fail。不编油和 Δv |
| ksp_agent_toggle | 开/关 agent 面板（只改 flag；无头无 DOM） |
| ksp_agent_plan | 粗目标 → mun/duna 总图，与面板「规划」相同。有船用当前船，否则库存 |
| ksp_agent_step | 走一步然后停，不连刀。不是 ksp_step |
| ksp_agent_revert | 回退到已完成结点快照。不是 ksp_revert（回 VAB） |
| ksp_agent_check | 跑 A5 检查并追加思考（含夜里低电、SAS 死） |

`ksp_telemetry` 在有目标且同一 SOI 时多：`target`、`range_m`、`closing_ms`（负=接近）、`rel_speed_ms`、`dockState`。电字段来自 `ecTelemetry`：`ec`、`ecCap`、`ecGen`、`eclipsed`（天体 id 或 null）、`panelW`，另带 `wheelsLive`。无新控制工具。

## 边界

这是目录，不是实现。行为以 mcp/server.mjs 为准。
