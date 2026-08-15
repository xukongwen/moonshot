# AGENTS.md

永远说中文。

新会话先读 `wiki/active-memory.md`（L1），规则见 `wiki/AGENTS.md`。
不要默认通读 `wiki/index.md` 或 `wiki/log.md`。

Wiki 是 agent 长期记忆；代码是行为真相。
不要提交或推送，除非用户明确要求。不要擅自加 Ike / Jool。
飞行用截图证明（图有真相）。不要发明遥测数字。

收尾：改对应 wiki 页，log.md 加一行，然后跑 curator（package.json 脚本 wiki:curator）。

较大功能后跑 `npm run release`（只加 0.1.N）。不要每个小修都跑。
禁止自行升到 1.x；用户没说「出正式版」就拒绝。
换代（0.2.0）只有用户明确说换代才 `--era`。
用户说「打板」= 收 wiki + npm run release + 提交并推送到自己的 fork。没说打板不要推送。
