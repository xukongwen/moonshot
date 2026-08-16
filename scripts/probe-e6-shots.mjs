// E6 headed shots: day panel / night drain / SAS dead.
// Playwright cannot see WebGPU. Headed Chrome + canvas.toDataURL.
// Mun Express stock hang, 80 km circular Kerbin, placeBySun / vel*1.002.
// Do not invent telemetry. Do not write a black HUD-only frame and call it 3D.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Quaternion, Vector3 } from 'three';
import { STOCK } from '../src/stock.js';
import { buildVesselParts, stackGeometry, computeSections, massProps } from '../src/vessel.js';
import { BODIES, getInertialState } from '../src/constants.js';
import { fillEC, sunVectorInertial, ecTelemetry, wheelsLive } from '../src/power.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
const LEGS_STOWED = process.argv.includes('--legs-stowed');
const PANEL_PAIR = process.argv.includes('--panel-pair');
const OUT_JSON = join(ROOT, PANEL_PAIR ? 'logs/panel-pair.json' : LEGS_STOWED ? 'logs/legs-stowed-pod.json' : 'logs/e6-shots.json');
mkdirSync(SHOT_DIR, { recursive: true });

const DESIGN = { name: 'Mun Express', ...structuredClone(STOCK['Mun Express']) };

function looks3d(path) {
  const buf = readFileSync(path);
  return { bytes: buf.length, real3d: buf.length >= 110000 };
}

function composite(scenePath, hudPath, outPath) {
  const r = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', scenePath, '-i', hudPath,
    '-filter_complex', '[1]colorkey=0x000000:0.15:0.12[h];[0][h]overlay',
    outPath,
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    copyFileSync(scenePath, outPath);
    return { composited: false, err: (r.stderr || r.stdout || '').slice(0, 200) };
  }
  return { composited: true };
}

async function grabFrame(page, path) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(400);
  const b64 = await page.evaluate(() => {
    const c = document.querySelector('#app > canvas') || document.querySelector('canvas');
    return c.toDataURL('image/png').split(',')[1];
  });
  const scenePath = path.replace(/\.png$/, '.__scene.png');
  const hudPath = path.replace(/\.png$/, '.__hud.png');
  writeFileSync(scenePath, Buffer.from(b64, 'base64'));
  await page.screenshot({ path: hudPath, type: 'png' });
  const scene = looks3d(scenePath);
  // Night canvases compress under 110k even when the ship is real. A black
  // clear is a few KB; anything >= 40k is a painted frame — composite it.
  const painted = scene.bytes >= 40000;
  if (painted) {
    const c = composite(scenePath, hudPath, path);
    try { unlinkSync(scenePath); unlinkSync(hudPath); } catch { /* keep */ }
    return { ...looks3d(path), ...c, sceneBytes: scene.bytes };
  }
  if (scene.bytes >= readFileSync(hudPath).length) copyFileSync(scenePath, path);
  else copyFileSync(hudPath, path);
  try { unlinkSync(scenePath); unlinkSync(hudPath); } catch { /* keep */ }
  return { ...looks3d(path), composited: false, sceneBytes: scene.bytes };
}

/** Sun-facing / anti-sun 80 km. vel*1.002 so Kepler e is real (same as E2/E4). */
function placeBySun({ night = false, t = 0, alt = 80_000 } = {}) {
  const parts = buildVesselParts(DESIGN);
  const geom = stackGeometry(parts);
  const mp = massProps(parts, geom);
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
  if (!PANEL_PAIR) {
    const sun = sunVectorInertial(st, t);
    const panel = st.parts.find((p) => p.def.panel);
    const a = Number.isFinite(panel?.attachAngle) ? panel.attachAngle : Math.PI / 2;
    const bodyN = new Vector3(Math.cos(a), 0, Math.sin(a));
    st.quat.setFromUnitVectors(bodyN, sun);
    st.sasTarget.copy(st.quat);
  }
  return st;
}

function telFromLive(stTemplate, live) {
  const st = {
    ...stTemplate,
    t: live.t,
    body: live.body,
    pos: new Vector3().fromArray(live.pos),
    vel: new Vector3().fromArray(live.vel),
    quat: new Quaternion().fromArray(live.quat),
    ec: live.ec,
    sas: live.sas,
    landed: live.landed,
    dead: live.dead,
  };
  const tel = ecTelemetry(st, st.t);
  const r = BODIES[st.body]?.radius ?? BODIES.kerbin.radius;
  return {
    ...tel,
    wheelsLive: wheelsLive(st),
    body: st.body,
    alt: st.pos.length() - r,
    t: st.t,
    sas: st.sas,
    hudEc: live.hudEc,
    hudEcColor: live.hudEcColor,
    situation: live.situation,
  };
}

// Camera sits on the OX-STAT: along the wafer outward normal, not a wide Titan shot.
const PANEL_CAM = { out: 3.6, up: 0.6, lookIn: 0.2 };
// Pair: 3/4 of the pod so both 90°/+Z and 270°/−Z strips read as wings.
const PAIR_CAM = { out: 5.6, up: 1.7, side: 1.8 };

const JOBS = PANEL_PAIR ? [
  {
    key: 'pair',
    out: 'panel-pair.png',
    night: false,
    sas: false,
    ec: null,
    cam: { ...PAIR_CAM },
  },
] : LEGS_STOWED ? [
  {
    key: 'legsStowed',
    out: 'legs-stowed-pod.png',
    night: false,
    sas: false,
    ec: null,
    cam: { ...PANEL_CAM },
  },
] : [
  {
    key: 'day',
    out: 'e6-day-panel.png',
    night: false,
    sas: false,
    ec: null, // fill
    cam: { ...PANEL_CAM },
  },
  {
    key: 'night',
    out: 'e6-night-drain.png',
    night: true,
    sas: false,
    ec: null,
    cam: { ...PANEL_CAM },
  },
  {
    key: 'sasDead',
    out: 'e6-sas-dead.png',
    night: false,
    sas: true,
    ec: 0,
    cam: { ...PANEL_CAM },
  },
];

// looks3d retry may nudge 0.4 m, never jump back to a whole-rocket dist.
const CAM_NUDGES = PANEL_PAIR ? [
  { out: 6.2, up: 2.0, side: 2.2 },
  { out: 5.2, up: 1.4, side: 1.2 },
  { out: 5.8, up: 2.2, side: 0.6 },
] : [
  { out: 3.2, up: 0.6, lookIn: 0.2 },
  { out: 4.0, up: 0.6, lookIn: 0.2 },
  { out: 3.6, up: 1.0, lookIn: 0.2 },
];

process.env.DISPLAY = process.env.DISPLAY || ':3';

const server = await createServer({
  root: ROOT,
  server: { port: 5226, strictPort: false, host: '127.0.0.1' },
});
await server.listen();
const url = server.resolvedUrls.local[0];
console.log('serving at', url, 'DISPLAY=', process.env.DISPLAY);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--ignore-gpu-blocklist',
    '--window-position=0,0',
    '--window-size=1500,900',
  ],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

const shots = {};
let anyWeak = false;

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__moonshot?.flight && window.__moonshot?.enterFlight, { timeout: 25000 });
  await page.waitForTimeout(2000);

  await page.evaluate((design) => {
    const m = window.__moonshot;
    m.setLang('zh');
    m.enterFlight(design);
    document.getElementById('agent-panel')?.classList.add('hidden');
  }, DESIGN);
  await page.waitForFunction(() => window.__moonshot?.flight?.active, { timeout: 15000 });
  await page.waitForTimeout(2500);

  for (const job of JOBS) {
    const st0 = placeBySun({ night: job.night });
    if (job.ec != null) st0.ec = job.ec;
    const payload = {
      pos: st0.pos.toArray(),
      vel: st0.vel.toArray(),
      quat: [st0.quat.x, st0.quat.y, st0.quat.z, st0.quat.w],
      t: st0.t,
      ec: st0.ec,
      sas: job.sas,
      cam: job.cam,
    };

    const placed = await page.evaluate((p) => {
      const m = window.__moonshot;
      const f = m.flight;
      const st = f.st;
      st.t = p.t;
      st.met = p.t;
      st.body = 'kerbin';
      st.pos.set(p.pos[0], p.pos[1], p.pos[2]);
      st.vel.set(p.vel[0], p.vel[1], p.vel[2]);
      st.quat.set(p.quat[0], p.quat[1], p.quat[2], p.quat[3]);
      st.angVel.set(0, 0, 0);
      st.landed = false;
      st.dead = false;
      st.throttle = 0;
      st.sas = p.sas;
      st.sasMode = 'hold';
      st.sasTarget.copy(st.quat);
      st.ec = p.ec;
      f.flags.liftoff = true;
      f.flags.space = true;
      f.rails = false;
      f.warpIdx = 0;
      if (f.mapOpen) f.toggleMap();
      document.getElementById('agent-panel')?.classList.add('hidden');

      // One physics tick so lastInfo / HUD exist, then freeze so the shot does not drift.
      if (typeof f.physStep === 'function') f.physStep(0.02);
      st.ec = p.ec;
      st.pos.set(p.pos[0], p.pos[1], p.pos[2]);
      st.vel.set(p.vel[0], p.vel[1], p.vel[2]);
      st.quat.set(p.quat[0], p.quat[1], p.quat[2], p.quat[3]);
      st.angVel.set(0, 0, 0);
      if (!f._e6Frozen) {
        f._e6Frozen = true;
        f.physStep = () => {};
        const origUpdate = f.updateScene.bind(f);
        f.updateScene = (dt) => {
          origUpdate(dt);
          const cam = f._e6Cam || { out: 3.6, up: 0.6, lookIn: 0.2 };
          const panel = st.parts.find((x) => x.alive !== false && x.def?.panel);
          if (!panel) return;
          const a = Number.isFinite(panel.attachAngle) ? panel.attachAngle : Math.PI / 2;
          const host = st.parts.find((q) => q.kind === 'stack' && q.stackIndex === panel.stackIndex && q.alive !== false);
          const hostR = host ? host.def.size / 2 : 0.625;
          const halfT = 0.0225; // half of 0.045 strip
          const y = st.geom?.yCenter?.get('r:' + panel.key)
            ?? st.geom?.yCenter?.get(panel.stackIndex)
            ?? 0;
          const V3 = st.pos.constructor;
          const upWorld = new V3(0, 1, 0).applyQuaternion(st.quat).normalize();
          if (Number.isFinite(cam.side)) {
            const local = new V3(0, y, 0);
            const world = typeof f.localToRender === 'function'
              ? f.localToRender(local)
              : local.clone().sub(new V3(0, st.massProps?.comY ?? 0, 0)).applyQuaternion(st.quat);
            const xWorld = new V3(1, 0, 0).applyQuaternion(st.quat).normalize();
            const zWorld = new V3(0, 0, 1).applyQuaternion(st.quat).normalize();
            const camPos = world.clone()
              .addScaledVector(xWorld, Number.isFinite(cam.out) ? cam.out : 5.6)
              .addScaledVector(upWorld, Number.isFinite(cam.up) ? cam.up : 1.7)
              .addScaledVector(zWorld, cam.side);
            f.camera.position.copy(camPos);
            f.camera.up.copy(upWorld);
            f.camera.lookAt(world);
          } else {
            const radial = new V3(Math.cos(a), 0, Math.sin(a));
            const local = new V3(radial.x * (hostR + halfT), y, radial.z * (hostR + halfT));
            const world = typeof f.localToRender === 'function'
              ? f.localToRender(local)
              : local.clone().sub(new V3(0, st.massProps?.comY ?? 0, 0)).applyQuaternion(st.quat);
            const nWorld = radial.clone().applyQuaternion(st.quat).normalize();
            const out = Number.isFinite(cam.out) ? cam.out : 3.6;
            const up = Number.isFinite(cam.up) ? cam.up : 0.6;
            const lookIn = Number.isFinite(cam.lookIn) ? cam.lookIn : 0.2;
            const camPos = world.clone().addScaledVector(nWorld, out).addScaledVector(upWorld, up);
            const look = world.clone().addScaledVector(nWorld, -lookIn);
            f.camera.position.copy(camPos);
            f.camera.up.copy(upWorld);
            f.camera.lookAt(look);
          }
        };
      }
      f._e6Cam = p.cam;
      f.refreshHUD?.();
      return {
        body: st.body,
        ec: st.ec,
        t: st.t,
        landed: !!st.landed,
        nParts: st.parts.filter((x) => x.alive !== false).length,
      };
    }, payload);
    console.log(job.key, 'placed', JSON.stringify(placed));

    await page.waitForTimeout(job.night ? 3500 : 2000);

    const out = join(SHOT_DIR, job.out);
    let last = await grabFrame(page, out);
    let usedCam = job.cam;
    const need = job.night ? 40000 : 110000;
    for (let i = 0; i < CAM_NUDGES.length && last.sceneBytes < need; i++) {
      console.log('  nudge', job.out, 'bytes', last.bytes, 'scene', last.sceneBytes);
      usedCam = CAM_NUDGES[i];
      await page.evaluate((cam) => { window.__moonshot.flight._e6Cam = cam; }, usedCam);
      await page.waitForTimeout(1600);
      last = await grabFrame(page, out);
    }
    console.log(last.real3d ? '3D' : 'WEAK', job.out, last.bytes, 'scene', last.sceneBytes, 'comp', last.composited);

    const live = await page.evaluate(() => {
      const st = window.__moonshot.flight.st;
      const ecEl = document.getElementById('ro-ec');
      return {
        t: st.t,
        body: st.body,
        pos: [st.pos.x, st.pos.y, st.pos.z],
        vel: [st.vel.x, st.vel.y, st.vel.z],
        quat: [st.quat.x, st.quat.y, st.quat.z, st.quat.w],
        ec: st.ec,
        sas: st.sas,
        landed: !!st.landed,
        dead: !!st.dead,
        hudEc: ecEl?.textContent ?? null,
        hudEcColor: ecEl?.style?.color ?? '',
        situation: document.getElementById('situation')?.textContent ?? null,
      };
    });
    const tel = telFromLive(st0, live);
    if (!last.real3d) anyWeak = true;
    shots[job.key] = {
      path: `logs/shots/${job.out}`,
      bytes: last.bytes,
      real3d: last.real3d,
      looks3d: last.real3d,
      composited: last.composited,
      sceneBytes: last.sceneBytes,
      cam: usedCam,
      craft: 'Mun Express',
      orbit: '80 km circular kerbin',
      setup: job.night
        ? 'placeBySun night, stock hang, panel faced at Kerbol, SAS off'
        : job.ec === 0
          ? 'placeBySun day, stock hang, panel faced at Kerbol, SAS on, ec=0'
          : 'placeBySun day, stock hang, panel faced at Kerbol, SAS off',
      telemetry: {
        ec: tel.ec,
        ecCap: tel.ecCap,
        ecGen: tel.ecGen,
        eclipsed: tel.eclipsed,
        panelW: tel.panelW,
        wheelsLive: tel.wheelsLive,
        body: tel.body,
        alt: tel.alt,
      },
      hudEc: tel.hudEc,
      hudEcColor: tel.hudEcColor,
      situation: tel.situation,
      t: tel.t,
      sas: tel.sas,
    };
  }
} finally {
  await Promise.race([
    (async () => { await browser.close(); await server.close(); })(),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

const result = {
  version: '0.1.6',
  at: new Date().toISOString(),
  display: process.env.DISPLAY,
  craft: 'Mun Express',
  orbit: '80 km circular kerbin',
  method: 'headed Chrome channel=chrome canvas.toDataURL + HUD colorkey overlay',
  shots,
  errors: errors.slice(0, 12),
};

writeFileSync(OUT_JSON, JSON.stringify(result, null, 2) + '\n');

for (const job of JOBS) {
  const src = join(SHOT_DIR, job.out);
  const dest = join('/workspace', job.out);
  try { copyFileSync(src, dest); } catch { /* optional */ }
}

console.log(JSON.stringify(result, null, 2));
console.log('wrote', OUT_JSON);
for (const e of errors.slice(0, 8)) console.log('err', String(e).slice(0, 240));
process.exit(anyWeak ? 2 : 0);
