// Stock craft designs. Stack index 0 = top.

const DUNA_HAULER_LIGHT = {
  // Sparrow lander (tank-l + tank-m). Raven transfer stays in orbit.
  // Do NOT land on Raven/Titan. Never light Sparrow for TDI / mid-course / capture.
  // Booster recovery: LT-25 legs-xl on last XL (host 23) with the fins/SRBs.
  //
  // Default pad stack: 4× tank-l + tank-m Raven, 8× XL Titan, 6 SRB on last XL.
  // Catalog was Mun-scale: Falcon (Isp 310) after LKO had ~5231 kg transfer;
  // TDI transfer-only topped at v∞ 838.84 vs Hohmann 918.35, Falcon dry,
  // coast CA 316718 km still kerbol. Missing a vacuum transfer engine, not tanks.
  // Raven (Isp 360 / 120 kN / 900 kg) is the kick stage. Hopeless at sea level.
  //
  // 8 XL + 6 SRB Raven (TWR 1.205) lofts to Ap 83. Falcon 215 kN circularized
  // that handoff (72×90). Raven 120 kN cannot raise Pe from −560×83 before
  // atmo (crash MET 550, Sparrow off). Extra XL/SRB burned the added Titan
  // fuel in a 2 km turn (9 XL + 7 SRB pancake MET 125 TWR 1.174; 9 XL + 8
  // SRB TWR 1.236 same low turn then Raven crash). Early circularize (Ap 60
  // / 42) flattened the 8 XL loft. Circularize now lofts Ap toward 140 km
  // for Raven so there is time to raise Pe. Not a 115 km / prograde-only
  // profile, not a super engine, not extra transfer tanks.
  //
  // Flown 2026-08-16 Raven 4-tank 8 XL / 6 SRB, 83 km turn + circularize loft
  // Ap 140 km (Raven 120 kN cannot raise Pe from −560×83 before atmo):
  // LKO 72×144 km, fuel 12987 kg, transfer 6987 kg, Raven lit, Sparrow off.
  // TDI v∞ 861 vs Hohmann 918, Raven leftover 2148. Coast Duna Pe −171 km.
  // Capture −248×319, Raven dry. Jettison. Lander-only touchdown 5849 kg.
  // Rise (old 55/48 cut) 48×54 km in atmo. Rise fix: loft Ap 80 km, Pe 58 km,
  // stay vertical to 18 km, cut above 42 km. Re-flew from land snap:
  // 59×130 km / 2590 kg. Home: inward ejection + lander mid-course.
  // Kerbin encounter 572×∞ km / 1328 kg. Not captured, not landed.
  //
  // Re-flown 2026-08-16 Falcon 4-tank 8 XL / 6 SRB with 83 km / turnStart 180:
  // LKO 72×90 km, fuel 11231 kg, transfer 5231 kg, Falcon lit, Sparrow off.
  //
  // Failed thicker Falcon tries (do not leave as default):
  // 5×L+M, 8 XL, 6 SRB: pad TWR 1.176, Pe 62×4188, Falcon dry (115 km / prograde-only).
  // 5×L+M, 9 XL, 6 SRB: pad TWR 1.084 (<1.15), crashed MET 82 s / ~0.5 km, Titan lit.
  // 10 XL + 6 SRB pad TWR 1.005 — not flown.
  stack: [
    'pod-mk1', 'chute', 'heat-shield', 'decoupler-s', 'tank-l', 'tank-m', 'eng-sparrow',
    'decoupler-s', 'tank-l', 'tank-l', 'tank-l', 'tank-l', 'tank-m', 'eng-raven',
    'decoupler-l', 'adapter',
    'tank-xl', 'tank-xl', 'tank-xl', 'tank-xl',
    'tank-xl', 'tank-xl', 'tank-xl', 'tank-xl',
    'eng-titan',
  ],
  radials: [
    { part: 'legs', sym: 1, host: 5 },
    { part: 'legs-xl', sym: 1, host: 23 },
    { part: 'fins', sym: 1, host: 23 },
    { part: 'srb', sym: 6, host: 23 },
    { part: 'panel-oxstat', sym: 2, host: 0, attachAngle: Math.PI / 2 },
    { part: 'batt-z100', sym: 1, host: 0, attachAngle: Math.PI },
    { part: 'batt-z100', sym: 1, host: 23, attachAngle: Math.PI / 4 },
  ],
};

export const STOCK = {
  'Suborbital Hopper': {
    stack: ['chute', 'pod-mk1', 'heat-shield', 'decoupler-s', 'tank-m', 'eng-falcon'],
    radials: [{ part: 'fins', sym: 1, host: 5 }],
  },
  'Mun Express': {
    // Short lander: tank-m + tank-s + Kestrel. Transfer is staged away in
    // low Mun orbit BEFORE descent. One LT-2 ring on the lander tank-s
    // (host 5). After decouple: 3 the capsule is pod+chute+shield and
    // lands on the chute (home was ~1.2 m/s; impact without legs is 6 m/s).
    // Do NOT land on the Sparrow. Booster recovery: LT-25 (legs-xl) on the
    // last XL (host 16). One lander-scale ring on the lander, one LT-25
    // on the booster. Same safeSpeed 12.
    stack: [
      'pod-mk1', 'chute', 'heat-shield', 'decoupler-s', 'tank-m', 'tank-s', 'eng-kestrel',
      'decoupler-s', 'tank-l', 'tank-l', 'tank-m', 'eng-sparrow',
      'decoupler-l', 'adapter', 'tank-xl', 'tank-xl', 'tank-xl', 'eng-titan',
    ],
    radials: [
      { part: 'legs', sym: 1, host: 5 },
      { part: 'legs-xl', sym: 1, host: 16 },
      { part: 'fins', sym: 1, host: 16 },
      { part: 'panel-oxstat', sym: 2, host: 0, attachAngle: Math.PI / 2 },
      { part: 'batt-z100', sym: 1, host: 0, attachAngle: Math.PI },
      { part: 'batt-z100', sym: 1, host: 16, attachAngle: Math.PI / 4 },
    ],
  },
  'Mun Reuser': {
    // Recoverable Mun land-and-return. Proven 5×L+M Falcon:
    // LKO 72×91, recover 2.77 km / 2.50 m/s (not 上垫), TLI leftover 143 kg,
    // capture died transfer-dry with lander 4500 kg unused.
    // 6L / 7L / 4-stage / 5L+2M all failed ascent. Do not add tanks.
    // Capture may finish on Kestrel if Falcon is dry. Do NOT land on Falcon.
    // One LT-2 ring on the lander tank-s (host 5). After decouple: 3 the
    // capsule is pod+chute+shield and lands on the chute. LT-25 on last XL
    // (host 19). One lander-scale ring on the lander, one LT-25 on the booster.
    stack: [
      'pod-mk1', 'chute', 'heat-shield', 'decoupler-s', 'tank-l', 'tank-s', 'eng-kestrel',
      'decoupler-s', 'tank-l', 'tank-l', 'tank-l', 'tank-l', 'tank-l', 'tank-m', 'eng-falcon',
      'decoupler-l', 'adapter', 'tank-xl', 'tank-xl', 'tank-xl', 'eng-titan',
    ],
    radials: [
      { part: 'legs', sym: 1, host: 5 },
      { part: 'legs-xl', sym: 1, host: 19 },
      { part: 'fins', sym: 1, host: 19 },
      { part: 'srb', sym: 2, host: 19 },
      { part: 'panel-oxstat', sym: 2, host: 0, attachAngle: Math.PI / 2 },
      { part: 'batt-z100', sym: 1, host: 0, attachAngle: Math.PI },
      { part: 'batt-z100', sym: 1, host: 19, attachAngle: Math.PI / 4 },
    ],
  },
  'Duna Hauler Light': DUNA_HAULER_LIGHT,
  'Duna Hauler': {
    stack: [...DUNA_HAULER_LIGHT.stack],
    radials: DUNA_HAULER_LIGHT.radials.map((r) => ({ ...r })),
  },
};
