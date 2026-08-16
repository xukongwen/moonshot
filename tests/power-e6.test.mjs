// E6: three headed PNGs exist and the shot-time telemetry file is honest.
// Does not re-launch Chrome.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHOT_DIR = join(ROOT, 'logs/shots');
const JSON_PATH = join(ROOT, 'logs/e6-shots.json');
const MIN_BYTES = 110000;

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name} ${detail}`); }
};

const FILES = [
  { key: 'day', name: 'e6-day-panel.png' },
  { key: 'night', name: 'e6-night-drain.png' },
  { key: 'sasDead', name: 'e6-sas-dead.png' },
];

console.log('1. PNGs exist and look 3D (>= 110000 bytes)');
for (const f of FILES) {
  const p = join(SHOT_DIR, f.name);
  check(`${f.name} exists`, existsSync(p), p);
  if (existsSync(p)) {
    const n = statSync(p).size;
    check(`${f.name} >= ${MIN_BYTES}`, n >= MIN_BYTES, String(n));
  }
}

console.log('2. logs/e6-shots.json shot-time telemetry');
check('e6-shots.json exists', existsSync(JSON_PATH), JSON_PATH);
if (!existsSync(JSON_PATH)) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}

const doc = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
const shots = doc.shots || {};

for (const f of FILES) {
  const block = shots[f.key];
  check(`${f.key} block present`, !!block, JSON.stringify(Object.keys(shots)));
  if (!block) continue;
  const tel = block.telemetry || {};
  check(`${f.key} has ec`, Number.isFinite(tel.ec), String(tel.ec));
  check(`${f.key} has ecCap`, Number.isFinite(tel.ecCap), String(tel.ecCap));
  check(`${f.key} has ecGen`, Number.isFinite(tel.ecGen), String(tel.ecGen));
  check(`${f.key} has panelW`, Number.isFinite(tel.panelW), String(tel.panelW));
  check(`${f.key} has wheelsLive`, typeof tel.wheelsLive === 'boolean', String(tel.wheelsLive));
  check(`${f.key} has body`, typeof tel.body === 'string', String(tel.body));
  check(`${f.key} has alt`, Number.isFinite(tel.alt), String(tel.alt));
  check(`${f.key} eclipsed is null or string`, tel.eclipsed === null || typeof tel.eclipsed === 'string', String(tel.eclipsed));
  check(`${f.key} png bytes recorded`, Number.isFinite(block.bytes), String(block.bytes));
}

{
  const day = shots.day?.telemetry || {};
  check('day eclipsed === null', day.eclipsed === null, String(day.eclipsed));
  check('day ecGen > 0', day.ecGen > 0, String(day.ecGen));
}

{
  const night = shots.night?.telemetry || {};
  check('night eclipsed set', night.eclipsed != null && night.eclipsed !== '', String(night.eclipsed));
  check('night ecGen === 0', night.ecGen === 0, String(night.ecGen));
}

{
  const dead = shots.sasDead?.telemetry || {};
  check('sas-dead ec === 0', dead.ec === 0, String(dead.ec));
  check('sas-dead wheelsLive false', dead.wheelsLive === false, String(dead.wheelsLive));
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\npower-e6 tests passed');
