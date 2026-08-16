<!-- wiki-auto-curator:near-window -->
# Wiki Log（近 14 天）

> 更早条目已卷到 [`wiki/log/`](./log/)。生成：`node scripts/wiki-auto-curator.mjs`。

- [2026-08-16] 发布 v0.1.4。
- [2026-08-16] Agent 路径 Duna 着陆并回家：全文 [2026-08-16-agent-duna-往返.md](./2026-08-16-agent-duna-往返.md)。落地 5849 kg，回家触地 1.18 m/s / 317 kg。瑕疵照写。这次之前没打板。
- [2026-08-16] Duna 回家：相遇快照捕获 572×1985 km / 494 kg，伞+舱落到 Kerbin，触地 1.18 m/s，AGL 0，剩 317 kg。Sparrow only，没点 Raven。
- [2026-08-16] Duna 上升改 loft 80/58 km；落地快照入轨 59×130 km / 2590 kg，回家 Kerbin 相遇 572×∞ km / 1328 kg。未捕获、未落地。
- [2026-08-16] 加 R-40 Raven（Isp 360 / 120 kN / 900 kg）。Duna Hauler 转移级 Falcon→Raven。agent 飞通 pad→Duna 着陆器落地 5849 kg；上升停在 48×54 km，未回家。
- [2026-08-16] Duna Hauler 改回 4×L+M / 8 XL / 6 SRB；agent 入轨 72×90、转移级 5231 kg。5×L+M+9 XL（TWR 1.084）坠毁，未点 Sparrow，未到 Duna。
- [2026-08-16] Duna Hauler Falcon +1 tank-l（5×L+M，8×XL+6 SRB，twrSL 1.176）；agent 从垫起飞入轨失败 Pe 62×4188 km，Falcon 干，着陆器未点。
- [2026-08-16] Agent 逃逸改烧到计算 v∞（目标 918）；Duna Hauler 窗口快照实际 v∞ 839、Falcon 干，滑行 kerbol 最近 316718 km（未到 Duna）。
- [2026-08-16] Agent 肌肉：逃逸/TLI/捕获/着陆/上升/回家落地；landerIsLive 只信点火不信 stageIdx；Titan-only 丢助推。
- [2026-08-16] A6 MCP：ksp_agent_get/toggle/plan/step/revert/check，与面板同一状态；stdio 无 HUD。
- [2026-08-16] A5 真检查想法：转移级干/着陆器早点火/预算不过/船毁亚轨道，只报真实字段。
- [2026-08-16] A4 回退：revertTo 套 flight.applySnapshot，计划结点回到 current，按钮「回退」。
- [2026-08-16] A3 分步执行：走一步一刀，入轨/窗口/滑行/丢级是真肌肉，其余 stub；快照写入 plan.snapshots。
- [2026-08-16] A2 目标→总图：parseGoal 映射 mun/duna，planMission 出预算，飞行+VAB pendingGoal。
- [2026-08-16] A1 面板落地：演示「去火星再回来」计划+思考栏，键 O，截图 agent-panel.png。MCP 等到 A6。
- [2026-08-16] 游戏内 Agent：A1 面板进行中。人提粗需求，总图拆刀，一刀一刀飞。见 游戏内Agent计划.md。
- [2026-08-16] 玩法补：飞前总图，分步执行，出错回更早结点。
- [2026-08-16] 玩法：脚本做短动作，agent 在结点检查并计划下一刀。
- [2026-08-15] Duna Hauler 垫起飞通：twrSL 1.202，LKO 72×90 km，TDI v∞ 864，中途 CA 114.24 Mm，Duna 触地 9.58 m/s / 1494 kg；起飞未进轨道，未回家。
- [2026-08-15] Duna Hauler 预算闭合：lifter 覆盖 ascent（8× XL），redesign 先补 Titan 不堆 Falcon。
- [2026-08-15] kerbin_ascent 改成先 lifter 再 transfer 剩余；Mun Express 过预算，Duna Hauler 诚实失败在 ejection。
- [2026-08-15] 任务 Δv 预算落地：planMission / redesignForBudget，MCP ksp_plan / ksp_redesign。
- [2026-08-15] 飞行规划：先 Δv 预算，再失败病例重试。
- [2026-08-15] Mun pad→着陆→回家飞通（触地 2.87 / 10.74 m/s）；Duna 低轨软着陆 9.99 m/s。Duna Hauler 入库。
- [2026-08-15] Mun 着陆器单独落地并回家：低轨丢掉 Sparrow，Mun 2.87 m/s，Kerbin 10.74 m/s；Duna 轨道起点软着陆 9.99 m/s（未回家）。
- [2026-08-15] 图片库：art/，概念图收入宇航服番茄和迷你星球卫星。
- [2026-08-15] 总体计划：KSP+动森+MC，脊梁是小世界星际物流；0.1.x 不改尺度。
- [2026-08-15] 发布 v0.1.3。
- [2026-08-15] 交汇对接 R1–R6 落地，打板 v0.1.3。
- [2026-08-15] 交汇对接 R1–R6 无头落地：vessels[]、相对导航、RCS/对接口、硬焊、formatVersion 2；80/100 km 交汇测试 range 2336 m、rel 8.3 m/s。
- [2026-08-15] 交汇对接架构计划：R1–R6，先交汇后对接，不依赖机动节点。
- [2026-08-15] 游戏顶栏显示 v + package.json version（装配间和飞行）。
- [2026-08-15] 发布 v0.1.2。
- [2026-08-15] 黑话「打板」= 收 wiki + 跑版本 + 提交推送。
- [2026-08-15] 发布 v0.1.1。
- [2026-08-15] 整局游戏存档 formatVersion 1：ksp_save / ksp_load，F5 快速存档，F9 读档
- [2026-08-15] Kerbol patched-conic 系统落地：Kerbin / Mun / Minmus / Duna，getBodyState 保持父星相对
- [2026-08-15] Kerbin 到 Duna 霍曼飞通：窗口 0.04 度，TDI vInf 874，中途 +11 m/s，捕获 19188 x 47378 km，燃料 519 kg
- [2026-08-15] 界面 i18n：en/zh，localStorage moonshot.lang，快捷键 L
- [2026-08-15] MCP VAB 无头车间 + 34 个工具；crafts.json 与浏览器 localStorage 分库
- [2026-08-15] MCP 拼出「这也能飞？」并截图
- [2026-08-15] Wiki bootstrap：宪法、SCHEMA、模块、ADR、curator






















































