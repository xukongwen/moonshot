// Replay Mun landed snapshot → ascent → TKI → Kerbin. Diagnostic, not the suite.
import { existsSync } from 'node:fs';
import { SimSession } from '../mcp/session.mjs';
import { Autopilot, orbitText } from './lib/autopilot.mjs';
import { BODIES, fmtTime } from '../src/constants.js';

const SNAP = '/workspace/moonshot/logs/snapshots/mun-landed.json';
if (!existsSync(SNAP)) {
  console.error('missing', SNAP);
  process.exit(2);
}

const session = new SimSession();
const ap = new Autopilot(session);

try {
  session.newFlight('Mun Express');
  ap.loadSnap(SNAP);
  console.log('loaded', {
    body: session.st.body, landed: session.st.landed, dead: session.st.dead,
    fuel: session.fuelLeft(), stageIdx: session.stageIdx, stages: session.plan.length,
    alt: session.alt(),
  });

  console.log('3. Mun ascent');
  ap.surfaceAscent('mun', { apTarget: 28_000, peClear: 20_000 });
  console.log('  orbit', orbitText(ap.els(), 'mun'), 'fuel', session.fuelLeft().toFixed(0));

  console.log('4. TKI');
  ap.tkiFromMun();
  const kf = ap.kerbinFrame();
  console.log('  kerbin', orbitText(kf.e, 'kerbin'), 'fuel', session.fuelLeft().toFixed(0));

  console.log('5. reentry');
  const home = ap.kerbinReentry();
  console.log('HOME', home);
  ap.dumpSnap('mun-kerbin-return');
  console.log('OK landed', session.st.landed, session.st.body, 'dead', session.st.dead, 'speed', home.speed);
} catch (err) {
  console.error('FAIL', err.message);
  console.error(err.stack);
  try { ap.dumpSnap('mun-return-abort'); } catch { /* */ }
  console.log('state', {
    body: session.st?.body, landed: session.st?.landed, dead: session.st?.dead,
    fuel: session.st ? session.fuelLeft() : null,
    alt: session.st ? session.alt() : null,
    v: session.st?.vel.length(),
    t: session.st?.t,
  });
  process.exit(1);
}
