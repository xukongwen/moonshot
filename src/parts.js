// Part catalog. Masses in kg, lengths in m, thrust in N, sizes are stack diameters.
// dragArea is an effective Cd*A contribution in m^2.

import { G0 } from './constants.js';
import { t } from './i18n.js';

export const PARTS = {
  // ---- Pods ----
  'pod-mk1': {
    name: 'Mk1 Command Pod', category: 'Pods', size: 1.25, mass: 800, length: 1.1,
    pod: { torque: 6000, ecCap: 50 }, dragArea: 0.6, maxTemp: 2200, shape: 'pod',
    desc: 'One brave pilot. Built-in reaction wheels and a reentry-rated hull.',
  },
  'pod-mk2': {
    name: 'Mk2 Command Module', category: 'Pods', size: 2.5, mass: 2700, length: 1.6,
    pod: { torque: 16000, ecCap: 150 }, dragArea: 1.8, maxTemp: 2200, shape: 'pod',
    desc: 'Roomy three-seater. Stronger reaction wheels.',
  },

  // ---- Fuel tanks ----
  'tank-s': {
    name: 'FT-100 Tank', category: 'Tanks', size: 1.25, mass: 60, fuel: 500, length: 0.9,
    dragArea: 0.4, maxTemp: 1200, shape: 'tank',
    desc: 'A small can of rocket juice.',
  },
  'tank-m': {
    name: 'FT-400 Tank', category: 'Tanks', size: 1.25, mass: 250, fuel: 2000, length: 1.9,
    dragArea: 0.5, maxTemp: 1200, shape: 'tank',
    desc: 'The dependable mid-size tank.',
  },
  'tank-l': {
    name: 'FT-800 Tank', category: 'Tanks', size: 1.25, mass: 500, fuel: 4000, length: 3.4,
    dragArea: 0.6, maxTemp: 1200, shape: 'tank',
    desc: 'Tall boy. Most of your rocket is this.',
  },
  'tank-xl': {
    name: 'FT-3200 Tank', category: 'Tanks', size: 2.5, mass: 2000, fuel: 16000, length: 4.4,
    dragArea: 1.6, maxTemp: 1200, shape: 'tank',
    desc: 'Heavy-lift propellant. Mind the pad.',
  },

  // ---- Engines ----
  'eng-kestrel': {
    name: 'K-1 "Kestrel"', category: 'Engines', size: 1.25, mass: 140, length: 0.6,
    engine: { thrustVac: 24_000, ispVac: 320, ispSL: 95, gimbal: 2, throttleable: true },
    dragArea: 0.3, maxTemp: 2000, shape: 'engine',
    desc: 'Tiny vacuum engine for landers and final stages.',
  },
  'eng-sparrow': {
    name: 'S-7 "Sparrow"', category: 'Engines', size: 1.25, mass: 500, length: 1.0,
    engine: { thrustVac: 60_000, ispVac: 345, ispSL: 85, gimbal: 3, throttleable: true },
    dragArea: 0.3, maxTemp: 2000, shape: 'engine',
    desc: 'Excellent vacuum performance. Hopeless at sea level.',
  },
  'eng-falcon': {
    name: 'F-30 "Falcon"', category: 'Engines', size: 1.25, mass: 1500, length: 1.5,
    engine: { thrustVac: 215_000, ispVac: 310, ispSL: 265, gimbal: 3, throttleable: true },
    dragArea: 0.4, maxTemp: 2200, shape: 'engine',
    desc: 'Gimballed workhorse lifter engine.',
  },
  'eng-raven': {
    name: 'R-40 "Raven"', category: 'Engines', size: 1.25, mass: 900, length: 1.3,
    engine: { thrustVac: 120_000, ispVac: 360, ispSL: 90, gimbal: 3, throttleable: true },
    dragArea: 0.35, maxTemp: 2000, shape: 'engine',
    desc: 'Vacuum transfer / kick stage. Hopeless at sea level.',
  },
  'eng-titan': {
    name: 'T-900 "Titan"', category: 'Engines', size: 2.5, mass: 6000, length: 2.4,
    engine: { thrustVac: 1_400_000, ispVac: 305, ispSL: 280, gimbal: 2, throttleable: true },
    dragArea: 1.2, maxTemp: 2200, shape: 'engine',
    desc: 'When the rocket absolutely must leave the ground.',
  },
  'srb': {
    name: 'SRB-30 Booster', category: 'Engines', size: 1.0, mass: 750, fuel: 3500, length: 4.2,
    engine: { thrustVac: 220_000, ispVac: 195, ispSL: 170, gimbal: 0, throttleable: false, srb: true },
    radial: true, radialDecouples: true, dragArea: 0.7, maxTemp: 2200, shape: 'srb',
    desc: 'Solid fuel. Lights once, burns ~30 s, cannot be shut down. Radial only.',
  },

  // ---- Coupling ----
  'decoupler-s': {
    name: 'TD-12 Decoupler', category: 'Coupling', size: 1.25, mass: 50, length: 0.3,
    decoupler: true, dragArea: 0.1, maxTemp: 1400, shape: 'decoupler',
    desc: 'Stack separator. Everything below it is jettisoned.',
  },
  'decoupler-l': {
    name: 'TD-25 Decoupler', category: 'Coupling', size: 2.5, mass: 180, length: 0.35,
    decoupler: true, dragArea: 0.3, maxTemp: 1400, shape: 'decoupler',
    desc: 'Big stack separator.',
  },
  'adapter': {
    name: 'C-125 Adapter', category: 'Coupling', size: 2.5, mass: 200, length: 1.0,
    dragArea: 0.5, maxTemp: 1400, shape: 'adapter',
    desc: 'Tapers a 2.5 m stack to 1.25 m.',
  },
  'dock-port-s': {
    name: 'DP-12 Docking Port', category: 'Coupling', size: 1.25, mass: 50, length: 0.35,
    dock: { size: 1.25 }, dragArea: 0.1, maxTemp: 1400, shape: 'decoupler',
    desc: '1.25 m stack docking port. Same-size capture only.',
  },

  // ---- RCS ----
  'rcs-block': {
    name: 'RV-2 RCS Block', category: 'Utility', size: 1.25, mass: 80, length: 0.4,
    rcs: { thrust: 2000 }, radial: true, dragArea: 0.15, maxTemp: 1400, shape: 'rcs',
    desc: '2 kN translation thruster. v1 uses no monoprop — the part must be on the vessel.',
  },

  // ---- Aero & utility ----
  'nose-cone': {
    name: 'Aerodynamic Nose Cone', category: 'Aero', size: 1.25, mass: 50, length: 0.8,
    dragArea: 0.05, noseBonus: 0.5, maxTemp: 1600, shape: 'nose',
    desc: 'Pointy end up. Reduces total drag.',
  },
  'fins': {
    name: 'Stabilizer Fins ×4', category: 'Aero', size: 1.25, mass: 80, length: 0.9,
    fins: { area: 4.8 }, radial: true, dragArea: 0.3, maxTemp: 1400, shape: 'fins',
    desc: 'Keeps the pointy end forward in atmosphere. Radial attach.',
  },
  'chute': {
    name: 'Mk2 Parachute', category: 'Utility', size: 1.25, mass: 100, length: 0.35,
    chute: { dragArea: 280 }, dragArea: 0.15, maxTemp: 2000, shape: 'chute',
    desc: 'Deploys below 2.5 km and under 300 m/s. Packed, it survives being mid-stack on reentry; do not put it windward.',
  },
  'legs': {
    name: 'LT-2 Landing Legs ×4', category: 'Utility', size: 1.25, mass: 150, length: 1.6,
    legs: { safeSpeed: 12 }, radial: true, dragArea: 0.2, maxTemp: 1400, shape: 'legs',
    desc: 'Touch down at up to 12 m/s. Radial attach, toggle with G.',
  },
  'legs-xl': {
    name: 'LT-25 Heavy Landing Legs ×4', category: 'Utility', size: 2.5, mass: 500, length: 3.8,
    legs: { safeSpeed: 12 }, radial: true, dragArea: 0.45, maxTemp: 1400, shape: 'legs-xl',
    desc: 'Booster recovery legs for 2.5 m stacks. Radial attach, toggle with G. Same 12 m/s limit as LT-2.',
  },
  'heat-shield': {
    name: 'AB-1 Heat Shield', category: 'Utility', size: 1.25, mass: 300, length: 0.3,
    shield: { ablator: 200 }, dragArea: 0.7, maxTemp: 3400, shape: 'shield',
    desc: 'Ablative shield for reentry. Goes under the pod, blunt end first.',
  },
  'panel-oxstat': {
    name: 'OX-STAT Photovoltaic', category: 'Utility', size: 2.2, mass: 6, length: 0.6,
    panel: { ecPerS: 0.8 }, radial: true, dragArea: 0.08, maxTemp: 1400, shape: 'panel',
    desc: 'Static side-wing solar array (span out, not up the stack). 0.8 EC/s at Kerbin flux. No deploy.',
  },
  'batt-z100': {
    name: 'Z-100 Rechargeable Battery', category: 'Utility', size: 0.2, mass: 8, length: 0.2,
    ecCap: 100, radial: true, dragArea: 0.04, maxTemp: 1400, shape: 'battery',
    desc: '100 EC radial brick. No generation, no deploy.',
  },
  'sat-bus-s': {
    name: 'S-125 Sat Bus', category: 'Pods', size: 1.25, mass: 250, length: 0.80,
    probe: true, pod: { torque: 2500, ecCap: 50 }, dragArea: 0.5, maxTemp: 1400, shape: 'satbus',
    desc: 'Unmanned 1.25 m bus. Built-in wheels + 50 EC.',
  },
  'antenna-comm': {
    name: 'HG-5 Comm Dish', category: 'Utility', size: 0.7, mass: 30, length: 0.45,
    antenna: true, radial: true, dragArea: 0.12, maxTemp: 1400, shape: 'antenna',
    desc: 'Radial dish. Comms needs this (S3). No deploy.',
  },
  'cam-nadir': {
    name: 'Nadir Camera', category: 'Utility', size: 0.35, mass: 40, length: 0.28,
    camera: true, dragArea: 0.08, maxTemp: 1400, shape: 'camera',
    desc: 'Nadir camera. Photo needs this (S4).',
  },
};

export const CATEGORIES = ['Pods', 'Tanks', 'Engines', 'Coupling', 'Aero', 'Utility'];

export const RADIAL_PARTS = Object.keys(PARTS).filter((id) => PARTS[id].radial);

export function partWetMass(def) { return def.mass + (def.fuel ?? 0); }

export function engineMdot(def) {
  return def.engine.thrustVac / (def.engine.ispVac * G0);
}

/** Thrust at ambient pressure (atm, 1 = Kerbin sea level), fixed mass flow. */
export function engineThrust(def, pressureAtm) {
  const e = def.engine;
  const isp = e.ispVac + (e.ispSL - e.ispVac) * Math.min(1, pressureAtm);
  return engineMdot(def) * isp * G0;
}

export function partInfoHTML(def) {
  const rows = [
    `${t('part.mass')} ${(partWetMass(def) / 1000).toFixed(2)} t` + (def.fuel ? ` (${def.fuel} kg ${t('part.fuel')})` : ''),
    `${def.size} m · ${t('part.maxT')} ${def.maxTemp} K`,
  ];
  if (def.engine) {
    rows.push(`${t('part.thrust')} ${(def.engine.thrustVac / 1000).toFixed(0)} kN ${t('part.vac')}`);
    rows.push(`Isp ${def.engine.ispVac}s ${t('part.vac')} / ${def.engine.ispSL}s SL`);
  }
  const cap = def.pod?.ecCap ?? def.ecCap;
  if (cap) rows.push(`${cap} EC`);
  if (def.panel?.ecPerS) rows.push(`${def.panel.ecPerS} EC/s (Kerbin flux)`);
  return `<b>${def.name}</b><br>${rows.join('<br>')}<br><i>${def.desc}</i>`;
}
