// E1 probe: SAS fighting a 90° error on Mun Express. Real numbers only.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Quaternion, Vector3 } from 'three';
import { SimSession } from '../mcp/session.mjs';
import { stateFromKepler } from '../src/orbits.js';
import { physicsStep } from '../src/physics.js';
import { wheelsLive, ecCap, SAS_EC_PER_S } from '../src/power.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const OUT = join(ROOT, 'logs/e1-sas-drain.json');

const session = new SimSession();
session.newFlight('Mun Express');
const st = session.st;
const kv = stateFromKepler('kerbin', { ap_m: 80_000, pe_m: 80_000, ta_deg: 0 });
st.pos.copy(kv.pos);
st.vel.copy(kv.vel);
st.landed = false;
st.throttle = 0;
st.sas = true;
st.sasMode = 'hold';
st.quat.identity();
st.angVel.set(0, 0, 0);
// Hold a target 90° off the current nose so SAS keeps applying wheel torque.
st.sasTarget = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);

function keepError() {
  // Re-assert 90° so hold never sits in the free deadband.
  st.sasTarget.copy(st.quat).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2));
}

function stepSeconds(seconds, dt = 0.1) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    keepError();
    const evs = [];
    physicsStep(st, dt, evs);
    st.t += dt;
    if (st.ec <= 0) break;
  }
}

const startEc = st.ec;
const cap = ecCap(st);
stepSeconds(10);
const ec10 = st.ec;
const t10 = st.t;
stepSeconds(90);
const ec100 = st.ec;
const t100 = st.t;

let tEmpty = null;
if (st.ec <= 1e-9) tEmpty = st.t;
else {
  const t0 = st.t;
  stepSeconds(400);
  if (st.ec <= 1e-9) tEmpty = st.t;
  else tEmpty = null;
}

const result = {
  craft: 'Mun Express',
  body: st.body,
  orbit: '80 km circular kerbin',
  setup: 'SAS hold, 90° error reasserted each step, physicsStep dt=0.1',
  start_ec: startEc,
  ecCap: cap,
  ec_after_10s: ec10,
  t_after_10s: t10,
  ec_after_100s: ec100,
  t_after_100s: t100,
  wheelsLive: wheelsLive(st),
  time_to_empty_s: tEmpty,
  sas_ec_per_s: SAS_EC_PER_S,
  landed: !!st.landed,
  dead: !!st.dead,
};

mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
console.log('wrote', OUT);
