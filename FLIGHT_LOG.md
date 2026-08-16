# MOONSHOT — Mission Flight Log

**Craft:** Mun Express (stock) · **Pilot:** autopilot (`tests/mission.test.mjs`) · **Physics:** live game engine, headless
**Result:** 🌕 mission complete — soft landing on the Mun

## Events

```text
T+00:00:00   PRELAUNCH     Mun Express on the pad — liftoff mass 76.96 t, 5 stages
T+00:00:00   STAGE 1       Ignition — ignite T-900 "Titan"
T+00:00:00   LIFTOFF       Vehicle has cleared the pad
T+00:01:42   STAGE 2       Decouple + ignite — ignite S-7 "Sparrow" (lower stack jettisoned)
T+00:05:36   MECO / ORBIT  Stable orbit 72 × 90 km
T+00:32:46   XFER WINDOW   Mun phase angle 111.3° (target 110.8°) — TLI burn start
T+00:35:24   TLI CUTOFF    Trans-Munar injection complete — predicted Mun periapsis 515 km
T+07:58:29   SOI           Entered Mun sphere of influence (on-rails coast)
T+09:40:08   MOI           Mun orbit insertion — 32 × 515 km
T+10:46:54   PDI           Powered descent initiation — alt 31.6 km, velocity 535 m/s
T+10:53:47   STAGE 3       Decouple + ignite — ignite K-1 "Kestrel" (lower stack jettisoned)
T+10:54:15   TOUCHDOWN     Contact at 3.06 m/s — the Mun
T+10:54:15   MISSION END   The Mun. Pod intact, 2388 kg of liquid fuel in reserve for the trip home.
```

## Telemetry

Sampled every 15 s under thrust, every 15 min on coasts.

| MET | Body | Altitude | Velocity | Mass | Liquid fuel | Throttle |
|---|---|--:|--:|--:|--:|--:|
| T+00:00:00 | Kerbin | 62 m | 1 m/s | 76.94 t | 60477 kg | 100% |
| T+00:00:15 | Kerbin | 894 m | 113 m/s | 69.92 t | 53456 kg | 100% |
| T+00:00:30 | Kerbin | 3.49 km | 237 m/s | 62.89 t | 46435 kg | 100% |
| T+00:00:45 | Kerbin | 8.06 km | 385 m/s | 55.85 t | 39390 kg | 100% |
| T+00:01:00 | Kerbin | 15.0 km | 593 m/s | 48.81 t | 32346 kg | 100% |
| T+00:01:15 | Kerbin | 25.1 km | 895 m/s | 41.76 t | 25301 kg | 100% |
| T+00:01:30 | Kerbin | 37.9 km | 1184 m/s | 34.72 t | 18257 kg | 100% |
| T+00:01:45 | Kerbin | 48.4 km | 1531 m/s | 16.45 t | 12451 kg | 100% |
| T+00:02:00 | Kerbin | 57.0 km | 1531 m/s | 16.18 t | 12184 kg | 100% |
| T+00:02:15 | Kerbin | 64.4 km | 1542 m/s | 15.92 t | 11918 kg | 100% |
| T+00:02:30 | Kerbin | 70.6 km | 1563 m/s | 15.65 t | 11652 kg | 100% |
| T+00:02:45 | Kerbin | 75.6 km | 1592 m/s | 15.39 t | 11386 kg | 100% |
| T+00:03:00 | Kerbin | 79.6 km | 1629 m/s | 15.12 t | 11120 kg | 100% |
| T+00:03:15 | Kerbin | 82.7 km | 1673 m/s | 14.85 t | 10854 kg | 100% |
| T+00:03:30 | Kerbin | 84.7 km | 1723 m/s | 14.59 t | 10588 kg | 100% |
| T+00:03:45 | Kerbin | 86.1 km | 1780 m/s | 14.32 t | 10322 kg | 100% |
| T+00:04:00 | Kerbin | 87.0 km | 1838 m/s | 14.06 t | 10056 kg | 100% |
| T+00:04:15 | Kerbin | 87.6 km | 1896 m/s | 13.79 t | 9790 kg | 100% |
| T+00:04:30 | Kerbin | 88.1 km | 1956 m/s | 13.52 t | 9524 kg | 100% |
| T+00:04:45 | Kerbin | 88.5 km | 2018 m/s | 13.26 t | 9258 kg | 100% |
| T+00:05:00 | Kerbin | 88.9 km | 2082 m/s | 12.99 t | 8992 kg | 100% |
| T+00:05:15 | Kerbin | 89.2 km | 2150 m/s | 12.73 t | 8726 kg | 100% |
| T+00:05:30 | Kerbin | 89.5 km | 2220 m/s | 12.46 t | 8460 kg | 100% |
| T+00:20:32 | Kerbin | 72.2 km | 2306 m/s | 12.35 t | 8355 kg | 0% |
| T+00:32:46 | Kerbin | 85.2 km | 2263 m/s | 12.35 t | 8354 kg | 100% |
| T+00:33:01 | Kerbin | 85.6 km | 2335 m/s | 12.09 t | 8087 kg | 100% |
| T+00:33:16 | Kerbin | 86.2 km | 2409 m/s | 11.82 t | 7820 kg | 100% |
| T+00:33:31 | Kerbin | 86.9 km | 2484 m/s | 11.55 t | 7553 kg | 100% |
| T+00:33:46 | Kerbin | 88.1 km | 2560 m/s | 11.29 t | 7286 kg | 100% |
| T+00:34:01 | Kerbin | 89.7 km | 2636 m/s | 11.02 t | 7019 kg | 100% |
| T+00:34:16 | Kerbin | 92.0 km | 2713 m/s | 10.75 t | 6753 kg | 100% |
| T+00:34:31 | Kerbin | 95.1 km | 2789 m/s | 10.49 t | 6487 kg | 100% |
| T+00:34:46 | Kerbin | 99.2 km | 2865 m/s | 10.22 t | 6221 kg | 100% |
| T+00:35:01 | Kerbin | 104.4 km | 2942 m/s | 9.96 t | 5955 kg | 100% |
| T+00:35:16 | Kerbin | 110.8 km | 3018 m/s | 9.69 t | 5689 kg | 100% |
| T+00:50:19 | Kerbin | 1.31 Mm | 1788 m/s | 9.54 t | 5542 kg | 0% |
| T+01:05:19 | Kerbin | 2.44 Mm | 1347 m/s | 9.54 t | 5542 kg | 0% |
| T+01:20:24 | Kerbin | 3.39 Mm | 1121 m/s | 9.54 t | 5542 kg | 0% |
| T+01:35:24 | Kerbin | 4.22 Mm | 976 m/s | 9.54 t | 5542 kg | 0% |
| T+01:50:24 | Kerbin | 4.96 Mm | 870 m/s | 9.54 t | 5542 kg | 0% |
| T+02:05:24 | Kerbin | 5.63 Mm | 788 m/s | 9.54 t | 5542 kg | 0% |
| T+02:20:24 | Kerbin | 6.24 Mm | 721 m/s | 9.54 t | 5542 kg | 0% |
| T+02:35:24 | Kerbin | 6.80 Mm | 665 m/s | 9.54 t | 5542 kg | 0% |
| T+02:50:24 | Kerbin | 7.32 Mm | 616 m/s | 9.54 t | 5542 kg | 0% |
| T+03:05:24 | Kerbin | 7.80 Mm | 573 m/s | 9.54 t | 5542 kg | 0% |
| T+03:20:24 | Kerbin | 8.24 Mm | 535 m/s | 9.54 t | 5542 kg | 0% |
| T+03:35:24 | Kerbin | 8.66 Mm | 501 m/s | 9.54 t | 5542 kg | 0% |
| T+03:50:24 | Kerbin | 9.04 Mm | 469 m/s | 9.54 t | 5542 kg | 0% |
| T+04:05:24 | Kerbin | 9.40 Mm | 441 m/s | 9.54 t | 5542 kg | 0% |
| T+04:20:24 | Kerbin | 9.74 Mm | 414 m/s | 9.54 t | 5542 kg | 0% |
| T+04:35:24 | Kerbin | 10.05 Mm | 389 m/s | 9.54 t | 5542 kg | 0% |
| T+04:50:24 | Kerbin | 10.33 Mm | 366 m/s | 9.54 t | 5542 kg | 0% |
| T+05:05:24 | Kerbin | 10.60 Mm | 344 m/s | 9.54 t | 5542 kg | 0% |
| T+05:20:24 | Kerbin | 10.85 Mm | 324 m/s | 9.54 t | 5542 kg | 0% |
| T+05:35:24 | Kerbin | 11.08 Mm | 305 m/s | 9.54 t | 5542 kg | 0% |
| T+05:50:24 | Kerbin | 11.28 Mm | 287 m/s | 9.54 t | 5542 kg | 0% |
| T+06:05:24 | Kerbin | 11.47 Mm | 270 m/s | 9.54 t | 5542 kg | 0% |
| T+06:20:24 | Kerbin | 11.65 Mm | 254 m/s | 9.54 t | 5542 kg | 0% |
| T+06:35:24 | Kerbin | 11.80 Mm | 239 m/s | 9.54 t | 5542 kg | 0% |
| T+06:50:24 | Kerbin | 11.94 Mm | 226 m/s | 9.54 t | 5542 kg | 0% |
| T+07:05:24 | Kerbin | 12.07 Mm | 213 m/s | 9.54 t | 5542 kg | 0% |
| T+07:20:24 | Kerbin | 12.18 Mm | 202 m/s | 9.54 t | 5542 kg | 0% |
| T+07:35:24 | Kerbin | 12.27 Mm | 192 m/s | 9.54 t | 5542 kg | 0% |
| T+07:50:24 | Kerbin | 12.34 Mm | 183 m/s | 9.54 t | 5542 kg | 0% |
| T+08:05:25 | the Mun | 2.09 Mm | 373 m/s | 9.54 t | 5542 kg | 0% |
| T+08:20:25 | the Mun | 1.78 Mm | 385 m/s | 9.54 t | 5542 kg | 0% |
| T+08:35:25 | the Mun | 1.48 Mm | 400 m/s | 9.54 t | 5542 kg | 0% |
| T+08:50:25 | the Mun | 1.18 Mm | 420 m/s | 9.54 t | 5542 kg | 0% |
| T+09:05:25 | the Mun | 900.6 km | 448 m/s | 9.54 t | 5542 kg | 0% |
| T+09:20:25 | the Mun | 659.5 km | 484 m/s | 9.54 t | 5542 kg | 0% |
| T+09:35:25 | the Mun | 522.9 km | 513 m/s | 9.54 t | 5542 kg | 0% |
| T+09:39:21 | the Mun | 515.1 km | 514 m/s | 9.54 t | 5541 kg | 100% |
| T+09:39:36 | the Mun | 515.1 km | 419 m/s | 9.28 t | 5275 kg | 100% |
| T+09:39:51 | the Mun | 515.1 km | 320 m/s | 9.01 t | 5009 kg | 100% |
| T+09:40:06 | the Mun | 515.1 km | 219 m/s | 8.74 t | 4743 kg | 100% |
| T+09:55:08 | the Mun | 488.1 km | 227 m/s | 8.72 t | 4724 kg | 0% |
| T+10:10:08 | the Mun | 406.0 km | 278 m/s | 8.72 t | 4724 kg | 0% |
| T+10:25:08 | the Mun | 263.3 km | 379 m/s | 8.72 t | 4724 kg | 0% |
| T+10:40:08 | the Mun | 74.4 km | 581 m/s | 8.72 t | 4724 kg | 0% |
| T+10:46:38 | the Mun | 31.6 km | 651 m/s | 8.72 t | 4723 kg | 100% |
| T+10:46:53 | the Mun | 31.6 km | 547 m/s | 8.46 t | 4457 kg | 100% |
| T+10:47:08 | the Mun | 31.7 km | 442 m/s | 8.19 t | 4190 kg | 100% |
| T+10:47:23 | the Mun | 32.2 km | 334 m/s | 7.92 t | 3924 kg | 100% |
| T+10:47:38 | the Mun | 32.9 km | 226 m/s | 7.66 t | 3658 kg | 100% |
| T+10:47:53 | the Mun | 33.8 km | 122 m/s | 7.39 t | 3392 kg | 100% |
| T+10:51:44 | the Mun | 23.3 km | 185 m/s | 7.17 t | 3173 kg | 100% |
| T+10:52:40 | the Mun | 11.0 km | 261 m/s | 7.17 t | 3173 kg | 100% |
| T+10:52:55 | the Mun | 7.41 km | 215 m/s | 7.03 t | 3030 kg | 100% |
| T+10:53:10 | the Mun | 4.53 km | 169 m/s | 6.89 t | 2887 kg | 100% |
| T+10:53:25 | the Mun | 2.36 km | 120 m/s | 6.74 t | 2741 kg | 100% |
| T+10:53:40 | the Mun | 931 m | 70 m/s | 6.59 t | 2594 kg | 100% |
| T+10:53:55 | the Mun | 383 m | 8 m/s | 4.64 t | 2444 kg | 100% |
| T+10:54:10 | the Mun | 265 m | 5 m/s | 4.60 t | 2404 kg | 100% |
