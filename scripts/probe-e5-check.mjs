// E5 probe: real day/night telemetry + exact checker sentences.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Quaternion, Vector3 } from 'three';
import { buildVesselParts, stackGeometry, computeSections, massProps } from '../src/vessel.js';
import { BODIES, getInertialState } from '../src/constants.js';
import { fillEC, sunVectorInertial, ecTelemetry } from '../src/power.js';
import { runChecks, EC_LOW } from '../src/agent-check.js';
import { SimSession } from '../mcp/session.mjs';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const OUT = join(ROOT, 'logs/e5-check.json');

const DESIGN = {
  name: 'E5 Check Probe',
  stack: ['pod-mk1'],
  radials: [{ part: 'panel-oxstat', sym: 1, host: 0 }],
};

function makeCraft(t, { night }) {
  const parts = buildVesselParts(DESIGN);
  const geom = stackGeometry(parts);
  const mp = massProps(parts, geom);
  const bodyPos = getInertialState('kerbin', t).pos;
  const sunFromBody = bodyPos.clone().negate().normalize();
  const r = BODIES.kerbin.radius + 80_000;
  const radial = night ? sunFromBody.clone().negate() : sunFromBody;
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

function sessionFromState(st) {
  const session = new SimSession();
  session.newFlightFromDesign(DESIGN);
  const live = session.st;
  live.pos.copy(st.pos);
  live.vel.copy(st.vel);
  live.quat.copy(st.quat);
  live.angVel.copy(st.angVel);
  live.sasTarget.copy(st.sasTarget);
  live.landed = false;
  live.t = st.t;
  live.ec = st.ec;
  session.liftedOff = true;
  return session;
}

function five(tel) {
  return {
    ec: tel.ec,
    ecCap: tel.ecCap,
    ecGen: tel.ecGen,
    eclipsed: tel.eclipsed,
    panelW: tel.panelW,
  };
}

function thoughtsOf(check, lang) {
  return runChecks({ check, lang, when: 'inspect' }).thoughts;
}

const t0 = 0;
const day = makeCraft(t0, { night: false });
const night = makeCraft(t0, { night: true });
const dayTel = ecTelemetry(day);
const nightTel = ecTelemetry(night);
const daySession = five(sessionFromState(day).telemetry());
const nightSession = five(sessionFromState(night).telemetry());

const nightLowCheck = { ...nightTel, ec: 10 };
const nightFullCheck = { ...nightTel };
const dayLowCheck = { ...dayTel, ec: 10 };
const ec0Check = { ...dayTel, ec: 0, wheelsLive: false };

const nightLowZh = thoughtsOf(nightLowCheck, 'zh');
const nightLowEn = thoughtsOf(nightLowCheck, 'en');
const nightFullZh = thoughtsOf(nightFullCheck, 'zh');
const nightFullEn = thoughtsOf(nightFullCheck, 'en');
const dayLowZh = thoughtsOf(dayLowCheck, 'zh');
const dayLowEn = thoughtsOf(dayLowCheck, 'en');
const ec0Zh = thoughtsOf(ec0Check, 'zh');
const ec0En = thoughtsOf(ec0Check, 'en');

const result = {
  craft: 'pod-mk1 + panel-oxstat',
  body: 'kerbin',
  orbit: '80 km circular kerbin, vel*1.002',
  setup: 'placeBySun + face panel at sun; numbers from ecTelemetry / session.telemetry()',
  threshold: {
    ec_low: EC_LOW,
    rule: 'eclipsed is set AND ec < 20',
    sas_dead: 'ec <= 0 or wheelsLive === false',
  },
  sentences: {
    night_low: {
      zh: nightLowZh.find((s) => s.includes('影子')) ?? null,
      en: nightLowEn.find((s) => s.includes('Eclipsed')) ?? null,
    },
    sas_dead: {
      zh: ec0Zh.find((s) => s.includes('SAS')) ?? null,
      en: ec0En.find((s) => s.includes('SAS')) ?? null,
    },
  },
  telemetry: {
    day: five(dayTel),
    night: five(nightTel),
    day_session: daySession,
    night_session: nightSession,
    fields: ['ec', 'ecCap', 'ecGen', 'eclipsed', 'panelW'],
    extra: ['wheelsLive'],
  },
  checker: {
    night_low: { zh: nightLowZh, en: nightLowEn },
    night_full: { zh: nightFullZh, en: nightFullEn },
    day_low: { zh: dayLowZh, en: dayLowEn },
    ec_0: { zh: ec0Zh, en: ec0En },
  },
};

mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
console.log('wrote', OUT);
