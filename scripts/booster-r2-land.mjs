import { SimSession } from '../mcp/session.mjs';
import { BODIES } from '../src/constants.js';
import { heightAt } from '../src/terrain.js';
import { physicsStep } from '../src/physics.js';
import { ascentTick, pointState, lifterFuelKg } from '../src/agent-muscles.js';
import { runPoweredDescent } from '../src/agent-burns.js';

function aglOf(st) {
  const body = BODIES[st.body];
  const u = st.pos.clone().normalize();
  const alt = st.pos.length() - body.radius;
  const th = alt < 95_000 ? heightAt(st.body, u) : 0;
  return alt - th - (st.massProps?.comY ?? 0);
}
function fuelOf(st) {
  return (st.parts ?? []).filter((p) => p.fuel > 0 && !p.def?.engine?.srb).reduce((s, p) => s + p.fuel, 0);
}
function kin(st) {
  const u = st.pos.clone().normalize();
  const vUp = st.vel.dot(u);
  return {
    t: st.t, alt_m: st.pos.length() - BODIES[st.body].radius, agl_m: aglOf(st),
    speed_ms: st.vel.length(), vUp_ms: vUp,
    vH_ms: st.vel.clone().addScaledVector(u, -vUp).length(),
    fuel_kg: fuelOf(st), mass_kg: st.massProps?.m ?? null,
    landed: !!st.landed, dead: !!st.dead, body: st.body,
  };
}
function flyToTitanDrop(craft, reserveKg) {
  const session = new SimSession();
  session.newFlight(craft);
  session.stage();
  session.setThrottle(1);
  let dropped = null;
  const t0 = session.st.t;
  for (let i = 0; i < 16_000 && !session.st.dead; i++) {
    const tick = ascentTick(session.st, { plan: session.plan, stageIdx: session.stageIdx });
    pointState(session.st, tick.dir);
    session.st.throttle = tick.throttle;
    const titanHere = session.st.parts.some((p) => /Titan/.test(p.def?.name || ''));
    const srbDry = session.st.parts.some((p) => p.def?.engine?.srb && p.fuel <= 1);
    const srbLive = session.st.parts.some((p) => p.def?.engine?.srb && p.fuel > 1);
    const wantDrop = titanHere && !srbLive && lifterFuelKg(session.st) <= reserveKg;
    if (srbDry) session.stage();
    else if (wantDrop) {
      const out = session.stage();
      if (out.droppedId) {
        const v = session.vesselById(out.droppedId);
        if (v?.st.parts.some((p) => /Titan/.test(p.def?.name || ''))) { dropped = v; break; }
      }
    }
    session.step(0.1);
    if (tick.done || session.st.t - t0 > 500) break;
  }
  return { session, dropped };
}
function coastThenBurn(st, { aglStart, brakeFrac, maxSpeed = Infinity } = {}) {
  st.throttle = 0;
  for (let i = 0; i < 50_000 && !st.dead && !st.landed; i++) {
    const agl = aglOf(st);
    const u = st.pos.clone().normalize();
    const vUp = st.vel.dot(u);
    const speed = st.vel.length();
    pointState(st, st.vel.clone().negate());
    if (agl < aglStart && vUp < 80 && speed < maxSpeed) break;
    if (agl < 2000) break;
    const dt = agl < 20_000 ? 0.06 : 0.14;
    const evs = [];
    physicsStep(st, dt, evs);
    st.t += dt;
    if (st.met != null) st.met += dt;
    if (evs.some((e) => e.type === 'landed' || e.type === 'crashed')) break;
  }
  const atBurn = kin(st);
  const burn = runPoweredDescent(st, st.body, { useChutes: false, brakeFrac });
  return { atBurn, burn };
}

const tries = [
  { craft: 'Mun Express', reserveKg: 8000, aglStart: 8000, brakeFrac: 0.45 },
  { craft: 'Mun Express', reserveKg: 8000, aglStart: 6000, brakeFrac: 0.45 },
  { craft: 'Mun Express', reserveKg: 8000, aglStart: 5000, brakeFrac: 0.35 },
  { craft: 'Mun Express', reserveKg: 10000, aglStart: 8000, brakeFrac: 0.45 },
  { craft: 'Mun Express', reserveKg: 5000, aglStart: 6000, brakeFrac: 0.45 },
  { craft: 'Duna Hauler', reserveKg: 5000, aglStart: 6000, brakeFrac: 0.45 },
];
for (const t of tries) {
  const { session, dropped } = flyToTitanDrop(t.craft, t.reserveKg);
  if (!dropped) { console.log('NO DROP', t); continue; }
  const atSep = kin(dropped.st);
  session.setActive(dropped.id);
  session.setLegs(true);
  const { atBurn, burn } = coastThenBurn(session.st, t);
  session.refreshMass();
  const after = kin(session.st);
  console.log(`${t.craft} R=${t.reserveKg} start=${t.aglStart} bf=${t.brakeFrac} | sep alt=${atSep.alt_m.toFixed(0)} v=${atSep.speed_ms.toFixed(0)} fuel=${atSep.fuel_kg.toFixed(0)} | burn alt=${atBurn.alt_m.toFixed(0)} v=${atBurn.speed_ms.toFixed(0)} vH=${atBurn.vH_ms.toFixed(0)} fuel=${atBurn.fuel_kg.toFixed(0)} | after land=${after.landed} dead=${after.dead} crash=${!!burn.crashed} touch=${burn.speed?.toFixed?.(2)} agl=${after.agl_m.toFixed(2)} fuel=${after.fuel_kg.toFixed(0)} water=${!!burn.water}`);
}
