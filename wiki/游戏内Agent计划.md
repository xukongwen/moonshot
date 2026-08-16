---
title: 游戏内Agent计划
updated: 2026-08-16
status: done
tags: [plan, agent, ui]
---

# 游戏内Agent计划

## 目的

游戏内能看见 agent 如何规划、如何思考。人提粗需求（「去火星再回来」），agent 写出总图、拆刀、一刀一刀飞。可看、可停、出错回到更早结点。无头 MCP 仍给外部 agent 用。

玩法脊梁已锁在 wiki/modules/play-loop.md（脚本肌肉 + 结点 + 飞前总图 + 快照回退）。本页是游戏内能看见的那一层。

## 当前判断

2026-08-16 加了 R-40 "Raven"（真空转移 / kick，Isp 360 / 120 kN / 900 kg，不是核、不是 2.5 m）。库存 Duna Hauler 转移级从 Falcon 换成 Raven，仍是 4× tank-l + tank-m + 8 XL + 6 SRB。agent 从垫飞到 Duna：着陆器落地 5849 kg。旧上升 55/48 切在大气里（48×54 km）。上升改 loft Ap 80 km、Pe 58 km、18 km 才转弯、42 km 以上切 Ap；从落地快照再飞：59×130 km / 2590 kg。回家：Duna→Kerbin 向内逃逸 + 着陆器中途，Kerbin 相遇 572×∞ km / 1328 kg。home 刀从相遇快照捕获 **572×1985 km** / 494 kg，伞+舱落地触地 **1.18 m/s**，AGL 0，剩 **317 kg**，Sparrow only，没点 Raven。图 `logs/shots/agent-fly-kerbin-land.png`。TDI / 中途 / Duna 捕获只点 Raven；Kerbin 回家捕获点着陆器（转移级已丢）。

全过程（含瑕疵）见 [2026-08-16-agent-duna-往返.md](./2026-08-16-agent-duna-往返.md)。这次飞通之前没打板。

A1–A6 已做。六刀切完：面板、总图、走一步、回退、检查、MCP。A1 截图 logs/shots/agent-panel.png。A2 截图 logs/shots/agent-plan-a2.png。A3 截图 logs/shots/agent-step-a3.png。A4 截图 logs/shots/agent-revert-a4.png。A5 截图 logs/shots/agent-check-a5.png。A6 无新截图（stdio 无 DOM）。

玩家现在能看见总图，也能按「走一步」飞一刀，也能回退到已完成结点的快照。粗目标 → mun-roundtrip / duna-roundtrip → `planMission` 预算。步进只跑当前结点的短肌肉，刀后停、写快照、刷新面板。回退走 `flight.applySnapshot`（与读档同一条路），计划把该结点设为 current、后面改 pending。思考栏引用真实状态（油、轨道、级），不发明 Δv。A5 在走一步前后和「检查」里追加角色/油量/预算警告：转移级干了就说不要点着陆器；预算不过复用 `formatBudgetFail` 的 fail[0]；船毁或近拱点低于大气只报 `readFlightCheck` 给出的轨道。

A3 肌肉：入轨 / 等窗口 / 逃逸 / TLI / 滑行 / 捕获 / 丢掉转移级 / 着陆 / 上升 / 回家都是真的。逃逸/TLI 只点转移级、对准双曲线渐近线（不是几何 midnight），烧到计算 Hohmann v∞，不提前扣 50 kg 中途油；转移级 ≤1 kg 就拒绝、不点着陆器。滑行在逃逸后会 rails 过 SOI，没有交会才用转移级做小中途（含径向），转移级干了就诚实失败。捕获在目标近拱点逆行，转移级干了就拒绝。着陆是自杀燃烧/伞（Duna brakeFrac=0.70），必须先丢掉转移级。上升走 surfaceAscent，入不了轨就用真实 pe/ap/油失败。回家在 Kerbin 相遇后会捕获并伞降；没落地不说落地。入轨在浏览器里用 Flight.pilot 重力转弯。

A6 MCP 与面板同一套函数（applyGoal / runStep / revertTo / runChecks），挂在现有 SimSession 上，不另开会话、不假装无头 HUD。stdio 能做：get / toggle（只改 flag）/ plan / check / revert（有飞行+快照则 applySnapshotToState）/ step。window / coast / jettison 走 agent-muscles；escape / tli / capture / land / rise / home 走 agent-burns。已在轨道的入轨走 lkoAlready（真检查，不编轨道）。发射台入轨在 stdio 接了 ascentTick + session.step 真物理循环，便宜测试不飞这一段，不假装入轨成功。浏览器入轨仍是看得见的 Flight.pilot。

已拍板：

1. 脚本 = 短肌肉，不做判断。agent = 脑，只在命名结点上醒。
2. 起飞前先有总图（阶段 + Layer 1 预算），再拆刀。不是盲飞到结点才想。
3. 一刀一刀飞，刀后停、写快照、刷新面板。出错回到上一结点或指定结点。
4. 第一版确定性规划器（粗需求 → mun-roundtrip / duna-roundtrip → src/plan.js）。预留以后换 LLM，本页不塞大模型。
5. 人在面板上能做的，MCP 都能做。A1 面板是 DOM；无头 stdio session 没有 DOM，不假装无头面板。A6 已接。
6. 0.1s 物理不是 agent 的活。超长一条脚本不是目标。旧 mun-return / duna-landing 测试当回归肌肉留着。
7. 不要改星球大小，不要加 Ike / Jool，不要发明遥测。

版本保持 0.1.N。不要加 Ike / Jool。

## 切片

**A1 面板** — 已做。飞行 HUD 上有一块 agent 面板：目标、计划步骤（像程序）、当前结点、思考栏。可开关（顶栏按钮，键 O）。起飞时若无真目标，灌一份「去火星返回」演示计划。`src/agent-plan.js` 纯状态；`src/agent-ui.js` 渲染 `#agent-panel`。`window.__moonshot.agent` = get / set / toggle。无步进执行、无大模型。MCP 本刀不做（stdio 无 DOM）。图：logs/shots/agent-panel.png。

**A2 目标→总图** — 已做。粗需求经 `src/agent-goal.js` `parseGoal` 映射到 mun-roundtrip / duna-roundtrip（火星/duna → Duna；月球/mun/缪恩/登月 → Mun；听不懂 → null）。`applyGoal(text, design)` 用当前船或对应库存（Mun Express / Duna Hauler）调 `planMission`，返回 goal / missionId / plan / nodes / thought。结点是该任务的玩法刀，不是永远 Duna 演示（Mun 第三刀是 TLI）。思考只引用 `plan.ok` / `fail[0]`：过了写「预算过了」；不过写阶段 id 和 `abs(margin)` m/s。飞行面板有输入+「规划」；VAB 右侧同样能写，存 `pendingGoal`，起飞用它而不是演示。`window.__moonshot.agent.plan(text)`。无步进、无大模型。

**A3 分步执行** — 已做。`src/agent-step.js` 一刀一停。真肌肉：入轨、等窗口、逃逸/TLI（渐近线对准、只点转移级）、滑行（逃逸后过 SOI + 真实中途）、捕获、丢掉转移级、着陆、上升、回家。成功后 `snapshots[nodeId]` 存 formatVersion 2 飞行快照（`snapshotFromState`）。`window.__moonshot.agent.step()`。按钮「走一步」，无计划 / 走完 / 正在飞时禁用。不自动连刀。图：logs/shots/agent-step-a3.png。

**A4 回退** — 已做。`src/agent-revert.js`：`revertTo(nodeId)` / `revertPrev()`。套回该结点的 formatVersion 2 快照，走现有 `flight.applySnapshot`（与 `main.js` 读档同一条路，不另造格式）。该结点变 current，后面变 pending，前面保持 done。正在飞或没有快照则拒绝（思想「这一刀还在飞」/「这一刀没有快照」）。思考「回到 入轨。轨道 …，剩油 …」只格式化 `readFlightCheck` 给出的数。按钮「回退」；点计划里 **done** 结点也会回退（有快照才套）。`window.__moonshot.agent.revert(nodeId?)`，无参 = 上一刀。图：logs/shots/agent-revert-a4.png。

**A5 真检查想法** — 已做。`src/agent-check.js` 纯检查：读 `readFlightCheck` + 设计分段 + `state.plan`。转移级/着陆器按 `plan.js` 同款分段（3+ 级：底助推、中转移、顶着陆）；名字取该段发动机零件目录绰号（Duna Hauler：Raven=转移、Sparrow=着陆；Mun Express：Sparrow=转移、Kestrel=着陆）。认不出绰号就写「转移级」/「着陆器」，不猜零件名。转移级油来自该段活零件的真实 `fuel`（或 `check.transferFuelKg`）；≈0 且当前/下一刀是捕获、着陆、或逃逸后滑行 → 「Raven 干了（0 kg），下一刀不要点着陆器」。当前级已是着陆器且还在丢掉转移级之前 → 「已经点着陆器（Sparrow），还没丢掉转移级」。`state.plan.ok === false` 复用 `formatBudgetFail(fail[0])`（「预算不过：{id} 差 {abs(margin)} m/s。先改船再点火。」数字来自预算，不另算）。船毁/入轨后近拱点低于大气：只写检查里的 pe/orbit。缺字段就省略或写 —，不编 kg。走一步前警告；刀后在 A3 思想后面追加。`canStep` 不因预算失败而拒绝（发射台+预算不过只警告）。按钮「检查」；`window.__moonshot.agent.check()`。图：logs/shots/agent-check-a5.png。

**A6 MCP** — 已做。`ksp_agent_get` / `ksp_agent_toggle` / `ksp_agent_plan` / `ksp_agent_step` / `ksp_agent_revert` / `ksp_agent_check`。与面板同一状态。stdio 无 DOM：toggle 只改 `visible`。step 不连刀。测试 `tests/agent-mcp.test.mjs`（plan / 听不懂 / 无计划拒绝 / 无快照拒绝 / 干转移级检查 / get 不编油和 Δv）。发射台入轨便宜测试不飞，只测已在轨道和拒绝路径。

## 关键入口

- `src/agent-goal.js` — parseGoal / applyGoal / formatBudgetFail（纯，可测）
- `src/agent-plan.js` — 纯状态 + pendingGoal + 任务结点表 + snapshots / running / completeNode / revertNode / plan
- `src/agent-step.js` — canStep / runStep / 思想字符串
- `src/agent-revert.js` — canRevert / revertTo / revertPrev / 回退思想
- `src/agent-check.js` — A5 真检查：角色分段、转移级油、预算、船毁/亚轨道思想
- `src/agent-muscles.js` — 短肌肉（入轨 tick、窗口、滑行、丢级、渐近线/只点转移级）
- `src/agent-burns.js` — 逃逸/TLI/捕获/着陆/上升/回家
- `src/agent-run.js` — 浏览器 Flight 执行器
- `src/agent-ui.js` — DOM 渲染 `#agent-panel`，`agent.plan(text)` / `agent.step()` / `agent.revert(nodeId?)` / `agent.check()`
- `src/plan.js` — Layer 1 预算
- `src/hud.js` / `src/flight.js` / `index.html` / `styles.css` / `src/i18n.js`
- `tests/agent-ui.test.mjs` · `tests/agent-goal.test.mjs` · `tests/agent-step.test.mjs` · `tests/agent-revert.test.mjs` · `tests/agent-check.test.mjs`
- `logs/shots/agent-panel.png` · `logs/shots/agent-plan-a2.png` · `logs/shots/agent-step-a3.png` · `logs/shots/agent-revert-a4.png` · `logs/shots/agent-check-a5.png`
- `wiki/modules/play-loop.md`
- `mcp/server.mjs` · `mcp/agent.mjs` — A6 工具，挂现有 SimSession
- `tests/agent-mcp.test.mjs`

## 边界

第一版不做：

- 浏览器里塞大模型
- 一条超长自动驾驶脚本
- 每个物理 tick 都想
- 发明遥测数字
- 无头 DOM 假面板
- 改星球大小、Ike / Jool
- 删 mun-return / duna-landing 回归肌肉
- 升 1.x
