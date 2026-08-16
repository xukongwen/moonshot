// E5: MCP telemetry exposes the real EC set; checker writes one night+low
// sentence and one SAS-dead sentence from those fields only.
import { Vector3, Quaternion } from 'three';
import { buildVesselParts, stackGeometry, computeSections, massProps } from '../src/vessel.js';
import { BODIES, getInertialState } from '../src/constants.js';
import { fillEC, sunVectorInertial, eclipsed, panelNormal, ecTelemetry, wheelsLive } from '../src/power.js';
import { runChecks, EC_LOW } from '../src/agent-check.js';
import { readFlightCheck } from '../src/agent-muscles.js';
import { SimSession } from '../mcp/session.mjs';
import { TOOLS } from '../mcp/server.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

const DESIGN = {
  name: 'e5',
  stack: ['pod-mk1'],
  radials: [{ part: 'panel-oxstat', sym: 1, host: 0 }],
};

function craft() {
  const parts = buildVesselParts(DESIGN);
  const geom = stackGeometry(parts);
  const mp = massProps(parts, geom);
  return { parts, geom, mp };
}

/** Sun-facing / anti-sun 80 km. vel*1.002 so Kepler e is real (same as E4). */
function placeBySun({ night = false, t = 0, alt = 80_000 } = {}) {
  const { parts, geom, mp } = craft();
  const bodyPos = getInertialState('kerbin', t).pos;
  const sunFromBody = bodyPos.clone().negate().normalize();
  const r = BODIES.kerbin.radius + alt;
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
  return st;
}

function facePanelAtSun(st) {
  // Align the wing FACE (tangent), not the radial/span, to Kerbol.
  const sun = sunVectorInertial(st, st.t);
  const panel = st.parts.find((p) => p.def.panel);
  const bodyN = panelNormal({ quat: new Quaternion() }, panel);
  st.quat.setFromUnitVectors(bodyN, sun);
  st.sasTarget.copy(st.quat);
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
  live.sas = st.sas;
  live.sasMode = st.sasMode;
  session.liftedOff = true;
  return session;
}

const FIELDS = ['ec', 'ecCap', 'ecGen', 'eclipsed', 'panelW'];

console.log('1. ecTelemetry day / night (same function session.telemetry uses)');
{
  const day = placeBySun({ night: false });
  facePanelAtSun(day);
  const night = placeBySun({ night: true });
  facePanelAtSun(night);
  const d = ecTelemetry(day);
  const n = ecTelemetry(night);

  check('day eclipsed === null', d.eclipsed === null, String(d.eclipsed));
  check('day matches eclipsed()', d.eclipsed === eclipsed(day), String(eclipsed(day)));
  check('day ecGen > 0 (sun-facing panel)', d.ecGen > 0, String(d.ecGen));
  check('day panelW > 0', d.panelW > 0, String(d.panelW));
  check('day wheelsLive true (full pool)', d.wheelsLive === true && wheelsLive(day) === true);

  check('night eclipsed === kerbin', n.eclipsed === 'kerbin', String(n.eclipsed));
  check('night matches eclipsed()', n.eclipsed === eclipsed(night), String(eclipsed(night)));
  check('night ecGen === 0', n.ecGen === 0, String(n.ecGen));
  check('night panelW === 0', n.panelW === 0, String(n.panelW));

  for (const k of FIELDS) {
    check(`day has ${k}`, k in d, JSON.stringify(d));
    check(`night has ${k}`, k in n, JSON.stringify(n));
  }
  check('day ec is the real pool', d.ec === day.ec, String(d.ec));
  check('day ecCap is pod-mk1 50', d.ecCap === 50, String(d.ecCap));
}

console.log('2. session.telemetry() returns the five fields (and wheelsLive)');
{
  const day = placeBySun({ night: false });
  facePanelAtSun(day);
  const night = placeBySun({ night: true });
  facePanelAtSun(night);
  const dayTel = sessionFromState(day).telemetry();
  const nightTel = sessionFromState(night).telemetry();
  const expectDay = ecTelemetry(day);
  const expectNight = ecTelemetry(night);

  for (const k of FIELDS) {
    check(`session day.${k} matches ecTelemetry`, dayTel[k] === expectDay[k],
      `${k}: ${dayTel[k]} vs ${expectDay[k]}`);
    check(`session night.${k} matches ecTelemetry`, nightTel[k] === expectNight[k],
      `${k}: ${nightTel[k]} vs ${expectNight[k]}`);
  }
  check('session day.eclipsed null', dayTel.eclipsed === null, String(dayTel.eclipsed));
  check('session day.ecGen > 0', dayTel.ecGen > 0, String(dayTel.ecGen));
  check('session night.eclipsed kerbin', nightTel.eclipsed === 'kerbin', String(nightTel.eclipsed));
  check('session night.ecGen === 0', nightTel.ecGen === 0, String(nightTel.ecGen));
  check('session day.wheelsLive', dayTel.wheelsLive === true);
  check('readFlightCheck spreads the same fields', (() => {
    const c = readFlightCheck(day);
    return FIELDS.every((k) => c[k] === expectDay[k]) && c.wheelsLive === expectDay.wheelsLive;
  })());
}

console.log(`3. checker: night+low (ec < ${EC_LOW}) / night+full / day+low / ec=0`);
{
  const day = placeBySun({ night: false });
  facePanelAtSun(day);
  const night = placeBySun({ night: true });
  facePanelAtSun(night);
  const dayTel = ecTelemetry(day);
  const nightTel = ecTelemetry(night);
  check('threshold is 20', EC_LOW === 20, String(EC_LOW));
  check('ec=10 is below threshold', 10 < EC_LOW);
  check('full pool is not low', nightTel.ec >= EC_LOW, String(nightTel.ec));

  const nightLowZh = runChecks({
    check: { ...nightTel, ec: 10 },
    lang: 'zh',
    when: 'inspect',
  });
  const nightLowEn = runChecks({
    check: { ...nightTel, ec: 10 },
    lang: 'en',
    when: 'inspect',
  });
  const zhLow = '在 kerbin 影子里，电量 10 / 50。';
  const enLow = 'Eclipsed by kerbin, EC 10 / 50.';
  check('night+ec=10 zh sentence', nightLowZh.thoughts.includes(zhLow), JSON.stringify(nightLowZh.thoughts));
  check('night+ec=10 en sentence', nightLowEn.thoughts.includes(enLow), JSON.stringify(nightLowEn.thoughts));
  check('night+ec=10 flag', nightLowZh.flags.ecLowNight === true);
  check('night+ec=10 not SAS-dead', nightLowZh.flags.sasDead === false);
  check('night+ec=10 one low sentence', nightLowZh.thoughts.filter((s) => s === zhLow).length === 1);

  const nightFull = runChecks({
    check: { ...nightTel },
    lang: 'zh',
    when: 'inspect',
  });
  check('night+full has no low-EC sentence', !nightFull.thoughts.includes(zhLow)
    && !nightFull.thoughts.some((s) => s.includes('影子')), JSON.stringify(nightFull.thoughts));
  check('night+full flag off', nightFull.flags.ecLowNight === false);

  const dayLow = runChecks({
    check: { ...dayTel, ec: 10 },
    lang: 'zh',
    when: 'inspect',
  });
  check('day+ec=10 no night sentence', !dayLow.thoughts.includes(zhLow)
    && !dayLow.thoughts.some((s) => s.includes('影子') || s.includes('Eclipsed')),
    JSON.stringify(dayLow.thoughts));
  check('day+ec=10 flag off', dayLow.flags.ecLowNight === false);
  check('day+ec=10 no SAS-dead', dayLow.flags.sasDead === false);

  const deadDay = runChecks({
    check: { ...dayTel, ec: 0, wheelsLive: false },
    lang: 'zh',
    when: 'inspect',
  });
  const deadEn = runChecks({
    check: { ...dayTel, ec: 0, wheelsLive: false },
    lang: 'en',
    when: 'inspect',
  });
  const zhDead = '电量 0，SAS 死了。';
  const enDead = 'EC 0, SAS dead.';
  check('ec=0 day SAS-dead zh', deadDay.thoughts.includes(zhDead), JSON.stringify(deadDay.thoughts));
  check('ec=0 day SAS-dead en', deadEn.thoughts.includes(enDead), JSON.stringify(deadEn.thoughts));
  check('ec=0 day no night sentence', !deadDay.thoughts.includes(zhLow)
    && !deadDay.thoughts.some((s) => s.includes('影子')), JSON.stringify(deadDay.thoughts));
  check('ec=0 flag sasDead', deadDay.flags.sasDead === true);

  const deadNight = runChecks({
    check: { ...nightTel, ec: 0, wheelsLive: false },
    lang: 'zh',
    when: 'inspect',
  });
  check('night+ec=0 has both sentences',
    deadNight.thoughts.includes('在 kerbin 影子里，电量 0 / 50。')
    && deadNight.thoughts.includes(zhDead),
    JSON.stringify(deadNight.thoughts));

  const missing = runChecks({ check: {}, lang: 'zh', when: 'inspect' });
  check('missing EC fields invent nothing', missing.thoughts.length === 0
    && missing.flags.ecLowNight === false && missing.flags.sasDead === false,
    JSON.stringify(missing.thoughts));
}

console.log('4. ksp_telemetry field list in TOOLS description');
{
  const tool = TOOLS.find((x) => x.name === 'ksp_telemetry');
  check('ksp_telemetry exists', !!tool);
  const desc = tool?.description ?? '';
  for (const k of FIELDS) {
    check(`description names ${k}`, desc.includes(k), desc);
  }
  check('no ksp_set_ec tool', !TOOLS.some((x) => x.name === 'ksp_set_ec'));
  check('no deploy/panel control tool', !TOOLS.some((x) => /deploy|set_ec|panel/.test(x.name)));
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\npower-e5 tests passed');
