// E2 probe: pod-mk1 + one OX-STAT, 80 km Kerbin, real day/night numbers.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Quaternion, Vector3 } from 'three';
import { buildVesselParts, stackGeometry, computeSections, massProps } from '../src/vessel.js';
import { BODIES, getInertialState } from '../src/constants.js';
import { physicsStep } from '../src/physics.js';
import {
  fillEC, clampEC, ecCap, ecTelemetry,
  sunVectorInertial, solarFlux, eclipsed, panelNormal, panelGen,
} from '../src/power.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const OUT = join(ROOT, 'logs/e2-sun.json');

function makeCraft(t, { night }) {
  const parts = buildVesselParts({
    name: 'E2 Sun Probe',
    stack: ['pod-mk1'],
    radials: [{ part: 'panel-oxstat', sym: 1, host: 0 }],
  });
  const geom = stackGeometry(parts);
  const mp = massProps(parts, geom);
  const bodyPos = getInertialState('kerbin', t).pos;
  const sunFromBody = bodyPos.clone().negate().normalize();
  const r = BODIES.kerbin.radius + 80_000;
  const radial = night ? sunFromBody.clone().negate() : sunFromBody;
  const pos = radial.multiplyScalar(r);
  const vel = new Vector3().crossVectors(new Vector3(0, 1, 0), pos).normalize()
    .multiplyScalar(Math.sqrt(BODIES.kerbin.mu / r));
  const quat = new Quaternion();
  const st = {
    t, body: 'kerbin',
    pos, vel, quat, angVel: new Vector3(),
    throttle: 0, landed: false, dead: false,
    parts, geom, sections: computeSections(parts), massProps: mp,
    controls: { pitch: 0, yaw: 0, roll: 0 },
    sas: false, sasMode: 'hold', sasTarget: quat.clone(),
  };
  fillEC(st);
  const sun = sunVectorInertial(st, t);
  st.quat.setFromUnitVectors(new Vector3(1, 0, 0), sun);
  st.sasTarget.copy(st.quat);
  return st;
}

function stepSeconds(st, seconds, dt = 0.1) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    physicsStep(st, dt, []);
    st.t += dt;
  }
}

const t0 = 0;
const day = makeCraft(t0, { night: false });
const night = makeCraft(t0, { night: true });

const panel = day.parts.find((p) => p.def.panel);
const nDay = panelNormal(day, panel);
const sunDay = sunVectorInertial(day, t0);
const telDay = ecTelemetry(day, t0);
const telNight = ecTelemetry(night, t0);

day.ec = 0;
clampEC(day);
night.ec = 0;
clampEC(night);

const dayStart = {
  flux: solarFlux(day, t0),
  eclipsed: eclipsed(day, t0),
  ecGen: panelGen(day, t0),
  panelW: telDay.panelW,
  n_dot_sun: nDay.dot(sunDay),
};
const nightStart = {
  flux: solarFlux(night, t0),
  eclipsed: eclipsed(night, t0),
  ecGen: panelGen(night, t0),
  panelW: telNight.panelW,
};

stepSeconds(day, 10, 0.1);
stepSeconds(night, 10, 0.1);

const result = {
  craft: 'pod-mk1 + panel-oxstat',
  body: 'kerbin',
  orbit: '80 km circular kerbin',
  setup: 'hand-built parts, sun-facing radial OX-STAT, SAS off, physicsStep dt=0.1',
  sun_from_getInertialState: true,
  flux_day: dayStart.flux,
  flux_night: nightStart.flux,
  eclipsed_day: dayStart.eclipsed,
  eclipsed_night: nightStart.eclipsed,
  ecGen_day: dayStart.ecGen,
  ecGen_night: nightStart.ecGen,
  panelW_day: dayStart.panelW,
  panelW_night: nightStart.panelW,
  n_dot_sun_day: dayStart.n_dot_sun,
  ecCap: ecCap(day),
  start_ec: 0,
  ec_after_10s_day: day.ec,
  ec_after_10s_night: night.ec,
  t_after_10s_day: day.t,
  t_after_10s_night: night.t,
  eclipsed_after_10s_day: eclipsed(day, day.t),
  eclipsed_after_10s_night: eclipsed(night, night.t),
  landed_day: !!day.landed,
  dead_day: !!day.dead,
  formula: {
    rKerbin: BODIES.kerbin.orbitRadius,
    rDuna: BODIES.duna.orbitRadius,
    flux_duna_center: (BODIES.kerbin.orbitRadius / BODIES.duna.orbitRadius) ** 2,
  },
};

mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
console.log('wrote', OUT);
