---
title: flight-planning
updated: 2026-08-15
status: active
tags: [flight, dv, planning]
---

# flight-planning

## 目的

Score a craft against a mission dV budget before ignition. If it fails, redesign in the VAB.

## 当前判断

Implementation started. 22 parts (added R-40 Raven). No planet-size change. No Ike/Jool. No invented telemetry.

Layer 1 lives in src/plan.js:

- MISSIONS: mun-roundtrip, duna-roundtrip. Phases {id,label,dv,role} role=lifter|transfer|lander.
- Conservative vacuum table. Kerbin ascent 4200 (15-25% pad). Mun transfer 900 (Hohmann ~856). Duna ejection 1200 (ejectionDeltaV ~1072). Duna capture 450 (math ~617). Duna ascent 1800 conservative. Reentry 0 (chutes).
- assignStages: stagingStats bottom-up. 1-stage all lander. 2-stage lifter+lander, later transfer billed to lander. 3+ lifter/transfer/lander.
- kerbin_ascent split (not 100% lifter): 1-stage lander; 2-stage lifter then leftover lander; 3+ lifter then leftover transfer, never lander. Remaining transfer then pays transfer/capture/ejection. Phase have = pots available for that phase; ascent row may include paid:{lifter,transfer}. margin = have-need after the split.
- planMission: walk phases, decrement pots. Fail if lander TWR on target < 1.2 (Mun ~1.63, Duna ~2.94).
- redesignForBudget: clone; patch failing role. If a transfer-role phase fails AND kerbin_ascent still takes a large transfer share (paid.transfer ≥ 400 and lifter < 3800), patch lifter first (tank-xl above Titan; one SRB only after 8 XL). Only add transfer tank-l after the ascent remainder is small. Lander tank-s/m. maxSteps 8. Keep pod/heat-shield/chute/legs. Do not write src/stock.js.

MCP: ksp_plan, ksp_redesign. Stock name returns a new design. VAB current design is applied in-session.

Stock paper scores (live stagingStats, not flight leftover): Mun Express mun-roundtrip passes — Titan ~2920 + transfer leftover covers 900+350; lander ~2381 covers 650+650+350. Duna close is lifter-covers-ascent: Duna Hauler is 8× tank-xl Titan + Raven transfer (4× tank-l + tank-m) + Sparrow lander. Titan ~4069, transfer pays ~131 of 4200, leftover ~1752 ≥ 1200+450; lander ~3832 covers 900+1800+800; lander TWR on Duna ~2.30. Old 3× XL stack failed ejection (Falcon paid ~1575, leftover ~307). redesignForBudget on that stripped stack adds tank-xl first (then one tank-l once lifter ≥ 3800), not 8 transfer tanks. Paper budget only — pad TWR SL ~0.76, not a flown pad-to-pad.

## 关键入口

src/plan.js
mcp/server.mjs ksp_plan ksp_redesign
tests/plan.test.mjs

## 边界

No RL. No invented telemetry. No Ike/Jool. Do not treat leftover fuel as law. Do not change planet sizes. ksp_redesign does not overwrite src/stock.js.
