# Wiki Active Memory（L1）

> agent 默认工作集。深入理解请按路径按需读取全文；**不要**通读 `wiki/log.md` 或整份 `wiki/index.md` 变更流水。

| 字段 | 值 |
|---|---|
| 生成时间 | 2026-08-16T04:26:26.910Z |
| 条数 | 14 / 15 |
| Registry | [memory-registry.json](./memory-registry.json) |
| 计划 | [Wiki Auto-Curator 架构.md](./Wiki%20Auto-Curator%20架构.md) |

## Active（必读指针）

- [Moonshot 宪法](./Moonshot%20%E5%AE%AA%E6%B3%95.md) — 给 agent 一份不可漂移的仓库级判断：这是什么、代码与 wiki 谁说了算、哪些事默认不做。
- [总体计划](./%E6%80%BB%E4%BD%93%E8%AE%A1%E5%88%92.md) — 把「KSP + 动物之森 + 我的世界」收成一份会改的北极星，避免三款游戏平铺。这是长期方向，不是本周任务单。想法会随时更新，以本页和用户最新口说为准。
- [游戏内Agent计划](./%E6%B8%B8%E6%88%8F%E5%86%85Agent%E8%AE%A1%E5%88%92.md) — 游戏内能看见 agent 如何规划、如何思考。人提粗需求（「去火星再回来」），agent 写出总图、拆刀、一刀一刀飞。可看、可停、出错回到更早结点。无头 MCP 仍给外部 agent 用。
- [助推回收计划](./%E5%8A%A9%E6%8E%A8%E5%9B%9E%E6%94%B6%E8%AE%A1%E5%88%92.md) — SpaceX 招牌动作：回收一级（boostback / 翻转 / 自杀燃烧 / 腿）。要真物理、多实验、好玩。合理零件可以（助推上装着陆腿，栅格舵先当现有鳍用）。不要超级零件。不要把助推传送回发射台。不要发明遥测。
- [Wiki Auto-Curator 架构](./Wiki%20Auto-Curator%20%E6%9E%B6%E6%9E%84.md) — 把 wiki 从只增不治变成 agent 可启动的工作集：L1 必读指针，L2 按需全文。遗忘 = 离开 Active，不是删文件。
- [patched-conics](./modules/patched-conics.md) — 说明 Kerbol 嵌套 SOI 与天体状态约定，避免把父星相对坐标误当成惯性坐标。
- [hohmann](./modules/hohmann.md) — 记录 Kerbin 到 Duna 霍曼窗口、逃逸点火约定，以及已飞通的一次捕获。
- [mcp](./modules/mcp.md) — 说明无头 MCP 如何覆盖原版人类操作：飞行、VAB、地图、语言。
- [i18n](./modules/i18n.md) — 说明界面英中切换怎么存、怎么切，以及零件名不翻译。
- [versioning](./modules/versioning.md) — 说明 Moonshot 的长期预发布版本：`0.<era>.<build>`。agent 只加 build，不把中间位当成经典 Semver 的 minor。
- [saves](./modules/saves.md) — 说明整局游戏存档（session），不是飞船文件。
- [ADR：getBodyState 保持父星相对](./adr/2026-08-15-parent-relative-body-state.md) — 锁定天体状态坐标系，避免为了「太阳系惯性」拆掉 Mun Express。
- [ADR：逃逸点火对准双曲线渐近线](./adr/2026-08-15-ejection-asymptote.md) — 锁定 TDI 点火相位，避免在几何 midnight 烧出一条错过 Duna 的双曲线。
- [MCP tools](./api/mcp-tools.md) — agent 可读工具目录。描述来自 mcp/server.mjs 的 TOOLS。共 52 个。

## 读取协议

1. 先读本文件 + 根目录 `AGENTS.md` / `wiki/AGENTS.md` 指针。
2. 任务相关再 `grep` / wiki search / 打开上表链接全文。
3. 近窗日志：`grep '^- \[' wiki/log.md | head`；更早见 `wiki/log/YYYY-MM.md`。
4. 更新 registry：`node scripts/wiki-auto-curator.mjs`。
