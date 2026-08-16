// Pad → LKO → TLI → drop transfer in LMO → lander-only Mun landing.
import { writeFileSync, mkdirSync } from 'node:fs';
import { SimSession } from '../mcp/session.mjs';
import { Autopilot, orbitText } from './lib/autopilot.mjs';
import { BODIES, fmtTime } from '../src/constants.js';

const session = new SimSession();
const ap = new Autopilot(session);
try {
  session.newFlight('Mun Express');
  ap.ascentToOrbit();
  const munTd = ap.munTransferAndLand();
  const names = ap.landerPartNames();
  console.log('parts', names.join(' | '));
  if (names.some((n) => /Sparrow|Falcon|Titan|FT-3200|FT-800/.test(n))) {
    throw new Error('transfer/lifter still attached: ' + names.join(', '));
  }
  if (!names.some((n) => /Kestrel/.test(n))) throw new Error('no Kestrel');
  ap.dumpSnap('mun-landed');
  const out = {
    mun: munTd,
    names,
    length: session.st.geom?.totalLength,
    mass: session.st.massProps?.m,
  };
  mkdirSync(new URL('../logs', import.meta.url), { recursive: true });
  writeFileSync(new URL('../logs/mun-lander-only.json', import.meta.url), JSON.stringify(out, null, 2));
  console.log('LANDER-ONLY', munTd.speed.toFixed(2), 'm/s', munTd.fuel.toFixed(0), 'kg', fmtTime(munTd.t), 'len', out.length);
} catch (e) {
  console.error('FAIL', e.message);
  console.error(e.stack);
  try { ap.dumpSnap('mun-lander-abort'); } catch { /* */ }
  process.exit(1);
}
