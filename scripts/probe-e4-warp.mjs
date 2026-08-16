// E4 probe: rails/coast EC vs physics, day/night. Real numbers only.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Quaternion, Vector3 } from 'three';
import { buildVesselParts, stackGeometry, computeSections, massProps } from '../src/vessel.js';
import { BODIES, getInertialState } from '../src/constants.js';
import { physicsStep } from '../src/physics.js';
import { elementsFromState, propagate } from '../src/orbits.js';
import { coastRailsOnState } from '../src/agent-muscles.js';
import {
  fillEC, clampEC, ecCap, ecTelemetry, SAS_EC_PER_S,
  sunVectorInertial, solarFlux, eclipsed, panelGen, stepECOnRails,
} from '../src/power.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const OUT = join(ROOT, 'logs/e4-warp.json');

function makeCraft(t, { night, fromDayDeg = null } = {}) {
  const parts = buildVesselParts({
    name: 'E4 Warp Probe',
    stack: ['pod-mk1'],
    radials: [{ part: 'panel-oxstat', sym: 1, host: 0 }],
  });
  const geom = stackGeometry(parts);
  const mp = massProps(parts, geom);
  const bodyPos = getInertialState('kerbin', t).pos;
  const sunFromBody = bodyPos.clone().negate().normalize();
  const r = BODIES.kerbin.radius + 80_000;
  let radial;
  if (fromDayDeg != null) {
    const east = new Vector3().crossVectors(new Vector3(0, 1, 0), sunFromBody).normalize();
    const ang = (fromDayDeg * Math.PI) / 180;
    radial = sunFromBody.clone().multiplyScalar(Math.cos(ang)).addScaledVector(east, Math.sin(ang));
  } else {
    radial = night ? sunFromBody.clone().negate() : sunFromBody;
  }
  const pos = radial.multiplyScalar(r);
  const vel = new Vector3().crossVectors(new Vector3(0, 1, 0), pos).normalize()
    .multiplyScalar(Math.sqrt(BODIES.kerbin.mu / r) * 1.002);
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

function cloneFlight(st) {
  return {
    ...st,
    pos: st.pos.clone(),
    vel: st.vel.clone(),
    quat: st.quat.clone(),
    angVel: st.angVel.clone(),
    sasTarget: st.sasTarget.clone(),
    controls: { ...st.controls },
  };
}

function stepPhysics(st, seconds, dt = 0.1) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    physicsStep(st, dt, []);
    st.t += dt;
  }
}

function snap(st) {
  const tel = ecTelemetry(st, st.t);
  return {
    t: st.t,
    ec: st.ec,
    ecCap: ecCap(st),
    ecGen: tel.ecGen,
    eclipsed: tel.eclipsed,
    flux: solarFlux(st, st.t),
    panelW: tel.panelW,
  };
}

const t0 = 0;
const day = makeCraft(t0, { night: false });
const night = makeCraft(t0, { night: true });
const dayPhys = cloneFlight(day);
const nightSas = cloneFlight(night);

day.ec = 0;
clampEC(day);
night.ec = 40;
clampEC(night);
dayPhys.ec = 0;
clampEC(dayPhys);
nightSas.ec = 50;
clampEC(nightSas);
nightSas.sas = true;
nightSas.sasTarget.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);

const dayStart = snap(day);
const nightStart = snap(night);

const SIM_DT = 10;
const WARP = 10;

coastRailsOnState(day, { maxS: SIM_DT, dt: SIM_DT });
coastRailsOnState(night, { maxS: SIM_DT, dt: SIM_DT });
coastRailsOnState(nightSas, { maxS: SIM_DT, dt: SIM_DT });
stepPhysics(dayPhys, SIM_DT, 0.1);

const posVel = makeCraft(t0, { night: false });
posVel.ec = 0;
const posOnly = cloneFlight(posVel);
const el = elementsFromState(posOnly.pos, posOnly.vel, BODIES.kerbin.mu, posOnly.t);
posOnly.t += SIM_DT;
const pv = propagate(el, posOnly.t);
posOnly.pos.copy(pv.pos);
posOnly.vel.copy(pv.vel);
coastRailsOnState(posVel, { maxS: SIM_DT, dt: SIM_DT });

const helper = makeCraft(t0, { night: false });
helper.ec = 0;
const p0 = helper.pos.clone();
const v0 = helper.vel.clone();
stepECOnRails(helper, SIM_DT);

const term = makeCraft(t0, { fromDayDeg: 80 });
term.ec = 0;
clampEC(term);
const termStart = snap(term);
coastRailsOnState(term, { maxS: 200, dt: 200 });
const termEnd = snap(term);

const result = {
  craft: 'pod-mk1 + panel-oxstat',
  body: 'kerbin',
  orbit: '80 km circular kerbin',
  method: 'coastRailsOnState (same stepECOnRails helper as flight.railsStep / stepOtherVessels propagate / session.railsVessel)',
  setup: 'hand-built parts, sun-facing radial OX-STAT; vel*1.002 so propagate has a real e; one rails substep = simDt (same multiplier railsStep uses for st.t)',
  sun_from_getInertialState: true,
  one_eval_per_rails_substep: true,
  sas_flag: 'st.sas',
  sas_during_warp: 'pay if st.sas and error > 0.5° deadband (sasWouldPay); aligned hold is free; SAS off does not pay',
  sas_ec_per_s: SAS_EC_PER_S,
  day: {
    start_ec: 0,
    simDt: SIM_DT,
    warp: WARP,
    ...dayStart,
    after: snap(day),
    ec_after: day.ec,
  },
  night: {
    start_ec: 40,
    simDt: SIM_DT,
    warp: WARP,
    sas: false,
    ...nightStart,
    after: snap(night),
    ec_after: night.ec,
  },
  night_sas_paying: {
    start_ec: 50,
    simDt: SIM_DT,
    sas: true,
    sasMode: 'hold',
    error_deg: 90,
    ec_after: nightSas.ec,
    expect_drop: SAS_EC_PER_S * SIM_DT,
  },
  physics_vs_rails_day_10s: {
    physicsStep_ec: dayPhys.ec,
    rails_ec: day.ec,
    delta: day.ec - dayPhys.ec,
    physics_t: dayPhys.t,
    rails_t: day.t,
  },
  pos_vel: {
    helper_pos_delta_m: helper.pos.distanceTo(p0),
    helper_vel_delta_mps: helper.vel.distanceTo(v0),
    coast_vs_propagate_pos_m: posVel.pos.distanceTo(posOnly.pos),
    coast_vs_propagate_vel_mps: posVel.vel.distanceTo(posOnly.vel),
  },
  terminator_chunk: {
    start_fromDayDeg: 80,
    simDt: 200,
    start: termStart,
    after: termEnd,
    note: 'one 200 s rails substep; eclipse/gen evaluated at the end state',
  },
  ecCap: ecCap(day),
  landed: !!day.landed,
  dead: !!day.dead,
};

mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
console.log('wrote', OUT);
