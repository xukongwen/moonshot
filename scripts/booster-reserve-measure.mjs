// Measure Titan leftover needed for a suicide burn from real staging state.
// Manual stage at target leftover (does not depend on LIFTER_RESERVE_KG).
// No teleport. No invented telemetry.
import { SimSession } from '../mcp/session.mjs';
import { BODIES } from '../src/constants.js';
import { heightAt } from '../src/terrain.js';
import { physicsStep } from '../src/physics.js';
import { ascentTick, pointState, orbitCheck, lifterFuelKg } from '../src/agent-muscles.js';
import { runPoweredDescent } from '../src/agent-burns.js';

function aglOf(st) {
  const body = BODIES[st.body];
  const u = st.pos.clone().normalize();
  const alt = st.pos.length() - body.radius;
  const th = alt < 95_000 ? heightAt(st.body, u) : 0;
  return alt - th - (st.massProps?.comY ?? 0);
}

function fuelOf(st) {
  return (st.parts ?? [])
    .filter((p) => p.fuel > 0 && !p.def?.engine?.srb)
    .reduce((s, p) => s + p.fuel, 0);
}

function kin(st) {
  const u = st.pos.clone().normalize();
  const vUp = st.vel.dot(u);
  const vH = st.vel.clone().addScaledVector(u, -vUp).length();
  return {
    t: st.t,
    alt_m: st.pos.length() - BODIES[st.body].radius,
    agl_m: aglOf(st),
    speed_ms: st.vel.length(),
    vUp_ms: vUp,
    vH_ms: vH,
    fuel_kg: fuelOf(st),
    mass_kg: st.massProps?.m ?? null,
    body: st.body,
    landed: !!st.landed,
    dead: !!st.dead,
  };
}

function flyToTitanDrop(craft, reserveKg) {
  const session = new SimSession();
  session.newFlight(craft);
  session.stage();
  session.setThrottle(1);
  let dropped = null;
  let reason = 'timeout';
  const t0 = session.st.t;
  for (let i = 0; i < 16_000 && !session.st.dead; i++) {
    const tick = ascentTick(session.st, { plan: session.plan, stageIdx: session.stageIdx });
    pointState(session.st, tick.dir);
    session.st.throttle = tick.throttle;
    const titanHere = session.st.parts.some((p) => /Titan/.test(p.def?.name || ''));
    const srbDry = session.st.parts.some((p) => p.def?.engine?.srb && p.fuel <= 1);
    const wantDrop = titanHere && !srbDry && !session.st.parts.some((p) => p.def?.engine?.srb && p.fuel > 1)
      && lifterFuelKg(session.st) <= reserveKg;
    if (srbDry) {
      session.stage();
    } else if (wantDrop) {
      const out = session.stage();
      if (out.droppedId) {
        const v = session.vesselById(out.droppedId);
        if (v?.st.parts.some((p) => /Titan/.test(p.def?.name || ''))) {
          dropped = v;
          reason = 'titan-drop';
          break;
        }
      }
    }
    session.step(0.1);
    if (tick.done) { reason = 'orbit'; break; }
    if (session.st.t - t0 > 500) { reason = 'time-cap'; break; }
  }
  return { session, dropped, reason };
}

function continueUpper(session, maxS = 220) {
  const t0 = session.st.t;
  let reason = 'time-cap';
  for (let i = 0; i < 10_000 && !session.st.dead; i++) {
    const tick = ascentTick(session.st, { plan: session.plan, stageIdx: session.stageIdx });
    pointState(session.st, tick.dir);
    session.st.throttle = tick.throttle;
    if (tick.stage) session.stage();
    session.step(0.1);
    if (tick.done) { reason = 'orbit'; break; }
    if (session.st.t - t0 > maxS) break;
    if (session.st.landed || session.st.dead) { reason = 'dead'; break; }
  }
  session.st.throttle = 0;
  const orb = orbitCheck(session.st);
  return {
    reason,
    t: session.st.t,
    ...kin(session.st),
    peKm: orb.peKm,
    apKm: orb.apKm,
    bound: orb.ok,
    orbitText: orb.text,
    fuel_kg: session.fuelLeft(),
    parts: session.st.parts.map((p) => p.def.name),
    titanStillOn: session.st.parts.some((p) => /Titan/.test(p.def?.name || '')),
  };
}

function coastThenBurn(st, { aglStart = 12_000, brakeFrac = 0.45 } = {}) {
  st.throttle = 0;
  for (let i = 0; i < 40_000 && !st.dead && !st.landed; i++) {
    const agl = aglOf(st);
    const u = st.pos.clone().normalize();
    const vUp = st.vel.dot(u);
    pointState(st, st.vel.clone().negate());
    if (agl < aglStart && vUp < 50) break;
    if (agl < 2500) break;
    const dt = agl < 20_000 ? 0.08 : 0.15;
    const evs = [];
    physicsStep(st, dt, evs);
    st.t += dt;
    if (st.met != null) st.met += dt;
    if (evs.some((e) => e.type === 'landed' || e.type === 'crashed')) break;
  }
  return runPoweredDescent(st, st.body, { useChutes: false, brakeFrac });
}

console.log('=== ascent / LKO ===');
const crafts = {};
for (const craft of ['Mun Express', 'Duna Hauler']) {
  console.log('\n--', craft, 'reserve 5000 --');
  const { session, dropped, reason } = flyToTitanDrop(craft, 5000);
  const drop = dropped ? { reason, ...kin(dropped.st), parts: dropped.st.parts.map((p) => p.def.name) } : { reason };
  if (dropped) {
    console.log('  drop', reason,
      `t=${drop.t.toFixed(1)} alt=${drop.alt_m.toFixed(0)} v=${drop.speed_ms.toFixed(0)}`,
      `vUp=${drop.vUp_ms.toFixed(0)} vH=${drop.vH_ms.toFixed(0)} fuel=${drop.fuel_kg.toFixed(0)} mass=${drop.mass_kg.toFixed(0)}`);
    console.log('  parts', drop.parts.join(', '));
  } else {
    console.log('  no drop', reason);
  }
  const upper = continueUpper(session);
  console.log('  upper', upper.reason, upper.orbitText, `fuel=${upper.fuel_kg.toFixed(0)} titanOn=${upper.titanStillOn}`);
  crafts[craft] = { drop, upper };
}

console.log('\n=== landings Mun Express ===');
const landings = [];
for (const reserveKg of [3000, 5000, 8000]) {
  for (const mode of ['immediate', 'coast12']) {
    console.log(`\n-- reserve=${reserveKg} mode=${mode} --`);
    const { session, dropped, reason } = flyToTitanDrop('Mun Express', reserveKg);
    if (!dropped) {
      console.log('  no drop', reason);
      landings.push({ reserveKg, mode, error: reason });
      continue;
    }
    const atSep = kin(dropped.st);
    session.setActive(dropped.id);
    session.setLegs(true);
    const before = kin(session.st);
    const burn = mode === 'immediate'
      ? runPoweredDescent(session.st, 'kerbin', { useChutes: false, brakeFrac: 0.45 })
      : coastThenBurn(session.st, { aglStart: 12_000, brakeFrac: 0.45 });
    session.refreshMass();
    const after = kin(session.st);
    const used = before.fuel_kg - after.fuel_kg;
    console.log('  sep', `alt=${atSep.alt_m.toFixed(0)} v=${atSep.speed_ms.toFixed(0)} vH=${atSep.vH_ms.toFixed(0)} fuel=${atSep.fuel_kg.toFixed(0)}`);
    console.log('  after', `landed=${after.landed} dead=${after.dead} crashed=${!!burn.crashed}`,
      `touch=${burn.speed} v=${after.speed_ms.toFixed(2)} agl=${after.agl_m.toFixed(1)} fuel=${after.fuel_kg.toFixed(0)} used=${used.toFixed(0)}`);
    landings.push({ reserveKg, mode, atSep, before, after, burn, used });
  }
}

console.log('\n=== DONE ===');
console.log(JSON.stringify({ crafts, landings }, (_, v) => (typeof v === 'number' ? Number(v.toFixed?.(4) ?? v) : v), 2).slice(0, 4000));
