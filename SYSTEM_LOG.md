# MOONSHOT — Kerbol System Tour

**Craft:** Mun Express (stock) · **Pilot:** autopilot (`mcp/systemtour.mjs`) · **Physics:** live game engine, headless (`SimSession`)
**Result:** solar orbit around Kerbol · Minmus SOI yes · LKO 74 × 90 km · solar 13339449 × 14890309 km · fuel 855 kg

## Key orbits

- **LKO:** 74 × 90 km
- **Minmus SOI:** reached
- **Minmus orbit:** 2094 × 2178 km
- **Kerbol SOI:** reached
- **Solar orbit (Kerbol-centric):** 13339449 × 14890309 km
- **Fuel remaining:** 855 kg
- **Snapshots:** PRELAUNCH, MECO_ORBIT, MINMUS_SOI, MINMUS_ORBIT, ESCAPE_BURN, KERBIN_SOI_EXIT, SOLAR_ORBIT

## Events

```text
T+00:00:00   PRELAUNCH     Mun Express on the pad — liftoff mass 32.43 t, 5 stages
T+00:00:00   STAGE 1       Ignition — ignite F-30 "Falcon" + SRB-30 Booster (ignition)
T+00:00:00   LIFTOFF       Vehicle has cleared the pad
T+00:00:30   STAGE 2       Drop boosters — boosters away (SRBs dry)
T+00:01:53   STAGE 3       Decouple + ignite — ignite S-7 "Sparrow", lower stack jettisoned (stage dry)
T+00:05:23   MECO / ORBIT  Stable orbit 74 × 90 km
T+00:05:23   MINMUS XFER   Attempt 1: node T_arr=104:51:23 (sign=−X), burn in 50.70 h
T+106:30:49  MINMUS XFER   Mid-course toward Minmus (miss 3.13 Mm)
T+106:30:58  MINMUS XFER   Encounter predicted — Minmus Pe 2178 km, enter T+108:49:45
T+108:50:58  SOI           Entered Minmus sphere of influence
T+108:50:58  MINMUS SOI    Entered Minmus SOI at T+108:50:58
T+109:00:20  MOI           Minmus orbit insertion — 2094 × 2178 km
T+109:00:20  MOON ESCAPE   Leaving Minmus SOI
T+110:58:21  SOI           Entered Kerbin sphere of influence
T+110:58:21  ESCAPE        Prograde burn to hyperbolic Kerbin escape
T+110:58:29  SOI           Entered Minmus sphere of influence
T+110:58:29  ESCAPE        Cutoff 47912 × ∞ km  a=-6205611595  body=minmus  fuel 855 kg
T+110:58:29  MOON ESCAPE   Leaving Minmus SOI
T+119:20:29  SOI           Entered Kerbin sphere of influence
T+196:54:35  SOI           Entered Kerbol sphere of influence
T+196:54:35  KERBOL SOI    Left Kerbin SOI — now orbiting Kerbol
T+219:07:55  SOLAR ORBIT   Kerbol-centric 13339449 × 14890309 km  body=kerbol  fuel 855 kg
```

## Screenshots

In-game captures from the live Three.js flight view (snapshot replay).

### Pad / prelaunch — Mun Express on the Kerbin pad

![Pad / prelaunch — Mun Express on the Kerbin pad](logs/shots/01-pad.png)

### LKO map — Kerbin with Mun and Minmus

![LKO map — Kerbin with Mun and Minmus](logs/shots/02-lko-map.png)

### LKO after MECO — stable Kerbin orbit

![LKO after MECO — stable Kerbin orbit](logs/shots/02-lko.png)

### Minmus SOI map

![Minmus SOI map](logs/shots/03-minmus-soi-map.png)

### Minmus SOI / approaching Minmus

![Minmus SOI / approaching Minmus](logs/shots/03-minmus-soi.png)

### Minmus orbit map

![Minmus orbit map](logs/shots/04-minmus-orbit-map.png)

### Minmus orbit after MOI

![Minmus orbit after MOI](logs/shots/04-minmus-orbit.png)

### Escape burn map — Kerbin system (Mun + Minmus)

![Escape burn map — Kerbin system (Mun + Minmus)](logs/shots/05-escape-map.png)

### Escape burn — leaving Kerbin SOI

![Escape burn — leaving Kerbin SOI](logs/shots/05-escape.png)

### Kerbin SOI exit map — solar frame

![Kerbin SOI exit map — solar frame](logs/shots/06-soi-exit-map.png)

### Kerbin SOI exit — now orbiting Kerbol

![Kerbin SOI exit — now orbiting Kerbol](logs/shots/06-soi-exit.png)

### Solar map — Kerbol, Kerbin, Duna

![Solar map — Kerbol, Kerbin, Duna](logs/shots/07-solar-map.png)

### Solar orbit around Kerbol

![Solar orbit around Kerbol](logs/shots/07-solar.png)

## Telemetry

Sampled every 15 s under thrust, every 15 min on coasts.

| MET | Body | Altitude | Velocity | Mass | Liquid fuel | Throttle | notes |
|---|---|--:|--:|--:|--:|--:|---|
| T+00:00:00 | Kerbin | 57 m | 0 m/s | 32.43 t | 14500 kg | 0% | pad |
| T+00:00:15 | Kerbin | 1.70 km | 223 m/s | 26.19 t | 13439 kg | 100% |  |
| T+00:00:30 | Kerbin | 6.79 km | 479 m/s | 19.95 t | 12378 kg | 100% |  |
| T+00:00:45 | Kerbin | 13.5 km | 456 m/s | 16.48 t | 11300 kg | 100% |  |
| T+00:01:00 | Kerbin | 20.3 km | 501 m/s | 15.40 t | 10221 kg | 100% |  |
| T+00:01:15 | Kerbin | 27.6 km | 585 m/s | 14.32 t | 9143 kg | 100% |  |
| T+00:01:30 | Kerbin | 36.1 km | 702 m/s | 13.24 t | 8064 kg | 100% |  |
| T+00:01:46 | Kerbin | 45.7 km | 851 m/s | 12.17 t | 6986 kg | 100% |  |
| T+00:02:01 | Kerbin | 56.1 km | 900 m/s | 8.90 t | 6354 kg | 100% |  |
| T+00:02:16 | Kerbin | 64.6 km | 893 m/s | 8.64 t | 6088 kg | 100% |  |
| T+00:02:31 | Kerbin | 71.3 km | 918 m/s | 8.37 t | 5822 kg | 100% |  |
| T+00:02:46 | Kerbin | 76.5 km | 970 m/s | 8.11 t | 5556 kg | 100% |  |
| T+00:03:01 | Kerbin | 80.1 km | 1050 m/s | 7.84 t | 5290 kg | 100% |  |
| T+00:03:16 | Kerbin | 82.4 km | 1150 m/s | 7.57 t | 5024 kg | 100% |  |
| T+00:03:31 | Kerbin | 83.9 km | 1258 m/s | 7.31 t | 4758 kg | 100% |  |
| T+00:03:46 | Kerbin | 84.9 km | 1369 m/s | 7.04 t | 4492 kg | 100% |  |
| T+00:04:01 | Kerbin | 85.6 km | 1485 m/s | 6.78 t | 4226 kg | 100% |  |
| T+00:04:16 | Kerbin | 86.2 km | 1605 m/s | 6.51 t | 3960 kg | 100% |  |
| T+00:04:31 | Kerbin | 86.9 km | 1732 m/s | 6.24 t | 3694 kg | 100% |  |
| T+00:04:46 | Kerbin | 87.7 km | 1870 m/s | 5.98 t | 3428 kg | 100% |  |
| T+00:05:01 | Kerbin | 88.4 km | 2020 m/s | 5.71 t | 3162 kg | 100% |  |
| T+00:05:16 | Kerbin | 89.0 km | 2178 m/s | 5.45 t | 2896 kg | 100% |  |
| T+00:05:23 | Kerbin | 89.1 km | 2252 m/s | 5.33 t | 2776 kg | 0% | LKO |
| T+00:21:29 | Kerbin | 74.8 km | 2300 m/s | 5.33 t | 2776 kg | 0% |  |
| T+00:37:29 | Kerbin | 89.6 km | 2251 m/s | 5.33 t | 2776 kg | 0% |  |
| T+00:53:29 | Kerbin | 74.5 km | 2301 m/s | 5.33 t | 2776 kg | 0% |  |
| T+01:09:29 | Kerbin | 89.8 km | 2250 m/s | 5.33 t | 2776 kg | 0% |  |
| T+01:25:29 | Kerbin | 74.3 km | 2302 m/s | 5.33 t | 2776 kg | 0% |  |
| T+01:41:29 | Kerbin | 89.9 km | 2249 m/s | 5.33 t | 2776 kg | 0% |  |
| T+01:57:29 | Kerbin | 74.2 km | 2302 m/s | 5.33 t | 2776 kg | 0% |  |
| T+02:13:29 | Kerbin | 90.0 km | 2249 m/s | 5.33 t | 2776 kg | 0% |  |
| T+02:29:29 | Kerbin | 74.3 km | 2302 m/s | 5.33 t | 2776 kg | 0% |  |
| T+02:45:29 | Kerbin | 89.9 km | 2250 m/s | 5.33 t | 2776 kg | 0% |  |
| T+03:01:29 | Kerbin | 74.4 km | 2301 m/s | 5.33 t | 2776 kg | 0% |  |
| T+03:17:29 | Kerbin | 89.7 km | 2250 m/s | 5.33 t | 2776 kg | 0% |  |
| T+03:33:29 | Kerbin | 74.7 km | 2300 m/s | 5.33 t | 2776 kg | 0% |  |
| T+03:49:29 | Kerbin | 89.3 km | 2251 m/s | 5.33 t | 2776 kg | 0% |  |
| T+04:05:29 | Kerbin | 75.1 km | 2299 m/s | 5.33 t | 2776 kg | 0% |  |
| T+04:21:29 | Kerbin | 88.9 km | 2253 m/s | 5.33 t | 2776 kg | 0% |  |
| T+04:37:29 | Kerbin | 75.6 km | 2297 m/s | 5.33 t | 2776 kg | 0% |  |
| T+04:53:29 | Kerbin | 88.4 km | 2255 m/s | 5.33 t | 2776 kg | 0% |  |
| T+05:09:29 | Kerbin | 76.2 km | 2295 m/s | 5.33 t | 2776 kg | 0% |  |
| T+05:25:29 | Kerbin | 87.8 km | 2257 m/s | 5.33 t | 2776 kg | 0% |  |
| T+05:41:29 | Kerbin | 76.8 km | 2293 m/s | 5.33 t | 2776 kg | 0% |  |
| T+05:57:29 | Kerbin | 87.1 km | 2259 m/s | 5.33 t | 2776 kg | 0% |  |
| T+06:13:29 | Kerbin | 77.6 km | 2290 m/s | 5.33 t | 2776 kg | 0% |  |
| T+06:29:29 | Kerbin | 86.3 km | 2261 m/s | 5.33 t | 2776 kg | 0% |  |
| T+06:45:29 | Kerbin | 78.4 km | 2288 m/s | 5.33 t | 2776 kg | 0% |  |
| T+07:01:29 | Kerbin | 85.5 km | 2264 m/s | 5.33 t | 2776 kg | 0% |  |
| T+07:17:29 | Kerbin | 79.3 km | 2285 m/s | 5.33 t | 2776 kg | 0% |  |
| T+07:33:29 | Kerbin | 84.6 km | 2267 m/s | 5.33 t | 2776 kg | 0% |  |
| T+07:49:29 | Kerbin | 80.2 km | 2282 m/s | 5.33 t | 2776 kg | 0% |  |
| T+08:05:29 | Kerbin | 83.6 km | 2270 m/s | 5.33 t | 2776 kg | 0% |  |
| T+08:21:29 | Kerbin | 81.2 km | 2278 m/s | 5.33 t | 2776 kg | 0% |  |
| T+08:37:29 | Kerbin | 82.7 km | 2273 m/s | 5.33 t | 2776 kg | 0% |  |
| T+08:53:29 | Kerbin | 82.1 km | 2275 m/s | 5.33 t | 2776 kg | 0% |  |
| T+09:09:29 | Kerbin | 81.7 km | 2277 m/s | 5.33 t | 2776 kg | 0% |  |
| T+09:25:29 | Kerbin | 83.1 km | 2272 m/s | 5.33 t | 2776 kg | 0% |  |
| T+09:41:29 | Kerbin | 80.8 km | 2280 m/s | 5.33 t | 2776 kg | 0% |  |
| T+09:57:29 | Kerbin | 84.0 km | 2269 m/s | 5.33 t | 2776 kg | 0% |  |
| T+10:13:29 | Kerbin | 79.8 km | 2283 m/s | 5.33 t | 2776 kg | 0% |  |
| T+10:29:29 | Kerbin | 85.0 km | 2266 m/s | 5.33 t | 2776 kg | 0% |  |
| T+10:45:29 | Kerbin | 78.9 km | 2286 m/s | 5.33 t | 2776 kg | 0% |  |
| T+11:01:29 | Kerbin | 85.8 km | 2263 m/s | 5.33 t | 2776 kg | 0% |  |
| T+11:17:29 | Kerbin | 78.1 km | 2289 m/s | 5.33 t | 2776 kg | 0% |  |
| T+11:33:29 | Kerbin | 86.6 km | 2260 m/s | 5.33 t | 2776 kg | 0% |  |
| T+11:49:29 | Kerbin | 77.3 km | 2292 m/s | 5.33 t | 2776 kg | 0% |  |
| T+12:05:29 | Kerbin | 87.4 km | 2258 m/s | 5.33 t | 2776 kg | 0% |  |
| T+12:21:29 | Kerbin | 76.5 km | 2294 m/s | 5.33 t | 2776 kg | 0% |  |
| T+12:37:29 | Kerbin | 88.0 km | 2256 m/s | 5.33 t | 2776 kg | 0% |  |
| T+12:53:29 | Kerbin | 75.9 km | 2296 m/s | 5.33 t | 2776 kg | 0% |  |
| T+13:09:29 | Kerbin | 88.6 km | 2254 m/s | 5.33 t | 2776 kg | 0% |  |
| T+13:25:29 | Kerbin | 75.3 km | 2298 m/s | 5.33 t | 2776 kg | 0% |  |
| T+13:41:29 | Kerbin | 89.1 km | 2252 m/s | 5.33 t | 2776 kg | 0% |  |
| T+13:57:29 | Kerbin | 74.9 km | 2300 m/s | 5.33 t | 2776 kg | 0% |  |
| T+14:13:29 | Kerbin | 89.5 km | 2251 m/s | 5.33 t | 2776 kg | 0% |  |
| T+14:29:29 | Kerbin | 74.6 km | 2301 m/s | 5.33 t | 2776 kg | 0% |  |
| T+14:45:29 | Kerbin | 89.8 km | 2250 m/s | 5.33 t | 2776 kg | 0% |  |
| T+15:01:29 | Kerbin | 74.3 km | 2301 m/s | 5.33 t | 2776 kg | 0% |  |
| T+15:17:29 | Kerbin | 89.9 km | 2249 m/s | 5.33 t | 2776 kg | 0% |  |
| T+15:33:29 | Kerbin | 74.2 km | 2302 m/s | 5.33 t | 2776 kg | 0% |  |
| T+15:49:29 | Kerbin | 90.0 km | 2249 m/s | 5.33 t | 2776 kg | 0% |  |
| T+16:05:29 | Kerbin | 74.2 km | 2302 m/s | 5.33 t | 2776 kg | 0% |  |
| T+16:21:29 | Kerbin | 89.9 km | 2250 m/s | 5.33 t | 2776 kg | 0% |  |
| T+16:37:29 | Kerbin | 74.4 km | 2301 m/s | 5.33 t | 2776 kg | 0% |  |
| T+16:53:29 | Kerbin | 89.7 km | 2250 m/s | 5.33 t | 2776 kg | 0% |  |
| T+17:09:29 | Kerbin | 74.6 km | 2301 m/s | 5.33 t | 2776 kg | 0% |  |
| T+17:25:29 | Kerbin | 89.4 km | 2251 m/s | 5.33 t | 2776 kg | 0% |  |
| T+17:41:29 | Kerbin | 75.0 km | 2299 m/s | 5.33 t | 2776 kg | 0% |  |
| T+17:57:29 | Kerbin | 89.0 km | 2252 m/s | 5.33 t | 2776 kg | 0% |  |
| T+18:13:29 | Kerbin | 75.4 km | 2298 m/s | 5.33 t | 2776 kg | 0% |  |
| T+18:29:29 | Kerbin | 88.5 km | 2254 m/s | 5.33 t | 2776 kg | 0% |  |
| T+18:45:29 | Kerbin | 76.0 km | 2296 m/s | 5.33 t | 2776 kg | 0% |  |
| T+19:01:29 | Kerbin | 87.9 km | 2256 m/s | 5.33 t | 2776 kg | 0% |  |
| T+19:17:29 | Kerbin | 76.7 km | 2294 m/s | 5.33 t | 2776 kg | 0% |  |
| T+19:33:29 | Kerbin | 87.3 km | 2258 m/s | 5.33 t | 2776 kg | 0% |  |
| T+19:49:29 | Kerbin | 77.4 km | 2291 m/s | 5.33 t | 2776 kg | 0% |  |
| T+20:05:29 | Kerbin | 86.5 km | 2261 m/s | 5.33 t | 2776 kg | 0% |  |
| T+20:21:29 | Kerbin | 78.2 km | 2288 m/s | 5.33 t | 2776 kg | 0% |  |
| T+20:37:29 | Kerbin | 85.7 km | 2263 m/s | 5.33 t | 2776 kg | 0% |  |
| T+20:53:29 | Kerbin | 79.1 km | 2285 m/s | 5.33 t | 2776 kg | 0% |  |
| T+21:09:29 | Kerbin | 84.8 km | 2266 m/s | 5.33 t | 2776 kg | 0% |  |
| T+21:25:29 | Kerbin | 80.0 km | 2282 m/s | 5.33 t | 2776 kg | 0% |  |
| T+21:41:29 | Kerbin | 83.9 km | 2269 m/s | 5.33 t | 2776 kg | 0% |  |
| T+21:57:29 | Kerbin | 80.9 km | 2279 m/s | 5.33 t | 2776 kg | 0% |  |
| T+22:13:29 | Kerbin | 82.9 km | 2273 m/s | 5.33 t | 2776 kg | 0% |  |
| T+22:29:29 | Kerbin | 81.9 km | 2276 m/s | 5.33 t | 2776 kg | 0% |  |
| T+22:45:29 | Kerbin | 82.0 km | 2276 m/s | 5.33 t | 2776 kg | 0% |  |
| T+23:01:29 | Kerbin | 82.8 km | 2273 m/s | 5.33 t | 2776 kg | 0% |  |
| T+23:17:29 | Kerbin | 81.0 km | 2279 m/s | 5.33 t | 2776 kg | 0% |  |
| T+23:33:29 | Kerbin | 83.8 km | 2270 m/s | 5.33 t | 2776 kg | 0% |  |
| T+23:49:29 | Kerbin | 80.1 km | 2282 m/s | 5.33 t | 2776 kg | 0% |  |
| T+24:05:29 | Kerbin | 84.7 km | 2267 m/s | 5.33 t | 2776 kg | 0% |  |
| T+24:21:29 | Kerbin | 79.2 km | 2285 m/s | 5.33 t | 2776 kg | 0% |  |
| T+24:37:29 | Kerbin | 85.6 km | 2264 m/s | 5.33 t | 2776 kg | 0% |  |
| T+24:53:29 | Kerbin | 78.3 km | 2288 m/s | 5.33 t | 2776 kg | 0% |  |
| T+25:09:29 | Kerbin | 86.4 km | 2261 m/s | 5.33 t | 2776 kg | 0% |  |
| T+25:25:29 | Kerbin | 77.5 km | 2291 m/s | 5.33 t | 2776 kg | 0% |  |
| T+25:41:29 | Kerbin | 87.2 km | 2258 m/s | 5.33 t | 2776 kg | 0% |  |
| T+25:57:29 | Kerbin | 76.7 km | 2293 m/s | 5.33 t | 2776 kg | 0% |  |
| T+26:13:29 | Kerbin | 87.9 km | 2256 m/s | 5.33 t | 2776 kg | 0% |  |
| T+26:29:29 | Kerbin | 76.1 km | 2296 m/s | 5.33 t | 2776 kg | 0% |  |
| T+26:45:29 | Kerbin | 88.5 km | 2254 m/s | 5.33 t | 2776 kg | 0% |  |
| T+27:01:29 | Kerbin | 75.5 km | 2298 m/s | 5.33 t | 2776 kg | 0% |  |
| T+27:17:29 | Kerbin | 89.0 km | 2253 m/s | 5.33 t | 2776 kg | 0% |  |
| T+27:33:29 | Kerbin | 75.0 km | 2299 m/s | 5.33 t | 2776 kg | 0% |  |
| T+27:49:29 | Kerbin | 89.4 km | 2251 m/s | 5.33 t | 2776 kg | 0% |  |
| T+28:05:29 | Kerbin | 74.6 km | 2300 m/s | 5.33 t | 2776 kg | 0% |  |
| T+28:21:29 | Kerbin | 89.7 km | 2250 m/s | 5.33 t | 2776 kg | 0% |  |
| T+28:37:29 | Kerbin | 74.4 km | 2301 m/s | 5.33 t | 2776 kg | 0% |  |
| T+28:53:29 | Kerbin | 89.9 km | 2250 m/s | 5.33 t | 2776 kg | 0% |  |
| T+29:09:29 | Kerbin | 74.2 km | 2302 m/s | 5.33 t | 2776 kg | 0% |  |
| T+29:25:29 | Kerbin | 90.0 km | 2249 m/s | 5.33 t | 2776 kg | 0% |  |
| T+29:41:29 | Kerbin | 74.2 km | 2302 m/s | 5.33 t | 2776 kg | 0% |  |
| T+29:57:29 | Kerbin | 89.9 km | 2249 m/s | 5.33 t | 2776 kg | 0% |  |
| T+30:13:29 | Kerbin | 74.3 km | 2302 m/s | 5.33 t | 2776 kg | 0% |  |
| T+30:29:29 | Kerbin | 89.8 km | 2250 m/s | 5.33 t | 2776 kg | 0% |  |
| T+30:45:29 | Kerbin | 74.5 km | 2301 m/s | 5.33 t | 2776 kg | 0% |  |
| T+31:01:29 | Kerbin | 89.5 km | 2251 m/s | 5.33 t | 2776 kg | 0% |  |
| T+31:17:29 | Kerbin | 74.9 km | 2300 m/s | 5.33 t | 2776 kg | 0% |  |
| T+31:33:29 | Kerbin | 89.1 km | 2252 m/s | 5.33 t | 2776 kg | 0% |  |
| T+31:49:29 | Kerbin | 75.3 km | 2298 m/s | 5.33 t | 2776 kg | 0% |  |
| T+32:05:29 | Kerbin | 88.7 km | 2254 m/s | 5.33 t | 2776 kg | 0% |  |
| T+32:21:29 | Kerbin | 75.8 km | 2296 m/s | 5.33 t | 2776 kg | 0% |  |
| T+32:37:29 | Kerbin | 88.1 km | 2255 m/s | 5.33 t | 2776 kg | 0% |  |
| T+32:53:29 | Kerbin | 76.5 km | 2294 m/s | 5.33 t | 2776 kg | 0% |  |
| T+33:09:29 | Kerbin | 87.4 km | 2258 m/s | 5.33 t | 2776 kg | 0% |  |
| T+33:25:29 | Kerbin | 77.2 km | 2292 m/s | 5.33 t | 2776 kg | 0% |  |
| T+33:41:29 | Kerbin | 86.7 km | 2260 m/s | 5.33 t | 2776 kg | 0% |  |
| T+33:57:29 | Kerbin | 78.0 km | 2289 m/s | 5.33 t | 2776 kg | 0% |  |
| T+34:13:29 | Kerbin | 85.9 km | 2263 m/s | 5.33 t | 2776 kg | 0% |  |
| T+34:29:29 | Kerbin | 78.8 km | 2286 m/s | 5.33 t | 2776 kg | 0% |  |
| T+34:45:29 | Kerbin | 85.0 km | 2266 m/s | 5.33 t | 2776 kg | 0% |  |
| T+35:01:29 | Kerbin | 79.7 km | 2283 m/s | 5.33 t | 2776 kg | 0% |  |
| T+35:17:29 | Kerbin | 84.1 km | 2269 m/s | 5.33 t | 2776 kg | 0% |  |
| T+35:33:29 | Kerbin | 80.7 km | 2280 m/s | 5.33 t | 2776 kg | 0% |  |
| T+35:49:29 | Kerbin | 83.2 km | 2272 m/s | 5.33 t | 2776 kg | 0% |  |
| T+36:05:29 | Kerbin | 81.6 km | 2277 m/s | 5.33 t | 2776 kg | 0% |  |
| T+36:21:29 | Kerbin | 82.2 km | 2275 m/s | 5.33 t | 2776 kg | 0% |  |
| T+36:37:29 | Kerbin | 82.6 km | 2274 m/s | 5.33 t | 2776 kg | 0% |  |
| T+36:53:29 | Kerbin | 81.3 km | 2278 m/s | 5.33 t | 2776 kg | 0% |  |
| T+37:09:29 | Kerbin | 83.5 km | 2271 m/s | 5.33 t | 2776 kg | 0% |  |
| T+37:25:29 | Kerbin | 80.3 km | 2281 m/s | 5.33 t | 2776 kg | 0% |  |
| T+37:41:29 | Kerbin | 84.5 km | 2267 m/s | 5.33 t | 2776 kg | 0% |  |
| T+37:57:29 | Kerbin | 79.4 km | 2284 m/s | 5.33 t | 2776 kg | 0% |  |
| T+38:13:29 | Kerbin | 85.4 km | 2265 m/s | 5.33 t | 2776 kg | 0% |  |
| T+38:29:29 | Kerbin | 78.5 km | 2287 m/s | 5.33 t | 2776 kg | 0% |  |
| T+38:45:29 | Kerbin | 86.2 km | 2262 m/s | 5.33 t | 2776 kg | 0% |  |
| T+39:01:29 | Kerbin | 77.7 km | 2290 m/s | 5.33 t | 2776 kg | 0% |  |
| T+39:17:29 | Kerbin | 87.0 km | 2259 m/s | 5.33 t | 2776 kg | 0% |  |
| T+39:33:29 | Kerbin | 76.9 km | 2293 m/s | 5.33 t | 2776 kg | 0% |  |
| T+39:49:29 | Kerbin | 87.7 km | 2257 m/s | 5.33 t | 2776 kg | 0% |  |
| T+40:05:29 | Kerbin | 76.2 km | 2295 m/s | 5.33 t | 2776 kg | 0% |  |
| T+40:21:29 | Kerbin | 88.3 km | 2255 m/s | 5.33 t | 2776 kg | 0% |  |
| T+40:37:29 | Kerbin | 75.6 km | 2297 m/s | 5.33 t | 2776 kg | 0% |  |
| T+40:53:29 | Kerbin | 88.9 km | 2253 m/s | 5.33 t | 2776 kg | 0% |  |
| T+41:09:29 | Kerbin | 75.1 km | 2299 m/s | 5.33 t | 2776 kg | 0% |  |
| T+41:25:29 | Kerbin | 89.3 km | 2252 m/s | 5.33 t | 2776 kg | 0% |  |
| T+41:41:29 | Kerbin | 74.7 km | 2300 m/s | 5.33 t | 2776 kg | 0% |  |
| T+41:57:29 | Kerbin | 89.6 km | 2250 m/s | 5.33 t | 2776 kg | 0% |  |
| T+42:13:29 | Kerbin | 74.4 km | 2301 m/s | 5.33 t | 2776 kg | 0% |  |
| T+42:29:29 | Kerbin | 89.8 km | 2250 m/s | 5.33 t | 2776 kg | 0% |  |
| T+42:45:29 | Kerbin | 74.3 km | 2302 m/s | 5.33 t | 2776 kg | 0% |  |
| T+43:01:29 | Kerbin | 90.0 km | 2249 m/s | 5.33 t | 2776 kg | 0% |  |
| T+43:17:29 | Kerbin | 74.2 km | 2302 m/s | 5.33 t | 2776 kg | 0% |  |
| T+43:33:29 | Kerbin | 89.9 km | 2249 m/s | 5.33 t | 2776 kg | 0% |  |
| T+43:49:29 | Kerbin | 74.3 km | 2302 m/s | 5.33 t | 2776 kg | 0% |  |
| T+44:05:29 | Kerbin | 89.8 km | 2250 m/s | 5.33 t | 2776 kg | 0% |  |
| T+44:21:29 | Kerbin | 74.5 km | 2301 m/s | 5.33 t | 2776 kg | 0% |  |
| T+44:37:29 | Kerbin | 89.6 km | 2251 m/s | 5.33 t | 2776 kg | 0% |  |
| T+44:53:29 | Kerbin | 74.8 km | 2300 m/s | 5.33 t | 2776 kg | 0% |  |
| T+45:09:29 | Kerbin | 89.3 km | 2252 m/s | 5.33 t | 2776 kg | 0% |  |
| T+45:25:29 | Kerbin | 75.2 km | 2299 m/s | 5.33 t | 2776 kg | 0% |  |
| T+45:41:29 | Kerbin | 88.8 km | 2253 m/s | 5.33 t | 2776 kg | 0% |  |
| T+45:57:29 | Kerbin | 75.7 km | 2297 m/s | 5.33 t | 2776 kg | 0% |  |
| T+46:13:29 | Kerbin | 88.3 km | 2255 m/s | 5.33 t | 2776 kg | 0% |  |
| T+46:29:29 | Kerbin | 76.3 km | 2295 m/s | 5.33 t | 2776 kg | 0% |  |
| T+46:45:29 | Kerbin | 87.6 km | 2257 m/s | 5.33 t | 2776 kg | 0% |  |
| T+47:01:29 | Kerbin | 77.0 km | 2292 m/s | 5.33 t | 2776 kg | 0% |  |
| T+47:17:29 | Kerbin | 86.9 km | 2259 m/s | 5.33 t | 2776 kg | 0% |  |
| T+47:33:29 | Kerbin | 77.8 km | 2290 m/s | 5.33 t | 2776 kg | 0% |  |
| T+47:49:29 | Kerbin | 86.1 km | 2262 m/s | 5.33 t | 2776 kg | 0% |  |
| T+48:05:29 | Kerbin | 78.6 km | 2287 m/s | 5.33 t | 2776 kg | 0% |  |
| T+48:21:29 | Kerbin | 85.3 km | 2265 m/s | 5.33 t | 2776 kg | 0% |  |
| T+48:37:29 | Kerbin | 79.5 km | 2284 m/s | 5.33 t | 2776 kg | 0% |  |
| T+48:53:29 | Kerbin | 84.4 km | 2268 m/s | 5.33 t | 2776 kg | 0% |  |
| T+49:09:29 | Kerbin | 80.4 km | 2281 m/s | 5.33 t | 2776 kg | 0% |  |
| T+49:25:29 | Kerbin | 83.4 km | 2271 m/s | 5.33 t | 2776 kg | 0% |  |
| T+49:41:29 | Kerbin | 81.4 km | 2278 m/s | 5.33 t | 2776 kg | 0% |  |
| T+49:57:29 | Kerbin | 82.5 km | 2274 m/s | 5.33 t | 2776 kg | 0% |  |
| T+50:13:29 | Kerbin | 82.3 km | 2275 m/s | 5.33 t | 2776 kg | 0% |  |
| T+50:29:29 | Kerbin | 81.5 km | 2277 m/s | 5.33 t | 2776 kg | 0% |  |
| T+50:45:57 | Kerbin | 84.0 km | 2269 m/s | 5.33 t | 2776 kg | 0% |  |
| T+50:47:57 | Kerbin | 86.8 km | 2262 m/s | 5.32 t | 2772 kg | 100% |  |
| T+50:48:12 | Kerbin | 87.2 km | 2437 m/s | 5.05 t | 2503 kg | 100% |  |
| T+50:48:28 | Kerbin | 87.9 km | 2620 m/s | 4.78 t | 2233 kg | 100% |  |
| T+50:48:43 | Kerbin | 89.2 km | 2813 m/s | 4.51 t | 1964 kg | 100% |  |
| T+50:48:58 | Kerbin | 91.6 km | 3015 m/s | 4.24 t | 1694 kg | 100% |  |
| T+51:05:09 | Kerbin | 1.42 Mm | 1835 m/s | 4.05 t | 1499 kg | 0% |  |
| T+51:21:09 | Kerbin | 2.72 Mm | 1411 m/s | 4.05 t | 1499 kg | 0% |  |
| T+51:37:09 | Kerbin | 3.84 Mm | 1205 m/s | 4.05 t | 1499 kg | 0% |  |
| T+51:53:09 | Kerbin | 4.84 Mm | 1077 m/s | 4.05 t | 1499 kg | 0% |  |
| T+52:09:09 | Kerbin | 5.76 Mm | 985 m/s | 4.05 t | 1499 kg | 0% |  |
| T+52:25:09 | Kerbin | 6.62 Mm | 916 m/s | 4.05 t | 1499 kg | 0% |  |
| T+52:41:09 | Kerbin | 7.43 Mm | 861 m/s | 4.05 t | 1499 kg | 0% |  |
| T+52:57:09 | Kerbin | 8.19 Mm | 815 m/s | 4.05 t | 1499 kg | 0% |  |
| T+53:13:09 | Kerbin | 8.92 Mm | 777 m/s | 4.05 t | 1499 kg | 0% |  |
| T+53:29:09 | Kerbin | 9.61 Mm | 743 m/s | 4.05 t | 1499 kg | 0% |  |
| T+53:45:09 | Kerbin | 10.29 Mm | 714 m/s | 4.05 t | 1499 kg | 0% |  |
| T+54:01:09 | Kerbin | 10.93 Mm | 688 m/s | 4.05 t | 1499 kg | 0% |  |
| T+54:17:09 | Kerbin | 11.56 Mm | 665 m/s | 4.05 t | 1499 kg | 0% |  |
| T+54:33:09 | Kerbin | 12.16 Mm | 644 m/s | 4.05 t | 1499 kg | 0% |  |
| T+54:49:09 | Kerbin | 12.75 Mm | 625 m/s | 4.05 t | 1499 kg | 0% |  |
| T+55:05:09 | Kerbin | 13.32 Mm | 607 m/s | 4.05 t | 1499 kg | 0% |  |
| T+55:21:09 | Kerbin | 13.87 Mm | 591 m/s | 4.05 t | 1499 kg | 0% |  |
| T+55:37:09 | Kerbin | 14.41 Mm | 576 m/s | 4.05 t | 1499 kg | 0% |  |
| T+55:53:09 | Kerbin | 14.94 Mm | 562 m/s | 4.05 t | 1499 kg | 0% |  |
| T+56:09:09 | Kerbin | 15.46 Mm | 548 m/s | 4.05 t | 1499 kg | 0% |  |
| T+56:25:09 | Kerbin | 15.96 Mm | 536 m/s | 4.05 t | 1499 kg | 0% |  |
| T+56:41:09 | Kerbin | 16.46 Mm | 524 m/s | 4.05 t | 1499 kg | 0% |  |
| T+56:57:09 | Kerbin | 16.94 Mm | 513 m/s | 4.05 t | 1499 kg | 0% |  |
| T+57:13:09 | Kerbin | 17.41 Mm | 503 m/s | 4.05 t | 1499 kg | 0% |  |
| T+57:29:09 | Kerbin | 17.88 Mm | 493 m/s | 4.05 t | 1499 kg | 0% |  |
| T+57:45:09 | Kerbin | 18.33 Mm | 484 m/s | 4.05 t | 1499 kg | 0% |  |
| T+58:01:09 | Kerbin | 18.78 Mm | 475 m/s | 4.05 t | 1499 kg | 0% |  |
| T+58:17:09 | Kerbin | 19.22 Mm | 466 m/s | 4.05 t | 1499 kg | 0% |  |
| T+58:33:09 | Kerbin | 19.65 Mm | 458 m/s | 4.05 t | 1499 kg | 0% |  |
| T+58:49:09 | Kerbin | 20.07 Mm | 450 m/s | 4.05 t | 1499 kg | 0% |  |
| T+59:05:09 | Kerbin | 20.49 Mm | 443 m/s | 4.05 t | 1499 kg | 0% |  |
| T+59:21:09 | Kerbin | 20.90 Mm | 435 m/s | 4.05 t | 1499 kg | 0% |  |
| T+59:37:09 | Kerbin | 21.30 Mm | 428 m/s | 4.05 t | 1499 kg | 0% |  |
| T+59:53:09 | Kerbin | 21.70 Mm | 422 m/s | 4.05 t | 1499 kg | 0% |  |
| T+60:09:09 | Kerbin | 22.09 Mm | 415 m/s | 4.05 t | 1499 kg | 0% |  |
| T+60:25:09 | Kerbin | 22.47 Mm | 409 m/s | 4.05 t | 1499 kg | 0% |  |
| T+60:41:09 | Kerbin | 22.85 Mm | 403 m/s | 4.05 t | 1499 kg | 0% |  |
| T+60:57:09 | Kerbin | 23.23 Mm | 397 m/s | 4.05 t | 1499 kg | 0% |  |
| T+61:13:09 | Kerbin | 23.59 Mm | 391 m/s | 4.05 t | 1499 kg | 0% |  |
| T+61:29:09 | Kerbin | 23.96 Mm | 386 m/s | 4.05 t | 1499 kg | 0% |  |
| T+61:45:09 | Kerbin | 24.31 Mm | 380 m/s | 4.05 t | 1499 kg | 0% |  |
| T+62:01:09 | Kerbin | 24.67 Mm | 375 m/s | 4.05 t | 1499 kg | 0% |  |
| T+62:17:09 | Kerbin | 25.01 Mm | 370 m/s | 4.05 t | 1499 kg | 0% |  |
| T+62:33:09 | Kerbin | 25.36 Mm | 365 m/s | 4.05 t | 1499 kg | 0% |  |
| T+62:49:09 | Kerbin | 25.70 Mm | 360 m/s | 4.05 t | 1499 kg | 0% |  |
| T+63:05:09 | Kerbin | 26.03 Mm | 355 m/s | 4.05 t | 1499 kg | 0% |  |
| T+63:21:09 | Kerbin | 26.36 Mm | 351 m/s | 4.05 t | 1499 kg | 0% |  |
| T+63:37:09 | Kerbin | 26.68 Mm | 346 m/s | 4.05 t | 1499 kg | 0% |  |
| T+63:53:09 | Kerbin | 27.01 Mm | 342 m/s | 4.05 t | 1499 kg | 0% |  |
| T+64:09:09 | Kerbin | 27.32 Mm | 338 m/s | 4.05 t | 1499 kg | 0% |  |
| T+64:25:09 | Kerbin | 27.64 Mm | 333 m/s | 4.05 t | 1499 kg | 0% |  |
| T+64:41:09 | Kerbin | 27.95 Mm | 329 m/s | 4.05 t | 1499 kg | 0% |  |
| T+64:57:09 | Kerbin | 28.25 Mm | 325 m/s | 4.05 t | 1499 kg | 0% |  |
| T+65:13:09 | Kerbin | 28.55 Mm | 321 m/s | 4.05 t | 1499 kg | 0% |  |
| T+65:29:09 | Kerbin | 28.85 Mm | 318 m/s | 4.05 t | 1499 kg | 0% |  |
| T+65:45:09 | Kerbin | 29.15 Mm | 314 m/s | 4.05 t | 1499 kg | 0% |  |
| T+66:01:09 | Kerbin | 29.44 Mm | 310 m/s | 4.05 t | 1499 kg | 0% |  |
| T+66:17:09 | Kerbin | 29.72 Mm | 306 m/s | 4.05 t | 1499 kg | 0% |  |
| T+66:33:09 | Kerbin | 30.01 Mm | 303 m/s | 4.05 t | 1499 kg | 0% |  |
| T+66:49:09 | Kerbin | 30.29 Mm | 299 m/s | 4.05 t | 1499 kg | 0% |  |
| T+67:05:09 | Kerbin | 30.57 Mm | 296 m/s | 4.05 t | 1499 kg | 0% |  |
| T+67:21:09 | Kerbin | 30.84 Mm | 293 m/s | 4.05 t | 1499 kg | 0% |  |
| T+67:37:09 | Kerbin | 31.11 Mm | 289 m/s | 4.05 t | 1499 kg | 0% |  |
| T+67:53:09 | Kerbin | 31.38 Mm | 286 m/s | 4.05 t | 1499 kg | 0% |  |
| T+68:09:09 | Kerbin | 31.65 Mm | 283 m/s | 4.05 t | 1499 kg | 0% |  |
| T+68:25:09 | Kerbin | 31.91 Mm | 280 m/s | 4.05 t | 1499 kg | 0% |  |
| T+68:41:09 | Kerbin | 32.17 Mm | 277 m/s | 4.05 t | 1499 kg | 0% |  |
| T+68:57:09 | Kerbin | 32.42 Mm | 274 m/s | 4.05 t | 1499 kg | 0% |  |
| T+69:13:09 | Kerbin | 32.68 Mm | 271 m/s | 4.05 t | 1499 kg | 0% |  |
| T+69:29:09 | Kerbin | 32.93 Mm | 268 m/s | 4.05 t | 1499 kg | 0% |  |
| T+69:45:09 | Kerbin | 33.18 Mm | 265 m/s | 4.05 t | 1499 kg | 0% |  |
| T+70:01:09 | Kerbin | 33.42 Mm | 262 m/s | 4.05 t | 1499 kg | 0% |  |
| T+70:17:09 | Kerbin | 33.66 Mm | 259 m/s | 4.05 t | 1499 kg | 0% |  |
| T+70:33:09 | Kerbin | 33.90 Mm | 256 m/s | 4.05 t | 1499 kg | 0% |  |
| T+70:49:09 | Kerbin | 34.14 Mm | 254 m/s | 4.05 t | 1499 kg | 0% |  |
| T+71:05:09 | Kerbin | 34.37 Mm | 251 m/s | 4.05 t | 1499 kg | 0% |  |
| T+71:21:09 | Kerbin | 34.61 Mm | 248 m/s | 4.05 t | 1499 kg | 0% |  |
| T+71:37:09 | Kerbin | 34.84 Mm | 246 m/s | 4.05 t | 1499 kg | 0% |  |
| T+71:53:09 | Kerbin | 35.06 Mm | 243 m/s | 4.05 t | 1499 kg | 0% |  |
| T+72:09:09 | Kerbin | 35.29 Mm | 240 m/s | 4.05 t | 1499 kg | 0% |  |
| T+72:25:09 | Kerbin | 35.51 Mm | 238 m/s | 4.05 t | 1499 kg | 0% |  |
| T+72:41:09 | Kerbin | 35.73 Mm | 235 m/s | 4.05 t | 1499 kg | 0% |  |
| T+72:57:09 | Kerbin | 35.95 Mm | 233 m/s | 4.05 t | 1499 kg | 0% |  |
| T+73:13:09 | Kerbin | 36.16 Mm | 230 m/s | 4.05 t | 1499 kg | 0% |  |
| T+73:29:09 | Kerbin | 36.37 Mm | 228 m/s | 4.05 t | 1499 kg | 0% |  |
| T+73:45:09 | Kerbin | 36.58 Mm | 226 m/s | 4.05 t | 1499 kg | 0% |  |
| T+74:01:09 | Kerbin | 36.79 Mm | 223 m/s | 4.05 t | 1499 kg | 0% |  |
| T+74:17:09 | Kerbin | 37.00 Mm | 221 m/s | 4.05 t | 1499 kg | 0% |  |
| T+74:33:09 | Kerbin | 37.20 Mm | 219 m/s | 4.05 t | 1499 kg | 0% |  |
| T+74:49:09 | Kerbin | 37.40 Mm | 216 m/s | 4.05 t | 1499 kg | 0% |  |
| T+75:05:09 | Kerbin | 37.60 Mm | 214 m/s | 4.05 t | 1499 kg | 0% |  |
| T+75:21:09 | Kerbin | 37.80 Mm | 212 m/s | 4.05 t | 1499 kg | 0% |  |
| T+75:37:09 | Kerbin | 37.99 Mm | 210 m/s | 4.05 t | 1499 kg | 0% |  |
| T+75:53:09 | Kerbin | 38.19 Mm | 208 m/s | 4.05 t | 1499 kg | 0% |  |
| T+76:09:09 | Kerbin | 38.38 Mm | 205 m/s | 4.05 t | 1499 kg | 0% |  |
| T+76:25:09 | Kerbin | 38.57 Mm | 203 m/s | 4.05 t | 1499 kg | 0% |  |
| T+76:41:09 | Kerbin | 38.75 Mm | 201 m/s | 4.05 t | 1499 kg | 0% |  |
| T+76:57:09 | Kerbin | 38.94 Mm | 199 m/s | 4.05 t | 1499 kg | 0% |  |
| T+77:13:09 | Kerbin | 39.12 Mm | 197 m/s | 4.05 t | 1499 kg | 0% |  |
| T+77:29:09 | Kerbin | 39.30 Mm | 195 m/s | 4.05 t | 1499 kg | 0% |  |
| T+77:45:09 | Kerbin | 39.48 Mm | 193 m/s | 4.05 t | 1499 kg | 0% |  |
| T+78:01:09 | Kerbin | 39.66 Mm | 191 m/s | 4.05 t | 1499 kg | 0% |  |
| T+78:17:09 | Kerbin | 39.83 Mm | 189 m/s | 4.05 t | 1499 kg | 0% |  |
| T+78:33:09 | Kerbin | 40.00 Mm | 187 m/s | 4.05 t | 1499 kg | 0% |  |
| T+78:49:09 | Kerbin | 40.17 Mm | 185 m/s | 4.05 t | 1499 kg | 0% |  |
| T+79:05:09 | Kerbin | 40.34 Mm | 183 m/s | 4.05 t | 1499 kg | 0% |  |
| T+79:21:09 | Kerbin | 40.51 Mm | 181 m/s | 4.05 t | 1499 kg | 0% |  |
| T+79:37:09 | Kerbin | 40.68 Mm | 179 m/s | 4.05 t | 1499 kg | 0% |  |
| T+79:53:09 | Kerbin | 40.84 Mm | 177 m/s | 4.05 t | 1499 kg | 0% |  |
| T+80:09:09 | Kerbin | 41.00 Mm | 175 m/s | 4.05 t | 1499 kg | 0% |  |
| T+80:25:09 | Kerbin | 41.16 Mm | 174 m/s | 4.05 t | 1499 kg | 0% |  |
| T+80:41:09 | Kerbin | 41.32 Mm | 172 m/s | 4.05 t | 1499 kg | 0% |  |
| T+80:57:09 | Kerbin | 41.47 Mm | 170 m/s | 4.05 t | 1499 kg | 0% |  |
| T+81:13:09 | Kerbin | 41.63 Mm | 168 m/s | 4.05 t | 1499 kg | 0% |  |
| T+81:29:09 | Kerbin | 41.78 Mm | 166 m/s | 4.05 t | 1499 kg | 0% |  |
| T+81:45:09 | Kerbin | 41.93 Mm | 164 m/s | 4.05 t | 1499 kg | 0% |  |
| T+82:01:09 | Kerbin | 42.08 Mm | 163 m/s | 4.05 t | 1499 kg | 0% |  |
| T+82:17:09 | Kerbin | 42.23 Mm | 161 m/s | 4.05 t | 1499 kg | 0% |  |
| T+82:33:09 | Kerbin | 42.37 Mm | 159 m/s | 4.05 t | 1499 kg | 0% |  |
| T+82:49:09 | Kerbin | 42.52 Mm | 157 m/s | 4.05 t | 1499 kg | 0% |  |
| T+83:05:09 | Kerbin | 42.66 Mm | 156 m/s | 4.05 t | 1499 kg | 0% |  |
| T+83:21:09 | Kerbin | 42.80 Mm | 154 m/s | 4.05 t | 1499 kg | 0% |  |
| T+83:37:09 | Kerbin | 42.94 Mm | 152 m/s | 4.05 t | 1499 kg | 0% |  |
| T+83:53:09 | Kerbin | 43.08 Mm | 151 m/s | 4.05 t | 1499 kg | 0% |  |
| T+84:09:09 | Kerbin | 43.21 Mm | 149 m/s | 4.05 t | 1499 kg | 0% |  |
| T+84:25:09 | Kerbin | 43.35 Mm | 147 m/s | 4.05 t | 1499 kg | 0% |  |
| T+84:41:09 | Kerbin | 43.48 Mm | 146 m/s | 4.05 t | 1499 kg | 0% |  |
| T+84:57:09 | Kerbin | 43.61 Mm | 144 m/s | 4.05 t | 1499 kg | 0% |  |
| T+85:13:09 | Kerbin | 43.74 Mm | 142 m/s | 4.05 t | 1499 kg | 0% |  |
| T+85:29:09 | Kerbin | 43.87 Mm | 141 m/s | 4.05 t | 1499 kg | 0% |  |
| T+85:45:09 | Kerbin | 43.99 Mm | 139 m/s | 4.05 t | 1499 kg | 0% |  |
| T+86:01:09 | Kerbin | 44.12 Mm | 138 m/s | 4.05 t | 1499 kg | 0% |  |
| T+86:17:09 | Kerbin | 44.24 Mm | 136 m/s | 4.05 t | 1499 kg | 0% |  |
| T+86:33:09 | Kerbin | 44.36 Mm | 134 m/s | 4.05 t | 1499 kg | 0% |  |
| T+86:49:09 | Kerbin | 44.48 Mm | 133 m/s | 4.05 t | 1499 kg | 0% |  |
| T+87:05:09 | Kerbin | 44.60 Mm | 131 m/s | 4.05 t | 1499 kg | 0% |  |
| T+87:21:09 | Kerbin | 44.71 Mm | 130 m/s | 4.05 t | 1499 kg | 0% |  |
| T+87:37:09 | Kerbin | 44.83 Mm | 128 m/s | 4.05 t | 1499 kg | 0% |  |
| T+87:53:09 | Kerbin | 44.94 Mm | 127 m/s | 4.05 t | 1499 kg | 0% |  |
| T+88:09:09 | Kerbin | 45.05 Mm | 125 m/s | 4.05 t | 1499 kg | 0% |  |
| T+88:25:09 | Kerbin | 45.16 Mm | 124 m/s | 4.05 t | 1499 kg | 0% |  |
| T+88:41:09 | Kerbin | 45.27 Mm | 122 m/s | 4.05 t | 1499 kg | 0% |  |
| T+88:57:09 | Kerbin | 45.38 Mm | 121 m/s | 4.05 t | 1499 kg | 0% |  |
| T+89:13:09 | Kerbin | 45.49 Mm | 119 m/s | 4.05 t | 1499 kg | 0% |  |
| T+89:29:09 | Kerbin | 45.59 Mm | 118 m/s | 4.05 t | 1499 kg | 0% |  |
| T+89:45:09 | Kerbin | 45.69 Mm | 116 m/s | 4.05 t | 1499 kg | 0% |  |
| T+90:01:09 | Kerbin | 45.79 Mm | 115 m/s | 4.05 t | 1499 kg | 0% |  |
| T+90:17:09 | Kerbin | 45.89 Mm | 114 m/s | 4.05 t | 1499 kg | 0% |  |
| T+90:33:09 | Kerbin | 45.99 Mm | 112 m/s | 4.05 t | 1499 kg | 0% |  |
| T+90:49:09 | Kerbin | 46.09 Mm | 111 m/s | 4.05 t | 1499 kg | 0% |  |
| T+91:05:09 | Kerbin | 46.19 Mm | 109 m/s | 4.05 t | 1499 kg | 0% |  |
| T+91:21:09 | Kerbin | 46.28 Mm | 108 m/s | 4.05 t | 1499 kg | 0% |  |
| T+91:37:09 | Kerbin | 46.37 Mm | 107 m/s | 4.05 t | 1499 kg | 0% |  |
| T+91:53:09 | Kerbin | 46.46 Mm | 105 m/s | 4.05 t | 1499 kg | 0% |  |
| T+92:09:09 | Kerbin | 46.55 Mm | 104 m/s | 4.05 t | 1499 kg | 0% |  |
| T+92:25:09 | Kerbin | 46.64 Mm | 102 m/s | 4.05 t | 1499 kg | 0% |  |
| T+92:41:09 | Kerbin | 46.73 Mm | 101 m/s | 4.05 t | 1499 kg | 0% |  |
| T+92:57:09 | Kerbin | 46.81 Mm | 100 m/s | 4.05 t | 1499 kg | 0% |  |
| T+93:13:09 | Kerbin | 46.90 Mm | 98 m/s | 4.05 t | 1499 kg | 0% |  |
| T+93:29:09 | Kerbin | 46.98 Mm | 97 m/s | 4.05 t | 1499 kg | 0% |  |
| T+93:45:09 | Kerbin | 47.06 Mm | 96 m/s | 4.05 t | 1499 kg | 0% |  |
| T+94:01:09 | Kerbin | 47.14 Mm | 94 m/s | 4.05 t | 1499 kg | 0% |  |
| T+94:17:09 | Kerbin | 47.22 Mm | 93 m/s | 4.05 t | 1499 kg | 0% |  |
| T+94:33:09 | Kerbin | 47.30 Mm | 92 m/s | 4.05 t | 1499 kg | 0% |  |
| T+94:49:09 | Kerbin | 47.37 Mm | 91 m/s | 4.05 t | 1499 kg | 0% |  |
| T+95:05:09 | Kerbin | 47.45 Mm | 89 m/s | 4.05 t | 1499 kg | 0% |  |
| T+95:21:09 | Kerbin | 47.52 Mm | 88 m/s | 4.05 t | 1499 kg | 0% |  |
| T+95:37:09 | Kerbin | 47.59 Mm | 87 m/s | 4.05 t | 1499 kg | 0% |  |
| T+95:53:09 | Kerbin | 47.66 Mm | 86 m/s | 4.05 t | 1499 kg | 0% |  |
| T+96:09:09 | Kerbin | 47.73 Mm | 84 m/s | 4.05 t | 1499 kg | 0% |  |
| T+96:25:09 | Kerbin | 47.80 Mm | 83 m/s | 4.05 t | 1499 kg | 0% |  |
| T+96:41:09 | Kerbin | 47.87 Mm | 82 m/s | 4.05 t | 1499 kg | 0% |  |
| T+96:57:09 | Kerbin | 47.93 Mm | 81 m/s | 4.05 t | 1499 kg | 0% |  |
| T+97:13:09 | Kerbin | 48.00 Mm | 80 m/s | 4.05 t | 1499 kg | 0% |  |
| T+97:29:09 | Kerbin | 48.06 Mm | 78 m/s | 4.05 t | 1499 kg | 0% |  |
| T+97:45:09 | Kerbin | 48.12 Mm | 77 m/s | 4.05 t | 1499 kg | 0% |  |
| T+98:01:09 | Kerbin | 48.18 Mm | 76 m/s | 4.05 t | 1499 kg | 0% |  |
| T+98:17:09 | Kerbin | 48.24 Mm | 75 m/s | 4.05 t | 1499 kg | 0% |  |
| T+98:33:09 | Kerbin | 48.29 Mm | 74 m/s | 4.05 t | 1499 kg | 0% |  |
| T+98:49:09 | Kerbin | 48.35 Mm | 73 m/s | 4.05 t | 1499 kg | 0% |  |
| T+99:05:09 | Kerbin | 48.40 Mm | 72 m/s | 4.05 t | 1499 kg | 0% |  |
| T+99:21:09 | Kerbin | 48.46 Mm | 70 m/s | 4.05 t | 1499 kg | 0% |  |
| T+99:37:09 | Kerbin | 48.51 Mm | 69 m/s | 4.05 t | 1499 kg | 0% |  |
| T+99:53:09 | Kerbin | 48.56 Mm | 68 m/s | 4.05 t | 1499 kg | 0% |  |
| T+100:09:09 | Kerbin | 48.61 Mm | 67 m/s | 4.05 t | 1499 kg | 0% |  |
| T+100:25:09 | Kerbin | 48.66 Mm | 66 m/s | 4.05 t | 1499 kg | 0% |  |
| T+100:41:09 | Kerbin | 48.70 Mm | 65 m/s | 4.05 t | 1499 kg | 0% |  |
| T+100:57:09 | Kerbin | 48.75 Mm | 64 m/s | 4.05 t | 1499 kg | 0% |  |
| T+101:13:09 | Kerbin | 48.79 Mm | 63 m/s | 4.05 t | 1499 kg | 0% |  |
| T+101:29:09 | Kerbin | 48.83 Mm | 62 m/s | 4.05 t | 1499 kg | 0% |  |
| T+101:45:09 | Kerbin | 48.87 Mm | 61 m/s | 4.05 t | 1499 kg | 0% |  |
| T+102:01:09 | Kerbin | 48.91 Mm | 60 m/s | 4.05 t | 1499 kg | 0% |  |
| T+102:17:09 | Kerbin | 48.95 Mm | 59 m/s | 4.05 t | 1499 kg | 0% |  |
| T+102:33:09 | Kerbin | 48.99 Mm | 58 m/s | 4.05 t | 1499 kg | 0% |  |
| T+102:49:09 | Kerbin | 49.03 Mm | 58 m/s | 4.05 t | 1499 kg | 0% |  |
| T+103:05:09 | Kerbin | 49.06 Mm | 57 m/s | 4.05 t | 1499 kg | 0% |  |
| T+103:21:09 | Kerbin | 49.10 Mm | 56 m/s | 4.05 t | 1499 kg | 0% |  |
| T+103:37:09 | Kerbin | 49.13 Mm | 55 m/s | 4.05 t | 1499 kg | 0% |  |
| T+103:53:09 | Kerbin | 49.16 Mm | 54 m/s | 4.05 t | 1499 kg | 0% |  |
| T+104:09:09 | Kerbin | 49.19 Mm | 53 m/s | 4.05 t | 1499 kg | 0% |  |
| T+104:25:09 | Kerbin | 49.22 Mm | 53 m/s | 4.05 t | 1499 kg | 0% |  |
| T+104:41:09 | Kerbin | 49.24 Mm | 52 m/s | 4.05 t | 1499 kg | 0% |  |
| T+104:57:09 | Kerbin | 49.27 Mm | 51 m/s | 4.05 t | 1499 kg | 0% |  |
| T+105:13:09 | Kerbin | 49.29 Mm | 50 m/s | 4.05 t | 1499 kg | 0% |  |
| T+105:29:09 | Kerbin | 49.32 Mm | 50 m/s | 4.05 t | 1499 kg | 0% |  |
| T+105:45:09 | Kerbin | 49.34 Mm | 49 m/s | 4.05 t | 1499 kg | 0% |  |
| T+106:01:09 | Kerbin | 49.36 Mm | 49 m/s | 4.05 t | 1499 kg | 0% |  |
| T+106:17:09 | Kerbin | 49.38 Mm | 48 m/s | 4.05 t | 1499 kg | 0% |  |
| T+106:30:49 | Kerbin | 49.40 Mm | 45 m/s | 4.05 t | 1495 kg | 100% |  |
| T+106:46:58 | Kerbin | 49.30 Mm | 101 m/s | 3.89 t | 1339 kg | 0% |  |
| T+107:02:58 | Kerbin | 49.21 Mm | 102 m/s | 3.89 t | 1339 kg | 0% |  |
| T+107:18:58 | Kerbin | 49.12 Mm | 104 m/s | 3.89 t | 1339 kg | 0% |  |
| T+107:34:58 | Kerbin | 49.02 Mm | 105 m/s | 3.89 t | 1339 kg | 0% |  |
| T+107:50:58 | Kerbin | 48.93 Mm | 106 m/s | 3.89 t | 1339 kg | 0% |  |
| T+108:06:58 | Kerbin | 48.83 Mm | 108 m/s | 3.89 t | 1339 kg | 0% |  |
| T+108:22:58 | Kerbin | 48.73 Mm | 109 m/s | 3.89 t | 1339 kg | 0% |  |
| T+108:38:58 | Kerbin | 48.63 Mm | 110 m/s | 3.89 t | 1339 kg | 0% |  |
| T+108:50:58 | Minmus | 2.19 Mm | 323 m/s | 3.89 t | 1339 kg | 0% | Minmus SOI |
| T+109:00:02 | Minmus | 2.18 Mm | 320 m/s | 3.89 t | 1337 kg | 100% |  |
| T+109:00:17 | Minmus | 2.18 Mm | 78 m/s | 3.62 t | 1068 kg | 100% |  |
| T+109:00:20 | Minmus | 2.18 Mm | 28 m/s | 3.56 t | 1015 kg | 0% | Minmus orbit 2094 × 2178 km |
| T+109:16:21 | Minmus | 2.18 Mm | 40 m/s | 3.55 t | 1002 kg | 0% |  |
| T+109:32:21 | Minmus | 2.18 Mm | 40 m/s | 3.55 t | 1002 kg | 0% |  |
| T+109:48:21 | Minmus | 2.18 Mm | 40 m/s | 3.55 t | 1002 kg | 0% |  |
| T+110:04:21 | Minmus | 2.18 Mm | 40 m/s | 3.55 t | 1002 kg | 0% |  |
| T+110:20:21 | Minmus | 2.18 Mm | 40 m/s | 3.55 t | 1002 kg | 0% |  |
| T+110:36:21 | Minmus | 2.18 Mm | 40 m/s | 3.55 t | 1002 kg | 0% |  |
| T+110:52:21 | Minmus | 2.19 Mm | 40 m/s | 3.55 t | 1002 kg | 0% |  |
| T+110:58:21 | Kerbin | 48.35 Mm | 243 m/s | 3.55 t | 997 kg | 100% |  |
| T+110:58:29 | Minmus | 2.19 Mm | 109 m/s | 3.41 t | 855 kg | 0% | escape cutoff |
| T+111:14:29 | Minmus | 2.12 Mm | 109 m/s | 3.41 t | 855 kg | 0% |  |
| T+111:30:29 | Minmus | 2.05 Mm | 110 m/s | 3.41 t | 855 kg | 0% |  |
| T+111:46:29 | Minmus | 1.98 Mm | 110 m/s | 3.41 t | 855 kg | 0% |  |
| T+112:02:29 | Minmus | 1.92 Mm | 110 m/s | 3.41 t | 855 kg | 0% |  |
| T+112:18:29 | Minmus | 1.86 Mm | 110 m/s | 3.41 t | 855 kg | 0% |  |
| T+112:34:29 | Minmus | 1.80 Mm | 111 m/s | 3.41 t | 855 kg | 0% |  |
| T+112:50:29 | Minmus | 1.75 Mm | 111 m/s | 3.41 t | 855 kg | 0% |  |
| T+113:06:29 | Minmus | 1.70 Mm | 111 m/s | 3.41 t | 855 kg | 0% |  |
| T+113:22:29 | Minmus | 1.66 Mm | 111 m/s | 3.41 t | 855 kg | 0% |  |
| T+113:38:29 | Minmus | 1.62 Mm | 111 m/s | 3.41 t | 855 kg | 0% |  |
| T+113:54:29 | Minmus | 1.59 Mm | 112 m/s | 3.41 t | 855 kg | 0% |  |
| T+114:10:29 | Minmus | 1.56 Mm | 112 m/s | 3.41 t | 855 kg | 0% |  |
| T+114:26:29 | Minmus | 1.54 Mm | 112 m/s | 3.41 t | 855 kg | 0% |  |
| T+114:42:29 | Minmus | 1.52 Mm | 112 m/s | 3.41 t | 855 kg | 0% |  |
| T+114:58:29 | Minmus | 1.52 Mm | 112 m/s | 3.41 t | 855 kg | 0% |  |
| T+115:14:29 | Minmus | 1.51 Mm | 112 m/s | 3.41 t | 855 kg | 0% |  |
| T+115:30:29 | Minmus | 1.52 Mm | 112 m/s | 3.41 t | 855 kg | 0% |  |
| T+115:46:29 | Minmus | 1.53 Mm | 112 m/s | 3.41 t | 855 kg | 0% |  |
| T+116:02:29 | Minmus | 1.55 Mm | 112 m/s | 3.41 t | 855 kg | 0% |  |
| T+116:18:29 | Minmus | 1.58 Mm | 112 m/s | 3.41 t | 855 kg | 0% |  |
| T+116:34:29 | Minmus | 1.61 Mm | 112 m/s | 3.41 t | 855 kg | 0% |  |
| T+116:50:29 | Minmus | 1.64 Mm | 111 m/s | 3.41 t | 855 kg | 0% |  |
| T+117:06:29 | Minmus | 1.68 Mm | 111 m/s | 3.41 t | 855 kg | 0% |  |
| T+117:22:29 | Minmus | 1.73 Mm | 111 m/s | 3.41 t | 855 kg | 0% |  |
| T+117:38:29 | Minmus | 1.78 Mm | 111 m/s | 3.41 t | 855 kg | 0% |  |
| T+117:54:29 | Minmus | 1.84 Mm | 110 m/s | 3.41 t | 855 kg | 0% |  |
| T+118:10:29 | Minmus | 1.90 Mm | 110 m/s | 3.41 t | 855 kg | 0% |  |
| T+118:26:29 | Minmus | 1.96 Mm | 110 m/s | 3.41 t | 855 kg | 0% |  |
| T+118:42:29 | Minmus | 2.02 Mm | 110 m/s | 3.41 t | 855 kg | 0% |  |
| T+118:58:29 | Minmus | 2.09 Mm | 109 m/s | 3.41 t | 855 kg | 0% |  |
| T+119:14:29 | Minmus | 2.16 Mm | 109 m/s | 3.41 t | 855 kg | 0% |  |
| T+119:30:29 | Kerbin | 47.66 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+119:46:29 | Kerbin | 47.65 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+120:02:29 | Kerbin | 47.65 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+120:18:29 | Kerbin | 47.64 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+120:34:29 | Kerbin | 47.64 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+120:50:29 | Kerbin | 47.64 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+121:06:29 | Kerbin | 47.64 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+121:22:29 | Kerbin | 47.64 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+121:38:29 | Kerbin | 47.64 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+121:54:29 | Kerbin | 47.65 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+122:10:29 | Kerbin | 47.66 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+122:26:29 | Kerbin | 47.66 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+122:42:29 | Kerbin | 47.67 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+122:58:29 | Kerbin | 47.68 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+123:14:29 | Kerbin | 47.69 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+123:30:29 | Kerbin | 47.71 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+123:46:29 | Kerbin | 47.72 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+124:02:29 | Kerbin | 47.74 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+124:18:29 | Kerbin | 47.75 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+124:34:29 | Kerbin | 47.77 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+124:50:29 | Kerbin | 47.79 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+125:06:29 | Kerbin | 47.81 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+125:22:29 | Kerbin | 47.83 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+125:38:29 | Kerbin | 47.86 Mm | 381 m/s | 3.41 t | 855 kg | 0% |  |
| T+125:54:29 | Kerbin | 47.88 Mm | 380 m/s | 3.41 t | 855 kg | 0% |  |
| T+126:10:29 | Kerbin | 47.91 Mm | 380 m/s | 3.41 t | 855 kg | 0% |  |
| T+126:26:29 | Kerbin | 47.94 Mm | 380 m/s | 3.41 t | 855 kg | 0% |  |
| T+126:42:29 | Kerbin | 47.97 Mm | 380 m/s | 3.41 t | 855 kg | 0% |  |
| T+126:58:29 | Kerbin | 48.00 Mm | 380 m/s | 3.41 t | 855 kg | 0% |  |
| T+127:14:29 | Kerbin | 48.03 Mm | 380 m/s | 3.41 t | 855 kg | 0% |  |
| T+127:30:29 | Kerbin | 48.06 Mm | 380 m/s | 3.41 t | 855 kg | 0% |  |
| T+127:46:29 | Kerbin | 48.10 Mm | 380 m/s | 3.41 t | 855 kg | 0% |  |
| T+128:02:29 | Kerbin | 48.13 Mm | 379 m/s | 3.41 t | 855 kg | 0% |  |
| T+128:18:29 | Kerbin | 48.17 Mm | 379 m/s | 3.41 t | 855 kg | 0% |  |
| T+128:34:29 | Kerbin | 48.21 Mm | 379 m/s | 3.41 t | 855 kg | 0% |  |
| T+128:50:29 | Kerbin | 48.25 Mm | 379 m/s | 3.41 t | 855 kg | 0% |  |
| T+129:06:29 | Kerbin | 48.29 Mm | 379 m/s | 3.41 t | 855 kg | 0% |  |
| T+129:22:29 | Kerbin | 48.33 Mm | 379 m/s | 3.41 t | 855 kg | 0% |  |
| T+129:38:29 | Kerbin | 48.37 Mm | 379 m/s | 3.41 t | 855 kg | 0% |  |
| T+129:54:29 | Kerbin | 48.42 Mm | 378 m/s | 3.41 t | 855 kg | 0% |  |
| T+130:10:29 | Kerbin | 48.47 Mm | 378 m/s | 3.41 t | 855 kg | 0% |  |
| T+130:26:29 | Kerbin | 48.51 Mm | 378 m/s | 3.41 t | 855 kg | 0% |  |
| T+130:42:29 | Kerbin | 48.56 Mm | 378 m/s | 3.41 t | 855 kg | 0% |  |
| T+130:58:29 | Kerbin | 48.61 Mm | 378 m/s | 3.41 t | 855 kg | 0% |  |
| T+131:14:29 | Kerbin | 48.66 Mm | 377 m/s | 3.41 t | 855 kg | 0% |  |
| T+131:30:29 | Kerbin | 48.72 Mm | 377 m/s | 3.41 t | 855 kg | 0% |  |
| T+131:46:29 | Kerbin | 48.77 Mm | 377 m/s | 3.41 t | 855 kg | 0% |  |
| T+132:02:29 | Kerbin | 48.83 Mm | 377 m/s | 3.41 t | 855 kg | 0% |  |
| T+132:18:29 | Kerbin | 48.88 Mm | 377 m/s | 3.41 t | 855 kg | 0% |  |
| T+132:34:29 | Kerbin | 48.94 Mm | 376 m/s | 3.41 t | 855 kg | 0% |  |
| T+132:50:29 | Kerbin | 49.00 Mm | 376 m/s | 3.41 t | 855 kg | 0% |  |
| T+133:06:29 | Kerbin | 49.06 Mm | 376 m/s | 3.41 t | 855 kg | 0% |  |
| T+133:22:29 | Kerbin | 49.12 Mm | 376 m/s | 3.41 t | 855 kg | 0% |  |
| T+133:38:29 | Kerbin | 49.18 Mm | 375 m/s | 3.41 t | 855 kg | 0% |  |
| T+133:54:29 | Kerbin | 49.25 Mm | 375 m/s | 3.41 t | 855 kg | 0% |  |
| T+134:10:29 | Kerbin | 49.31 Mm | 375 m/s | 3.41 t | 855 kg | 0% |  |
| T+134:26:29 | Kerbin | 49.38 Mm | 375 m/s | 3.41 t | 855 kg | 0% |  |
| T+134:42:29 | Kerbin | 49.45 Mm | 374 m/s | 3.41 t | 855 kg | 0% |  |
| T+134:58:29 | Kerbin | 49.51 Mm | 374 m/s | 3.41 t | 855 kg | 0% |  |
| T+135:14:29 | Kerbin | 49.58 Mm | 374 m/s | 3.41 t | 855 kg | 0% |  |
| T+135:30:29 | Kerbin | 49.65 Mm | 374 m/s | 3.41 t | 855 kg | 0% |  |
| T+135:46:29 | Kerbin | 49.73 Mm | 373 m/s | 3.41 t | 855 kg | 0% |  |
| T+136:02:29 | Kerbin | 49.80 Mm | 373 m/s | 3.41 t | 855 kg | 0% |  |
| T+136:18:29 | Kerbin | 49.87 Mm | 373 m/s | 3.41 t | 855 kg | 0% |  |
| T+136:34:29 | Kerbin | 49.95 Mm | 373 m/s | 3.41 t | 855 kg | 0% |  |
| T+136:50:29 | Kerbin | 50.03 Mm | 372 m/s | 3.41 t | 855 kg | 0% |  |
| T+137:06:29 | Kerbin | 50.10 Mm | 372 m/s | 3.41 t | 855 kg | 0% |  |
| T+137:22:29 | Kerbin | 50.18 Mm | 372 m/s | 3.41 t | 855 kg | 0% |  |
| T+137:38:29 | Kerbin | 50.26 Mm | 371 m/s | 3.41 t | 855 kg | 0% |  |
| T+137:54:29 | Kerbin | 50.35 Mm | 371 m/s | 3.41 t | 855 kg | 0% |  |
| T+138:10:29 | Kerbin | 50.43 Mm | 371 m/s | 3.41 t | 855 kg | 0% |  |
| T+138:26:29 | Kerbin | 50.51 Mm | 370 m/s | 3.41 t | 855 kg | 0% |  |
| T+138:42:29 | Kerbin | 50.60 Mm | 370 m/s | 3.41 t | 855 kg | 0% |  |
| T+138:58:29 | Kerbin | 50.68 Mm | 370 m/s | 3.41 t | 855 kg | 0% |  |
| T+139:14:29 | Kerbin | 50.77 Mm | 370 m/s | 3.41 t | 855 kg | 0% |  |
| T+139:30:29 | Kerbin | 50.86 Mm | 369 m/s | 3.41 t | 855 kg | 0% |  |
| T+139:46:29 | Kerbin | 50.94 Mm | 369 m/s | 3.41 t | 855 kg | 0% |  |
| T+140:02:29 | Kerbin | 51.03 Mm | 369 m/s | 3.41 t | 855 kg | 0% |  |
| T+140:18:29 | Kerbin | 51.13 Mm | 368 m/s | 3.41 t | 855 kg | 0% |  |
| T+140:34:29 | Kerbin | 51.22 Mm | 368 m/s | 3.41 t | 855 kg | 0% |  |
| T+140:50:29 | Kerbin | 51.31 Mm | 368 m/s | 3.41 t | 855 kg | 0% |  |
| T+141:06:29 | Kerbin | 51.40 Mm | 367 m/s | 3.41 t | 855 kg | 0% |  |
| T+141:22:29 | Kerbin | 51.50 Mm | 367 m/s | 3.41 t | 855 kg | 0% |  |
| T+141:38:29 | Kerbin | 51.60 Mm | 367 m/s | 3.41 t | 855 kg | 0% |  |
| T+141:54:29 | Kerbin | 51.69 Mm | 366 m/s | 3.41 t | 855 kg | 0% |  |
| T+142:10:29 | Kerbin | 51.79 Mm | 366 m/s | 3.41 t | 855 kg | 0% |  |
| T+142:26:29 | Kerbin | 51.89 Mm | 366 m/s | 3.41 t | 855 kg | 0% |  |
| T+142:42:29 | Kerbin | 51.99 Mm | 365 m/s | 3.41 t | 855 kg | 0% |  |
| T+142:58:29 | Kerbin | 52.09 Mm | 365 m/s | 3.41 t | 855 kg | 0% |  |
| T+143:14:29 | Kerbin | 52.19 Mm | 364 m/s | 3.41 t | 855 kg | 0% |  |
| T+143:30:29 | Kerbin | 52.30 Mm | 364 m/s | 3.41 t | 855 kg | 0% |  |
| T+143:46:29 | Kerbin | 52.40 Mm | 364 m/s | 3.41 t | 855 kg | 0% |  |
| T+144:02:29 | Kerbin | 52.50 Mm | 363 m/s | 3.41 t | 855 kg | 0% |  |
| T+144:18:29 | Kerbin | 52.61 Mm | 363 m/s | 3.41 t | 855 kg | 0% |  |
| T+144:34:29 | Kerbin | 52.72 Mm | 363 m/s | 3.41 t | 855 kg | 0% |  |
| T+144:50:29 | Kerbin | 52.82 Mm | 362 m/s | 3.41 t | 855 kg | 0% |  |
| T+145:06:29 | Kerbin | 52.93 Mm | 362 m/s | 3.41 t | 855 kg | 0% |  |
| T+145:22:29 | Kerbin | 53.04 Mm | 362 m/s | 3.41 t | 855 kg | 0% |  |
| T+145:38:35 | Kerbin | 53.15 Mm | 361 m/s | 3.41 t | 855 kg | 0% |  |
| T+145:54:35 | Kerbin | 53.26 Mm | 361 m/s | 3.41 t | 855 kg | 0% |  |
| T+146:10:35 | Kerbin | 53.38 Mm | 360 m/s | 3.41 t | 855 kg | 0% |  |
| T+146:26:35 | Kerbin | 53.49 Mm | 360 m/s | 3.41 t | 855 kg | 0% |  |
| T+146:42:35 | Kerbin | 53.60 Mm | 360 m/s | 3.41 t | 855 kg | 0% |  |
| T+146:58:35 | Kerbin | 53.72 Mm | 359 m/s | 3.41 t | 855 kg | 0% |  |
| T+147:14:35 | Kerbin | 53.83 Mm | 359 m/s | 3.41 t | 855 kg | 0% |  |
| T+147:30:35 | Kerbin | 53.95 Mm | 359 m/s | 3.41 t | 855 kg | 0% |  |
| T+147:46:35 | Kerbin | 54.07 Mm | 358 m/s | 3.41 t | 855 kg | 0% |  |
| T+148:02:35 | Kerbin | 54.18 Mm | 358 m/s | 3.41 t | 855 kg | 0% |  |
| T+148:18:35 | Kerbin | 54.30 Mm | 357 m/s | 3.41 t | 855 kg | 0% |  |
| T+148:34:35 | Kerbin | 54.42 Mm | 357 m/s | 3.41 t | 855 kg | 0% |  |
| T+148:50:35 | Kerbin | 54.54 Mm | 357 m/s | 3.41 t | 855 kg | 0% |  |
| T+149:06:35 | Kerbin | 54.66 Mm | 356 m/s | 3.41 t | 855 kg | 0% |  |
| T+149:22:35 | Kerbin | 54.79 Mm | 356 m/s | 3.41 t | 855 kg | 0% |  |
| T+149:38:35 | Kerbin | 54.91 Mm | 355 m/s | 3.41 t | 855 kg | 0% |  |
| T+149:54:35 | Kerbin | 55.03 Mm | 355 m/s | 3.41 t | 855 kg | 0% |  |
| T+150:10:35 | Kerbin | 55.16 Mm | 355 m/s | 3.41 t | 855 kg | 0% |  |
| T+150:26:35 | Kerbin | 55.28 Mm | 354 m/s | 3.41 t | 855 kg | 0% |  |
| T+150:42:35 | Kerbin | 55.41 Mm | 354 m/s | 3.41 t | 855 kg | 0% |  |
| T+150:58:35 | Kerbin | 55.53 Mm | 353 m/s | 3.41 t | 855 kg | 0% |  |
| T+151:14:35 | Kerbin | 55.66 Mm | 353 m/s | 3.41 t | 855 kg | 0% |  |
| T+151:30:35 | Kerbin | 55.79 Mm | 353 m/s | 3.41 t | 855 kg | 0% |  |
| T+151:46:35 | Kerbin | 55.92 Mm | 352 m/s | 3.41 t | 855 kg | 0% |  |
| T+152:02:35 | Kerbin | 56.05 Mm | 352 m/s | 3.41 t | 855 kg | 0% |  |
| T+152:18:35 | Kerbin | 56.18 Mm | 351 m/s | 3.41 t | 855 kg | 0% |  |
| T+152:34:35 | Kerbin | 56.31 Mm | 351 m/s | 3.41 t | 855 kg | 0% |  |
| T+152:50:35 | Kerbin | 56.44 Mm | 351 m/s | 3.41 t | 855 kg | 0% |  |
| T+153:06:35 | Kerbin | 56.57 Mm | 350 m/s | 3.41 t | 855 kg | 0% |  |
| T+153:22:35 | Kerbin | 56.70 Mm | 350 m/s | 3.41 t | 855 kg | 0% |  |
| T+153:38:35 | Kerbin | 56.84 Mm | 349 m/s | 3.41 t | 855 kg | 0% |  |
| T+153:54:35 | Kerbin | 56.97 Mm | 349 m/s | 3.41 t | 855 kg | 0% |  |
| T+154:10:35 | Kerbin | 57.10 Mm | 348 m/s | 3.41 t | 855 kg | 0% |  |
| T+154:26:35 | Kerbin | 57.24 Mm | 348 m/s | 3.41 t | 855 kg | 0% |  |
| T+154:42:35 | Kerbin | 57.38 Mm | 348 m/s | 3.41 t | 855 kg | 0% |  |
| T+154:58:35 | Kerbin | 57.51 Mm | 347 m/s | 3.41 t | 855 kg | 0% |  |
| T+155:14:35 | Kerbin | 57.65 Mm | 347 m/s | 3.41 t | 855 kg | 0% |  |
| T+155:30:35 | Kerbin | 57.79 Mm | 346 m/s | 3.41 t | 855 kg | 0% |  |
| T+155:46:35 | Kerbin | 57.93 Mm | 346 m/s | 3.41 t | 855 kg | 0% |  |
| T+156:02:35 | Kerbin | 58.07 Mm | 346 m/s | 3.41 t | 855 kg | 0% |  |
| T+156:18:35 | Kerbin | 58.21 Mm | 345 m/s | 3.41 t | 855 kg | 0% |  |
| T+156:34:35 | Kerbin | 58.35 Mm | 345 m/s | 3.41 t | 855 kg | 0% |  |
| T+156:50:35 | Kerbin | 58.49 Mm | 344 m/s | 3.41 t | 855 kg | 0% |  |
| T+157:06:35 | Kerbin | 58.63 Mm | 344 m/s | 3.41 t | 855 kg | 0% |  |
| T+157:22:35 | Kerbin | 58.77 Mm | 344 m/s | 3.41 t | 855 kg | 0% |  |
| T+157:38:35 | Kerbin | 58.91 Mm | 343 m/s | 3.41 t | 855 kg | 0% |  |
| T+157:54:35 | Kerbin | 59.06 Mm | 343 m/s | 3.41 t | 855 kg | 0% |  |
| T+158:10:35 | Kerbin | 59.20 Mm | 342 m/s | 3.41 t | 855 kg | 0% |  |
| T+158:26:35 | Kerbin | 59.34 Mm | 342 m/s | 3.41 t | 855 kg | 0% |  |
| T+158:42:35 | Kerbin | 59.49 Mm | 341 m/s | 3.41 t | 855 kg | 0% |  |
| T+158:58:35 | Kerbin | 59.63 Mm | 341 m/s | 3.41 t | 855 kg | 0% |  |
| T+159:14:35 | Kerbin | 59.78 Mm | 341 m/s | 3.41 t | 855 kg | 0% |  |
| T+159:30:35 | Kerbin | 59.93 Mm | 340 m/s | 3.41 t | 855 kg | 0% |  |
| T+159:46:35 | Kerbin | 60.07 Mm | 340 m/s | 3.41 t | 855 kg | 0% |  |
| T+160:02:35 | Kerbin | 60.22 Mm | 339 m/s | 3.41 t | 855 kg | 0% |  |
| T+160:18:35 | Kerbin | 60.37 Mm | 339 m/s | 3.41 t | 855 kg | 0% |  |
| T+160:34:35 | Kerbin | 60.52 Mm | 339 m/s | 3.41 t | 855 kg | 0% |  |
| T+160:50:35 | Kerbin | 60.67 Mm | 338 m/s | 3.41 t | 855 kg | 0% |  |
| T+161:06:35 | Kerbin | 60.82 Mm | 338 m/s | 3.41 t | 855 kg | 0% |  |
| T+161:22:35 | Kerbin | 60.96 Mm | 337 m/s | 3.41 t | 855 kg | 0% |  |
| T+161:38:35 | Kerbin | 61.12 Mm | 337 m/s | 3.41 t | 855 kg | 0% |  |
| T+161:54:35 | Kerbin | 61.27 Mm | 336 m/s | 3.41 t | 855 kg | 0% |  |
| T+162:10:35 | Kerbin | 61.42 Mm | 336 m/s | 3.41 t | 855 kg | 0% |  |
| T+162:26:35 | Kerbin | 61.57 Mm | 336 m/s | 3.41 t | 855 kg | 0% |  |
| T+162:42:35 | Kerbin | 61.72 Mm | 335 m/s | 3.41 t | 855 kg | 0% |  |
| T+162:58:35 | Kerbin | 61.87 Mm | 335 m/s | 3.41 t | 855 kg | 0% |  |
| T+163:14:35 | Kerbin | 62.03 Mm | 334 m/s | 3.41 t | 855 kg | 0% |  |
| T+163:30:35 | Kerbin | 62.18 Mm | 334 m/s | 3.41 t | 855 kg | 0% |  |
| T+163:46:35 | Kerbin | 62.33 Mm | 334 m/s | 3.41 t | 855 kg | 0% |  |
| T+164:02:35 | Kerbin | 62.49 Mm | 333 m/s | 3.41 t | 855 kg | 0% |  |
| T+164:18:35 | Kerbin | 62.64 Mm | 333 m/s | 3.41 t | 855 kg | 0% |  |
| T+164:34:35 | Kerbin | 62.80 Mm | 332 m/s | 3.41 t | 855 kg | 0% |  |
| T+164:50:35 | Kerbin | 62.96 Mm | 332 m/s | 3.41 t | 855 kg | 0% |  |
| T+165:06:35 | Kerbin | 63.11 Mm | 332 m/s | 3.41 t | 855 kg | 0% |  |
| T+165:22:35 | Kerbin | 63.27 Mm | 331 m/s | 3.41 t | 855 kg | 0% |  |
| T+165:38:35 | Kerbin | 63.42 Mm | 331 m/s | 3.41 t | 855 kg | 0% |  |
| T+165:54:35 | Kerbin | 63.58 Mm | 330 m/s | 3.41 t | 855 kg | 0% |  |
| T+166:10:35 | Kerbin | 63.74 Mm | 330 m/s | 3.41 t | 855 kg | 0% |  |
| T+166:26:35 | Kerbin | 63.90 Mm | 329 m/s | 3.41 t | 855 kg | 0% |  |
| T+166:42:35 | Kerbin | 64.06 Mm | 329 m/s | 3.41 t | 855 kg | 0% |  |
| T+166:58:35 | Kerbin | 64.22 Mm | 329 m/s | 3.41 t | 855 kg | 0% |  |
| T+167:14:35 | Kerbin | 64.37 Mm | 328 m/s | 3.41 t | 855 kg | 0% |  |
| T+167:30:35 | Kerbin | 64.53 Mm | 328 m/s | 3.41 t | 855 kg | 0% |  |
| T+167:46:35 | Kerbin | 64.69 Mm | 327 m/s | 3.41 t | 855 kg | 0% |  |
| T+168:02:35 | Kerbin | 64.85 Mm | 327 m/s | 3.41 t | 855 kg | 0% |  |
| T+168:18:35 | Kerbin | 65.01 Mm | 327 m/s | 3.41 t | 855 kg | 0% |  |
| T+168:34:35 | Kerbin | 65.18 Mm | 326 m/s | 3.41 t | 855 kg | 0% |  |
| T+168:50:35 | Kerbin | 65.34 Mm | 326 m/s | 3.41 t | 855 kg | 0% |  |
| T+169:06:35 | Kerbin | 65.50 Mm | 325 m/s | 3.41 t | 855 kg | 0% |  |
| T+169:22:35 | Kerbin | 65.66 Mm | 325 m/s | 3.41 t | 855 kg | 0% |  |
| T+169:38:35 | Kerbin | 65.82 Mm | 325 m/s | 3.41 t | 855 kg | 0% |  |
| T+169:54:35 | Kerbin | 65.99 Mm | 324 m/s | 3.41 t | 855 kg | 0% |  |
| T+170:10:35 | Kerbin | 66.15 Mm | 324 m/s | 3.41 t | 855 kg | 0% |  |
| T+170:26:35 | Kerbin | 66.31 Mm | 323 m/s | 3.41 t | 855 kg | 0% |  |
| T+170:42:35 | Kerbin | 66.48 Mm | 323 m/s | 3.41 t | 855 kg | 0% |  |
| T+170:58:35 | Kerbin | 66.64 Mm | 323 m/s | 3.41 t | 855 kg | 0% |  |
| T+171:14:35 | Kerbin | 66.80 Mm | 322 m/s | 3.41 t | 855 kg | 0% |  |
| T+171:30:35 | Kerbin | 66.97 Mm | 322 m/s | 3.41 t | 855 kg | 0% |  |
| T+171:46:35 | Kerbin | 67.13 Mm | 321 m/s | 3.41 t | 855 kg | 0% |  |
| T+172:02:35 | Kerbin | 67.30 Mm | 321 m/s | 3.41 t | 855 kg | 0% |  |
| T+172:18:35 | Kerbin | 67.46 Mm | 321 m/s | 3.41 t | 855 kg | 0% |  |
| T+172:34:35 | Kerbin | 67.63 Mm | 320 m/s | 3.41 t | 855 kg | 0% |  |
| T+172:50:35 | Kerbin | 67.80 Mm | 320 m/s | 3.41 t | 855 kg | 0% |  |
| T+173:06:35 | Kerbin | 67.96 Mm | 319 m/s | 3.41 t | 855 kg | 0% |  |
| T+173:22:35 | Kerbin | 68.13 Mm | 319 m/s | 3.41 t | 855 kg | 0% |  |
| T+173:38:35 | Kerbin | 68.30 Mm | 319 m/s | 3.41 t | 855 kg | 0% |  |
| T+173:54:35 | Kerbin | 68.46 Mm | 318 m/s | 3.41 t | 855 kg | 0% |  |
| T+174:10:35 | Kerbin | 68.63 Mm | 318 m/s | 3.41 t | 855 kg | 0% |  |
| T+174:26:35 | Kerbin | 68.80 Mm | 318 m/s | 3.41 t | 855 kg | 0% |  |
| T+174:42:35 | Kerbin | 68.97 Mm | 317 m/s | 3.41 t | 855 kg | 0% |  |
| T+174:58:35 | Kerbin | 69.13 Mm | 317 m/s | 3.41 t | 855 kg | 0% |  |
| T+175:14:35 | Kerbin | 69.30 Mm | 316 m/s | 3.41 t | 855 kg | 0% |  |
| T+175:30:35 | Kerbin | 69.47 Mm | 316 m/s | 3.41 t | 855 kg | 0% |  |
| T+175:46:35 | Kerbin | 69.64 Mm | 316 m/s | 3.41 t | 855 kg | 0% |  |
| T+176:02:35 | Kerbin | 69.81 Mm | 315 m/s | 3.41 t | 855 kg | 0% |  |
| T+176:18:35 | Kerbin | 69.98 Mm | 315 m/s | 3.41 t | 855 kg | 0% |  |
| T+176:34:35 | Kerbin | 70.15 Mm | 314 m/s | 3.41 t | 855 kg | 0% |  |
| T+176:50:35 | Kerbin | 70.32 Mm | 314 m/s | 3.41 t | 855 kg | 0% |  |
| T+177:06:35 | Kerbin | 70.49 Mm | 314 m/s | 3.41 t | 855 kg | 0% |  |
| T+177:22:35 | Kerbin | 70.66 Mm | 313 m/s | 3.41 t | 855 kg | 0% |  |
| T+177:38:35 | Kerbin | 70.83 Mm | 313 m/s | 3.41 t | 855 kg | 0% |  |
| T+177:54:35 | Kerbin | 71.00 Mm | 313 m/s | 3.41 t | 855 kg | 0% |  |
| T+178:10:35 | Kerbin | 71.17 Mm | 312 m/s | 3.41 t | 855 kg | 0% |  |
| T+178:26:35 | Kerbin | 71.34 Mm | 312 m/s | 3.41 t | 855 kg | 0% |  |
| T+178:42:35 | Kerbin | 71.51 Mm | 311 m/s | 3.41 t | 855 kg | 0% |  |
| T+178:58:35 | Kerbin | 71.68 Mm | 311 m/s | 3.41 t | 855 kg | 0% |  |
| T+179:14:35 | Kerbin | 71.86 Mm | 311 m/s | 3.41 t | 855 kg | 0% |  |
| T+179:30:35 | Kerbin | 72.03 Mm | 310 m/s | 3.41 t | 855 kg | 0% |  |
| T+179:46:35 | Kerbin | 72.20 Mm | 310 m/s | 3.41 t | 855 kg | 0% |  |
| T+180:02:35 | Kerbin | 72.37 Mm | 310 m/s | 3.41 t | 855 kg | 0% |  |
| T+180:18:35 | Kerbin | 72.54 Mm | 309 m/s | 3.41 t | 855 kg | 0% |  |
| T+180:34:35 | Kerbin | 72.72 Mm | 309 m/s | 3.41 t | 855 kg | 0% |  |
| T+180:50:35 | Kerbin | 72.89 Mm | 308 m/s | 3.41 t | 855 kg | 0% |  |
| T+181:06:35 | Kerbin | 73.06 Mm | 308 m/s | 3.41 t | 855 kg | 0% |  |
| T+181:22:35 | Kerbin | 73.24 Mm | 308 m/s | 3.41 t | 855 kg | 0% |  |
| T+181:38:35 | Kerbin | 73.41 Mm | 307 m/s | 3.41 t | 855 kg | 0% |  |
| T+181:54:35 | Kerbin | 73.58 Mm | 307 m/s | 3.41 t | 855 kg | 0% |  |
| T+182:10:35 | Kerbin | 73.76 Mm | 307 m/s | 3.41 t | 855 kg | 0% |  |
| T+182:26:35 | Kerbin | 73.93 Mm | 306 m/s | 3.41 t | 855 kg | 0% |  |
| T+182:42:35 | Kerbin | 74.11 Mm | 306 m/s | 3.41 t | 855 kg | 0% |  |
| T+182:58:35 | Kerbin | 74.28 Mm | 306 m/s | 3.41 t | 855 kg | 0% |  |
| T+183:14:35 | Kerbin | 74.45 Mm | 305 m/s | 3.41 t | 855 kg | 0% |  |
| T+183:30:35 | Kerbin | 74.63 Mm | 305 m/s | 3.41 t | 855 kg | 0% |  |
| T+183:46:35 | Kerbin | 74.80 Mm | 304 m/s | 3.41 t | 855 kg | 0% |  |
| T+184:02:35 | Kerbin | 74.98 Mm | 304 m/s | 3.41 t | 855 kg | 0% |  |
| T+184:18:35 | Kerbin | 75.15 Mm | 304 m/s | 3.41 t | 855 kg | 0% |  |
| T+184:34:35 | Kerbin | 75.33 Mm | 303 m/s | 3.41 t | 855 kg | 0% |  |
| T+184:50:35 | Kerbin | 75.50 Mm | 303 m/s | 3.41 t | 855 kg | 0% |  |
| T+185:06:35 | Kerbin | 75.68 Mm | 303 m/s | 3.41 t | 855 kg | 0% |  |
| T+185:22:35 | Kerbin | 75.86 Mm | 302 m/s | 3.41 t | 855 kg | 0% |  |
| T+185:38:35 | Kerbin | 76.03 Mm | 302 m/s | 3.41 t | 855 kg | 0% |  |
| T+185:54:35 | Kerbin | 76.21 Mm | 302 m/s | 3.41 t | 855 kg | 0% |  |
| T+186:10:35 | Kerbin | 76.38 Mm | 301 m/s | 3.41 t | 855 kg | 0% |  |
| T+186:26:35 | Kerbin | 76.56 Mm | 301 m/s | 3.41 t | 855 kg | 0% |  |
| T+186:42:35 | Kerbin | 76.74 Mm | 301 m/s | 3.41 t | 855 kg | 0% |  |
| T+186:58:35 | Kerbin | 76.91 Mm | 300 m/s | 3.41 t | 855 kg | 0% |  |
| T+187:14:35 | Kerbin | 77.09 Mm | 300 m/s | 3.41 t | 855 kg | 0% |  |
| T+187:30:35 | Kerbin | 77.27 Mm | 300 m/s | 3.41 t | 855 kg | 0% |  |
| T+187:46:35 | Kerbin | 77.44 Mm | 299 m/s | 3.41 t | 855 kg | 0% |  |
| T+188:02:35 | Kerbin | 77.62 Mm | 299 m/s | 3.41 t | 855 kg | 0% |  |
| T+188:18:35 | Kerbin | 77.80 Mm | 299 m/s | 3.41 t | 855 kg | 0% |  |
| T+188:34:35 | Kerbin | 77.97 Mm | 298 m/s | 3.41 t | 855 kg | 0% |  |
| T+188:50:35 | Kerbin | 78.15 Mm | 298 m/s | 3.41 t | 855 kg | 0% |  |
| T+189:06:35 | Kerbin | 78.33 Mm | 298 m/s | 3.41 t | 855 kg | 0% |  |
| T+189:22:35 | Kerbin | 78.51 Mm | 297 m/s | 3.41 t | 855 kg | 0% |  |
| T+189:38:35 | Kerbin | 78.68 Mm | 297 m/s | 3.41 t | 855 kg | 0% |  |
| T+189:54:35 | Kerbin | 78.86 Mm | 297 m/s | 3.41 t | 855 kg | 0% |  |
| T+190:10:35 | Kerbin | 79.04 Mm | 296 m/s | 3.41 t | 855 kg | 0% |  |
| T+190:26:35 | Kerbin | 79.22 Mm | 296 m/s | 3.41 t | 855 kg | 0% |  |
| T+190:42:35 | Kerbin | 79.40 Mm | 296 m/s | 3.41 t | 855 kg | 0% |  |
| T+190:58:35 | Kerbin | 79.57 Mm | 295 m/s | 3.41 t | 855 kg | 0% |  |
| T+191:14:35 | Kerbin | 79.75 Mm | 295 m/s | 3.41 t | 855 kg | 0% |  |
| T+191:30:35 | Kerbin | 79.93 Mm | 295 m/s | 3.41 t | 855 kg | 0% |  |
| T+191:46:35 | Kerbin | 80.11 Mm | 294 m/s | 3.41 t | 855 kg | 0% |  |
| T+192:02:35 | Kerbin | 80.29 Mm | 294 m/s | 3.41 t | 855 kg | 0% |  |
| T+192:18:35 | Kerbin | 80.47 Mm | 294 m/s | 3.41 t | 855 kg | 0% |  |
| T+192:34:35 | Kerbin | 80.65 Mm | 293 m/s | 3.41 t | 855 kg | 0% |  |
| T+192:50:35 | Kerbin | 80.82 Mm | 293 m/s | 3.41 t | 855 kg | 0% |  |
| T+193:06:35 | Kerbin | 81.00 Mm | 293 m/s | 3.41 t | 855 kg | 0% |  |
| T+193:22:35 | Kerbin | 81.18 Mm | 292 m/s | 3.41 t | 855 kg | 0% |  |
| T+193:38:35 | Kerbin | 81.36 Mm | 292 m/s | 3.41 t | 855 kg | 0% |  |
| T+193:54:35 | Kerbin | 81.54 Mm | 292 m/s | 3.41 t | 855 kg | 0% |  |
| T+194:10:35 | Kerbin | 81.72 Mm | 291 m/s | 3.41 t | 855 kg | 0% |  |
| T+194:26:35 | Kerbin | 81.90 Mm | 291 m/s | 3.41 t | 855 kg | 0% |  |
| T+194:42:35 | Kerbin | 82.08 Mm | 291 m/s | 3.41 t | 855 kg | 0% |  |
| T+194:58:35 | Kerbin | 82.26 Mm | 290 m/s | 3.41 t | 855 kg | 0% |  |
| T+195:14:35 | Kerbin | 82.44 Mm | 290 m/s | 3.41 t | 855 kg | 0% |  |
| T+195:30:35 | Kerbin | 82.62 Mm | 290 m/s | 3.41 t | 855 kg | 0% |  |
| T+195:46:35 | Kerbin | 82.80 Mm | 289 m/s | 3.41 t | 855 kg | 0% |  |
| T+196:02:35 | Kerbin | 82.98 Mm | 289 m/s | 3.41 t | 855 kg | 0% |  |
| T+196:18:35 | Kerbin | 83.16 Mm | 289 m/s | 3.41 t | 855 kg | 0% |  |
| T+196:34:35 | Kerbin | 83.34 Mm | 288 m/s | 3.41 t | 855 kg | 0% |  |
| T+196:50:35 | Kerbin | 83.52 Mm | 288 m/s | 3.41 t | 855 kg | 0% |  |
| T+196:54:35 | Kerbol | 13358.05 Mm | 9519 m/s | 3.41 t | 855 kg | 0% | Kerbin SOI exit |
| T+197:10:35 | Kerbol | 13357.95 Mm | 9519 m/s | 3.41 t | 855 kg | 0% |  |
| T+197:26:35 | Kerbol | 13357.84 Mm | 9519 m/s | 3.41 t | 855 kg | 0% |  |
| T+197:42:35 | Kerbol | 13357.73 Mm | 9519 m/s | 3.41 t | 855 kg | 0% |  |
| T+197:58:35 | Kerbol | 13357.63 Mm | 9519 m/s | 3.41 t | 855 kg | 0% |  |
| T+198:14:35 | Kerbol | 13357.52 Mm | 9519 m/s | 3.41 t | 855 kg | 0% |  |
| T+198:30:35 | Kerbol | 13357.41 Mm | 9519 m/s | 3.41 t | 855 kg | 0% |  |
| T+198:46:35 | Kerbol | 13357.31 Mm | 9519 m/s | 3.41 t | 855 kg | 0% |  |
| T+199:02:35 | Kerbol | 13357.20 Mm | 9519 m/s | 3.41 t | 855 kg | 0% |  |
| T+199:18:35 | Kerbol | 13357.10 Mm | 9519 m/s | 3.41 t | 855 kg | 0% |  |
| T+199:34:35 | Kerbol | 13356.99 Mm | 9520 m/s | 3.41 t | 855 kg | 0% |  |
| T+199:50:35 | Kerbol | 13356.89 Mm | 9520 m/s | 3.41 t | 855 kg | 0% |  |
| T+200:06:35 | Kerbol | 13356.79 Mm | 9520 m/s | 3.41 t | 855 kg | 0% |  |
| T+200:22:35 | Kerbol | 13356.68 Mm | 9520 m/s | 3.41 t | 855 kg | 0% |  |
| T+200:38:35 | Kerbol | 13356.58 Mm | 9520 m/s | 3.41 t | 855 kg | 0% |  |
| T+200:54:35 | Kerbol | 13356.48 Mm | 9520 m/s | 3.41 t | 855 kg | 0% |  |
| T+201:10:35 | Kerbol | 13356.37 Mm | 9520 m/s | 3.41 t | 855 kg | 0% |  |
| T+201:26:35 | Kerbol | 13356.27 Mm | 9520 m/s | 3.41 t | 855 kg | 0% |  |
| T+201:42:35 | Kerbol | 13356.17 Mm | 9520 m/s | 3.41 t | 855 kg | 0% |  |
| T+201:58:35 | Kerbol | 13356.07 Mm | 9520 m/s | 3.41 t | 855 kg | 0% |  |
| T+202:14:35 | Kerbol | 13355.96 Mm | 9520 m/s | 3.41 t | 855 kg | 0% |  |
| T+202:30:35 | Kerbol | 13355.86 Mm | 9520 m/s | 3.41 t | 855 kg | 0% |  |
| T+202:46:35 | Kerbol | 13355.76 Mm | 9520 m/s | 3.41 t | 855 kg | 0% |  |
| T+203:02:35 | Kerbol | 13355.66 Mm | 9520 m/s | 3.41 t | 855 kg | 0% |  |
| T+203:18:35 | Kerbol | 13355.56 Mm | 9520 m/s | 3.41 t | 855 kg | 0% |  |
| T+203:34:35 | Kerbol | 13355.46 Mm | 9521 m/s | 3.41 t | 855 kg | 0% |  |
| T+203:50:35 | Kerbol | 13355.36 Mm | 9521 m/s | 3.41 t | 855 kg | 0% |  |
| T+204:06:35 | Kerbol | 13355.26 Mm | 9521 m/s | 3.41 t | 855 kg | 0% |  |
| T+204:22:35 | Kerbol | 13355.16 Mm | 9521 m/s | 3.41 t | 855 kg | 0% |  |
| T+204:38:35 | Kerbol | 13355.07 Mm | 9521 m/s | 3.41 t | 855 kg | 0% |  |
| T+204:54:35 | Kerbol | 13354.97 Mm | 9521 m/s | 3.41 t | 855 kg | 0% |  |
| T+205:10:35 | Kerbol | 13354.87 Mm | 9521 m/s | 3.41 t | 855 kg | 0% |  |
| T+205:26:35 | Kerbol | 13354.77 Mm | 9521 m/s | 3.41 t | 855 kg | 0% |  |
| T+205:42:35 | Kerbol | 13354.67 Mm | 9521 m/s | 3.41 t | 855 kg | 0% |  |
| T+205:58:35 | Kerbol | 13354.58 Mm | 9521 m/s | 3.41 t | 855 kg | 0% |  |
| T+206:14:35 | Kerbol | 13354.48 Mm | 9521 m/s | 3.41 t | 855 kg | 0% |  |
| T+206:30:35 | Kerbol | 13354.38 Mm | 9521 m/s | 3.41 t | 855 kg | 0% |  |
| T+206:46:35 | Kerbol | 13354.29 Mm | 9521 m/s | 3.41 t | 855 kg | 0% |  |
| T+207:02:35 | Kerbol | 13354.19 Mm | 9521 m/s | 3.41 t | 855 kg | 0% |  |
| T+207:18:35 | Kerbol | 13354.09 Mm | 9521 m/s | 3.41 t | 855 kg | 0% |  |
| T+207:34:35 | Kerbol | 13354.00 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+207:50:35 | Kerbol | 13353.90 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+208:06:35 | Kerbol | 13353.81 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+208:22:35 | Kerbol | 13353.72 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+208:38:35 | Kerbol | 13353.62 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+208:54:35 | Kerbol | 13353.53 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+209:10:35 | Kerbol | 13353.43 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+209:26:35 | Kerbol | 13353.34 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+209:42:35 | Kerbol | 13353.25 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+209:58:35 | Kerbol | 13353.16 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+210:14:35 | Kerbol | 13353.06 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+210:30:35 | Kerbol | 13352.97 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+210:46:35 | Kerbol | 13352.88 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+211:02:35 | Kerbol | 13352.79 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+211:18:35 | Kerbol | 13352.70 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+211:34:35 | Kerbol | 13352.61 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+211:50:35 | Kerbol | 13352.52 Mm | 9522 m/s | 3.41 t | 855 kg | 0% |  |
| T+212:06:35 | Kerbol | 13352.43 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+212:22:35 | Kerbol | 13352.34 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+212:38:35 | Kerbol | 13352.25 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+212:54:35 | Kerbol | 13352.16 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+213:10:35 | Kerbol | 13352.07 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+213:26:35 | Kerbol | 13351.98 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+213:42:35 | Kerbol | 13351.89 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+213:58:35 | Kerbol | 13351.80 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+214:14:35 | Kerbol | 13351.72 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+214:30:35 | Kerbol | 13351.63 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+214:46:35 | Kerbol | 13351.54 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+215:02:35 | Kerbol | 13351.45 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+215:18:35 | Kerbol | 13351.37 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+215:34:35 | Kerbol | 13351.28 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+215:50:35 | Kerbol | 13351.20 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+216:06:35 | Kerbol | 13351.11 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+216:22:35 | Kerbol | 13351.03 Mm | 9523 m/s | 3.41 t | 855 kg | 0% |  |
| T+216:38:35 | Kerbol | 13350.94 Mm | 9524 m/s | 3.41 t | 855 kg | 0% |  |
| T+216:54:35 | Kerbol | 13350.86 Mm | 9524 m/s | 3.41 t | 855 kg | 0% |  |
| T+217:10:35 | Kerbol | 13350.77 Mm | 9524 m/s | 3.41 t | 855 kg | 0% |  |
| T+217:26:35 | Kerbol | 13350.69 Mm | 9524 m/s | 3.41 t | 855 kg | 0% |  |
| T+217:42:35 | Kerbol | 13350.60 Mm | 9524 m/s | 3.41 t | 855 kg | 0% |  |
| T+217:58:35 | Kerbol | 13350.52 Mm | 9524 m/s | 3.41 t | 855 kg | 0% |  |
| T+218:14:35 | Kerbol | 13350.44 Mm | 9524 m/s | 3.41 t | 855 kg | 0% |  |
| T+218:30:35 | Kerbol | 13350.36 Mm | 9524 m/s | 3.41 t | 855 kg | 0% |  |
| T+218:46:35 | Kerbol | 13350.27 Mm | 9524 m/s | 3.41 t | 855 kg | 0% |  |
| T+219:02:35 | Kerbol | 13350.19 Mm | 9524 m/s | 3.41 t | 855 kg | 0% |  |
| T+219:07:55 | Kerbol | 13350.16 Mm | 9524 m/s | 3.41 t | 855 kg | 0% | solar orbit |
