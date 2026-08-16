// E3 probe: real pad / remnant EC on stock Express, Reuser, Hauler.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STOCK } from '../src/stock.js';
import { partIdOf } from '../src/vessel.js';
import { SimSession } from '../mcp/session.mjs';
import { stateFromKepler } from '../src/orbits.js';
import { physicsStep } from '../src/physics.js';
import {
  fillEC, ecCap, ecTelemetry, panelNormal, panelGen, sunVectorInertial, solarFlux, eclipsed,
} from '../src/power.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const OUT = join(ROOT, 'logs/e3-stock.json');

const SHIPS = ['Mun Express', 'Mun Reuser', 'Duna Hauler'];

function lastXlHost(stack) {
  let h = -1;
  stack.forEach((id, i) => { if (id === 'tank-xl') h = i; });
  return h;
}

function powerParts(st) {
  return st.parts
    .filter((p) => p.def.panel || (p.def.ecCap && !p.def.pod))
    .map((p) => ({
      id: partIdOf(p.def),
      host: p.stackIndex,
      attachAngle: p.attachAngle ?? 0,
      attachAngle_deg: ((p.attachAngle ?? 0) * 180) / Math.PI,
      sym: p.sym,
    }));
}

function dropBooster(session) {
  let guard = 0;
  while (session.st.parts.some((p) => /Titan/.test(p.def.name)) && guard++ < 10) {
    session.stage();
  }
}

function shipReport(name) {
  const design = STOCK[name];
  const session = new SimSession();
  session.newFlight(name);
  fillEC(session.st);
  const padCap = ecCap(session.st);
  const padEc = session.st.ec;
  const power = powerParts(session.st);
  dropBooster(session);
  const remnantCap = ecCap(session.st);
  const remnantEc = session.st.ec;
  const remnantPower = powerParts(session.st);
  const panelOnHost0 = remnantPower.some((p) => p.id === 'panel-oxstat' && p.host === 0);
  return {
    name,
    lastXlHost: lastXlHost(design.stack),
    legsXlHost: design.radials.find((r) => r.part === 'legs-xl')?.host ?? null,
    pad_ecCap: padCap,
    pad_ec: padEc,
    power_parts: power,
    remnant_after_booster: {
      ecCap: remnantCap,
      ec: remnantEc,
      titanGone: !session.st.parts.some((p) => /Titan/.test(p.def.name)),
      power_parts: remnantPower,
      panel_oxstat_host0: panelOnHost0,
    },
  };
}

const ships = {};
for (const name of SHIPS) ships[name] = shipReport(name);

// Optional: Express 80 km, SAS off, identity quat — real n·sun, no cheat rotate.
const session = new SimSession();
session.newFlight('Mun Express');
const st = session.st;
const kv = stateFromKepler('kerbin', { ap_m: 80_000, pe_m: 80_000, ta_deg: 0 });
st.pos.copy(kv.pos);
st.vel.copy(kv.vel);
st.landed = false;
st.throttle = 0;
st.sas = false;
st.quat.identity();
st.angVel.set(0, 0, 0);
fillEC(st);
const panel = st.parts.find((p) => p.def.panel);
const n = panelNormal(st, panel);
const sun = sunVectorInertial(st, st.t);
const nDot = n.dot(sun);
const tel0 = ecTelemetry(st, st.t);
const startEc = st.ec;
const dt = 0.1;
const seconds = 10;
for (let i = 0; i < Math.round(seconds / dt); i++) {
  physicsStep(st, dt, []);
  st.t += dt;
}

const flight = {
  craft: 'Mun Express',
  orbit: '80 km circular kerbin',
  setup: 'stock hang, identity quat, SAS off, physicsStep dt=0.1 — NOT sun-faced',
  attachAngle: panel?.attachAngle ?? 0,
  attachAngle_deg: ((panel?.attachAngle ?? 0) * 180) / Math.PI,
  n: n.toArray(),
  sun: sun.toArray(),
  n_dot_sun: nDot,
  flux: solarFlux(st, 0),
  eclipsed: eclipsed({ ...st, t: 0 }, 0),
  ecGen: tel0.ecGen,
  panelW: tel0.panelW,
  start_ec: startEc,
  ec_after_10s: st.ec,
  note: 'gen may be near 0 if the 90° panel does not face Kerbol at identity quat; unrotated number only',
};

const result = {
  version: '0.1.6',
  ships,
  express_80km_day_unrotated: flight,
};

mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
console.log('wrote', OUT);
