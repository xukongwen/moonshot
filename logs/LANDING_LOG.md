# Landing log (measured only)

Date: 2026-08-15. Autopilot: tests/mun-return.test.mjs, tests/duna-landing.test.mjs.
Attitude cheated; physics / fuel / staging / SOI / ground real.

## Mun Express (pad → Mun → Kerbin)

Stock stack: pod-mk1, chute, heat-shield, decoupler-s, tank-m, tank-s, eng-kestrel | decoupler-s, tank-l, tank-l, tank-m, eng-sparrow | decoupler-l, adapter, tank-xl ×3, eng-titan. Legs on host 5 and host 0. Fins on host 16.

- LKO 72 × 90 km, fuel 8355 kg
- TLI mid-course −20 m/s, predicted Mun Pe 1755 km, fuel 5454 kg
- MOI 27 × 1755 km, fuel 4608 kg
- Low Mun orbit 27 × 46 km; transfer dropped before PDI; lander fuel 2500 kg
- Mun touchdown 2.87 m/s, fuel 1251 kg, MET 14:00:22, body=mun, landed, not crashed
- Mun ascent 20 × 28 km, fuel 563 kg
- TKI v∞ 49 m/s; Kerbin 37 × 12711 km after Pe-correct, fuel 176 kg
- Kerbin touchdown 10.74 m/s, fuel 0 kg, MET 26:21:01, chute deployed, pod alive

## Duna Hauler (Duna-orbit start → land)

Stock stack: pod-mk1, chute, heat-shield, decoupler-s, tank-l, tank-m, eng-sparrow | decoupler-s, tank-l, tank-l, tank-m, eng-falcon | decoupler-l, adapter, tank-xl ×3, eng-titan. Legs host 5, fins host 16.

- Pad LKO 72 × 180 km, fuel 8196 kg (Hauler). Kerbin→Duna Hohmann window matched 44.40° (err 0.04°), TDI v∞ 918, mid-course CA 363.36 Mm — did not enter Duna SOI. Fallback: spawn 80 km Duna orbit.
- After drop transfer: lander fuel 5988 kg
- Duna touchdown 9.99 m/s, fuel 2934 kg, MET 01:04:57, body=duna, landed, chute deployed, not crashed
- Duna ascent from surface crashed at 21.1 m/s / 676 m (fuel ran out ~3 km Ap). Return not flown.


## Duna Hauler (pad → Duna land) 2026-08-15 later

Stock: Sparrow lander (tank-l + tank-m) | Falcon transfer (tank-l ×4 + tank-m) | Titan 8× tank-xl. Legs host 5, fins host 23, SRB-30 ×6 host 23.
Measured stagingStats ignition twrSL = 1.202, wet 206610 kg. planMission duna-roundtrip ok.

- Pad lift-off yes. LKO 72 × 90 km, fuel 11210 kg
- Window Kerbin→Duna tgt 44.36°, matched 44.40° (err 0.04°), wait 114.62 d, tT 75.51 d, v∞dep 918
- TDI asymptote-aligned α=-59.5°, dV 1077, v∞ 864 (tgt 918)
- Mid-course CA0 114.24 Mm, Δv +40 / rad −25, encounter yes
- Duna Pe 723 km; capture 723 × 44582 km, fuel 4622 kg
- Low orbit 50 × 723 km; lander-only before descent (pod, chute, shield, TD-12, FT-800, FT-400, Sparrow, legs), fuel 3863 kg
- Duna touchdown 9.58 m/s, fuel 1494 kg, MET 4624:31:23, body=duna, landed, chute deployed, not crashed
- Duna ascent failed: −21 × 51 km (1494 kg left; not enough to circularize). Kerbin return not flown.

## Screenshots (headed Chrome, canvas.toDataURL, DISPLAY=:3)

| file | bytes | real3d (≥110000) |
|---|---|---|
| /workspace/moonshot/logs/shots/mun-landed.png | 151496 | yes |
| /workspace/moonshot/logs/shots/mun-kerbin-return.png | 141382 | yes |
| /workspace/moonshot/logs/shots/duna-landed.png | 113232 | yes |
| duna-kerbin-return.png | not taken | — |
