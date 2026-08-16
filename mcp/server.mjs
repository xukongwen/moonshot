#!/usr/bin/env node
// Headless Moonshot MCP stdio server. JSON-RPC 2.0 over newline-delimited
// stdin/stdout. Protocol logs go to stderr only — stdout is the wire.

import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { SimSession, WARP_LEVELS } from './session.mjs';
import { listPartsCatalog } from './workshop.mjs';
import { STOCK } from '../src/stock.js';
import { listSaves, writeSave, readSave, deleteSave } from './saves.mjs';
import { planMission, redesignForBudget } from '../src/plan.js';

const session = new SimSession();

const CRAFTS = Object.keys(STOCK);

export const TOOLS = [
  {
    name: 'ksp_new_flight',
    description: 'Start a new flight on the Kerbin pad with a stock craft (Mun Express, Duna Hauler, Suborbital Hopper). Resets the current session.',
    inputSchema: {
      type: 'object',
      properties: {
        craft: {
          type: 'string',
          enum: CRAFTS,
          default: 'Mun Express',
          description: 'Stock craft name',
        },
      },
    },
  },
  {
    name: 'ksp_telemetry',
    description: 'Read the flight HUD: altitude, speed, orbit, fuel, staging, warp, camera, plus EC (ec, ecCap, ecGen, eclipsed, panelW), wheelsLive, comm / commReason, albumN, photoEc.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_stage',
    description: 'Press Space — fire the next staging event (ignite engines, decouple, drop boosters, or arm chutes).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_throttle',
    description: 'Set engine throttle in [0, 1] (Shift / Ctrl, or Z / X for full / cut).',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'number', minimum: 0, maximum: 1, description: 'Throttle 0..1' },
      },
      required: ['value'],
    },
  },
  {
    name: 'ksp_sas',
    description: 'Set stability-assist mode (T to toggle, F to cycle hold / prograde / retrograde).',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['off', 'hold', 'prograde', 'retrograde'],
          description: 'SAS mode',
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'ksp_point',
    description: 'Cheat-set attitude instantly (same as the mission test autopilot).',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          enum: ['prograde', 'retrograde', 'up', 'east', 'radial_out', 'radial_in'],
          description: 'Direction to point the nose',
        },
      },
      required: ['dir'],
    },
  },
  {
    name: 'ksp_controls',
    description: 'Set pitch/yaw/roll stick inputs in [-1, 1] (WASD / QE). Omitted axes are left unchanged.',
    inputSchema: {
      type: 'object',
      properties: {
        pitch: { type: 'number', minimum: -1, maximum: 1 },
        yaw: { type: 'number', minimum: -1, maximum: 1 },
        roll: { type: 'number', minimum: -1, maximum: 1 },
      },
    },
  },
  {
    name: 'ksp_legs',
    description: 'Deploy or retract landing legs (press G).',
    inputSchema: {
      type: 'object',
      properties: {
        down: { type: 'boolean', description: 'true = deploy legs' },
      },
      required: ['down'],
    },
  },
  {
    name: 'ksp_chutes',
    description: 'Arm parachutes (press P; they deploy automatically when safe).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_step',
    description: 'Advance the simulation (let the clock run). Capped at 120 seconds per call. If time warp is above 4×, uses on-rails coast.',
    inputSchema: {
      type: 'object',
      properties: {
        seconds: {
          type: 'number',
          minimum: 0,
          maximum: 120,
          default: 1,
          description: 'Simulated seconds to advance (default 1, max 120)',
        },
      },
    },
  },
  {
    name: 'ksp_parts',
    description: 'Open the VAB parts catalog — every part a human can click in the palette (id, name, category, size, mass, fuel, engine, radial).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_vab_get',
    description: 'Look at the current VAB design: stack, radials, selected part, and staging / Δv stats.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_vab_set_name',
    description: 'Type a name in the VAB craft-name field.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Craft name' } },
      required: ['name'],
    },
  },
  {
    name: 'ksp_vab_clear',
    description: 'Click Clear — empty the stack and radials, keep the craft name.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_vab_select',
    description: 'Click a stack part in the VAB list (index 0 = top). Pass -1 to deselect.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: 'Stack index, or -1 for none' },
      },
      required: ['index'],
    },
  },
  {
    name: 'ksp_vab_add_part',
    description: 'Click a part in the VAB palette to add it to the stack (inserted below the selected part, or at the bottom). Radial-only parts (SRB, fins, legs) must use ksp_vab_add_radial.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Part id from ksp_parts' },
        index: { type: 'integer', description: 'Optional insertion index (0 = top)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'ksp_vab_remove_part',
    description: 'Click ✕ on a stack part (also drops radials attached to it).',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'integer', description: 'Stack index to remove' } },
      required: ['index'],
    },
  },
  {
    name: 'ksp_vab_move_part',
    description: 'Click ↑ / ↓ on a stack part (dir -1 = up toward the nose, +1 = down toward the engines).',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: 'Stack index' },
        dir: { type: 'integer', enum: [-1, 1], description: '-1 up / +1 down' },
      },
      required: ['index', 'dir'],
    },
  },
  {
    name: 'ksp_vab_add_radial',
    description: 'Click Add under Radial Attach — attach boosters, fins, or legs to a stack part. Legs/fins are already ×4 sets (sym forced to 1). Host defaults to the selected stack part.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Radial part id (srb, fins, legs, …)' },
        host: { type: 'integer', description: 'Stack index to attach to (default: selected)' },
        sym: { type: 'integer', minimum: 1, description: 'Symmetry count (ignored for legs/fins)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'ksp_vab_remove_radial',
    description: 'Click ✕ on a radial attachment in the VAB stack list.',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'integer', description: 'Index in the radials array' } },
      required: ['index'],
    },
  },
  {
    name: 'ksp_vab_stock',
    description: 'Click a Stock button — load a built-in craft (Suborbital Hopper, Mun Express, Duna Hauler) into the VAB.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', enum: CRAFTS, description: 'Stock craft name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'ksp_vab_save',
    description: 'Click Save — persist the current VAB design to mcp/crafts.json (not browser localStorage).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Optional name; defaults to the current craft name' },
      },
    },
  },
  {
    name: 'ksp_vab_list',
    description: 'Open the VAB load list — saved user crafts plus stock names.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_vab_load',
    description: 'Pick a saved user craft from the VAB load dropdown (not stock — use ksp_vab_stock for those).',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Saved craft name' } },
      required: ['name'],
    },
  },
  {
    name: 'ksp_vab_delete',
    description: 'Delete a saved user craft from mcp/crafts.json.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Saved craft name' } },
      required: ['name'],
    },
  },
  {
    name: 'ksp_vab_launch',
    description: 'Click LAUNCH ▶ — validate (needs a command pod and an engine) and start a flight from the current VAB design.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_vab_stats',
    description: 'Read the VAB staging & Δv panel (same numbers as ksp_vab_get.stats).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_coast',
    description: 'Coast / wait (engines off, out of atmosphere uses on-rails Kepler). Capped at 120 seconds per call — loop for longer coasts.',
    inputSchema: {
      type: 'object',
      properties: {
        seconds: {
          type: 'number',
          minimum: 0,
          maximum: 120,
          description: 'Seconds to coast (max 120; loop the tool for longer)',
        },
      },
      required: ['seconds'],
    },
  },
  {
    name: 'ksp_warp',
    description: 'Set time warp (comma / period, or the warp buttons). Levels 0–8: 1×, 2×, 3×, 4×, 10×, 100×, 1000×, 10000×, 100000×. Above 4×, subsequent ksp_step / ksp_coast use on-rails propagate.',
    inputSchema: {
      type: 'object',
      properties: {
        level: {
          type: 'integer',
          minimum: 0,
          maximum: 8,
          description: `Warp index 0..8 matching ${JSON.stringify(WARP_LEVELS)}`,
        },
      },
      required: ['level'],
    },
  },
  {
    name: 'ksp_revert',
    description: 'Click Revert to VAB — end the flight and return to the workshop (design is kept).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_relaunch',
    description: 'Click Relaunch same craft — put the last launched design back on the pad.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_map',
    description: 'Toggle map view (press M). Headless: stores the map-open flag.',
    inputSchema: {
      type: 'object',
      properties: { open: { type: 'boolean', description: 'true = open map' } },
      required: ['open'],
    },
  },
  {
    name: 'ksp_camera',
    description: 'Orbit the camera (drag to pan, scroll to zoom) in flight or map view. Headless: stores az / el / dist.',
    inputSchema: {
      type: 'object',
      properties: {
        az: { type: 'number', description: 'Azimuth (radians)' },
        el: { type: 'number', description: 'Elevation (radians)' },
        dist: { type: 'number', description: 'Distance from vessel' },
      },
    },
  },
  {
    name: 'ksp_lang',
    description: 'Toggle UI language (EN / 中文 button). Sets i18n even without a DOM.',
    inputSchema: {
      type: 'object',
      properties: {
        lang: { type: 'string', enum: ['en', 'zh'], description: 'Language' },
      },
      required: ['lang'],
    },
  },
  {
    name: 'ksp_save',
    description: 'F5 / 存档 — save the whole session (VAB workshop, user crafts, and flight if any) to mcp/saves/. Not a craft file.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Save slot name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'ksp_load',
    description: 'F9 / 读档 — load a named game save (workshop + crafts + flight). Not ksp_vab_load.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Save slot name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'ksp_saves_list',
    description: 'List game save slots in mcp/saves/.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_saves_delete',
    description: 'Delete a named game save slot from mcp/saves/.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Save slot name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'ksp_vessels',
    description: 'List vessels in the session: id, name, body, altitude, situation, active, held, titan.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_set_active',
    description: 'Switch the commanded vessel (same as [ ] in flight). Does not teleport. After this, ksp_throttle / ksp_point / ksp_legs / ksp_step drive that ship.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Vessel id from ksp_vessels' },
      },
      required: ['id'],
    },
  },
  {
    name: 'ksp_recover',
    description: 'Recover a dropped Titan: switch to it, boostback + suicide, then return focus to the upper if it is still flying. Same muscle as the agent 回收助推 node. Optional id; omit to pick the dropped Titan. Does not teleport. Reports real pad_m / speed; does not claim the pad.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Optional booster vessel id; omit to find the dropped Titan' },
      },
    },
  },
  {
    name: 'ksp_spawn_orbital',
    description: 'Spawn a craft into a Kepler orbit (circular OK: ap=pe). Does not reset the active pad ship.',
    inputSchema: {
      type: 'object',
      properties: {
        craft: { type: 'string', description: 'Stock craft name, or omit and pass design' },
        design: { type: 'object', description: 'VAB design { name, stack, radials }' },
        body: { type: 'string', default: 'kerbin' },
        ap_m: { type: 'number', description: 'Apoapsis altitude (m)' },
        pe_m: { type: 'number', description: 'Periapsis altitude (m); default = ap_m' },
        ta_deg: { type: 'number', default: 0, description: 'True anomaly (deg)' },
        name: { type: 'string', description: 'Display name' },
      },
      required: ['ap_m'],
    },
  },
  {
    name: 'ksp_target',
    description: 'Set the target vessel id, or null to clear.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { description: 'Vessel id, or null to clear' },
      },
    },
  },
  {
    name: 'ksp_translate',
    description: 'RCS translate stick in body axes [-1,1]: +y nose, +x right, +z up. Requires an rcs-block on the vessel (v1 uses no fuel).',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', minimum: -1, maximum: 1 },
        y: { type: 'number', minimum: -1, maximum: 1 },
        z: { type: 'number', minimum: -1, maximum: 1 },
      },
    },
  },
  {
    name: 'ksp_dock',
    description: 'Attempt docking capture with the target (port <1.5 m, axis <15°, closing <1 m/s, same size). Hard-welds immediately if thresholds are met.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_undock',
    description: 'Split a welded pair and apply a tiny separation.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_plan',
    description: 'Score a craft against a mission Δv budget (mun-roundtrip or duna-roundtrip). Pass craft for a stock name, or omit to use the current VAB design. Does not fly.',
    inputSchema: {
      type: 'object',
      properties: {
        mission: {
          type: 'string',
          enum: ['mun-roundtrip', 'duna-roundtrip'],
          description: 'Mission id',
        },
        craft: {
          type: 'string',
          enum: CRAFTS,
          description: 'Optional stock craft; default is the current VAB design',
        },
      },
      required: ['mission'],
    },
  },
  {
    name: 'ksp_redesign',
    description: 'Patch tanks/SRBs until the mission budget passes, or stop at maxSteps. VAB current design is updated in-session; a stock name returns the new design and does not overwrite src/stock.js.',
    inputSchema: {
      type: 'object',
      properties: {
        mission: {
          type: 'string',
          enum: ['mun-roundtrip', 'duna-roundtrip'],
          description: 'Mission id',
        },
        craft: {
          type: 'string',
          enum: CRAFTS,
          description: 'Optional stock craft; default is the current VAB design',
        },
      },
      required: ['mission'],
    },
  },
  {
    name: 'ksp_sat_photo',
    description: 'Take an onboard nadir still of the current SOI body (human key C). Needs a live camera, a real world under you (not kerbol), and PHOTO_EC. Does not need comms. Headless: pays EC and records album metadata; png is null. Headed Flight: real PNG. Same gates as the human button.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_agent_get',
    description: 'Read the in-game agent panel: visible, goal, missionId, nodes, current node, thoughts, running, which nodes have snapshots, plan.ok / fail summary. Same state as the panel. Does not invent fuel or Δv.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_agent_toggle',
    description: 'Open or close the agent panel (state flag; in the browser the DOM follows, headless stdio has no HUD). Omit open to toggle.',
    inputSchema: {
      type: 'object',
      properties: {
        open: { type: 'boolean', description: 'true = open, false = close; omit to toggle' },
      },
    },
  },
  {
    name: 'ksp_agent_plan',
    description: 'Type a coarse goal and press 规划 — map to mun-roundtrip / duna-roundtrip and write the master plan. Uses the current craft if the session has one, else stock for the mission. Same as the panel.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Coarse goal, e.g. 去火星再回来' },
      },
      required: ['text'],
    },
  },
  {
    name: 'ksp_agent_step',
    description: 'Press 走一步 — run the current plan node, then stop. Does not chain. Headless: window / coast / jettison / already-in-orbit ascent use session muscles; pad ascent is a real physics loop (not a fake orbit); stub nodes stay honest. Not ksp_step.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_agent_revert',
    description: 'Press 回退 on the agent panel — restore a finished node snapshot (omit nodeId = previous). Not ksp_revert (that returns to the VAB).',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Finished node id; omit for the previous snapshot' },
      },
    },
  },
  {
    name: 'ksp_agent_check',
    description: 'Press 检查 — run the A5 checker and append thoughts (transfer dry, lander early, budget, dead / suborbital, night+low EC, SAS dead). Same as the panel.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function log(...args) {
  console.error('[moonshot-mcp]', ...args);
}

function textResult(obj, isError = false) {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  const result = { content: [{ type: 'text', text }] };
  if (isError) result.isError = true;
  return result;
}

function resolveBudgetDesign(args, w) {
  if (args.craft) {
    const src = STOCK[args.craft];
    if (!src) {
      throw new Error(`Unknown craft "${args.craft}". Available: ${Object.keys(STOCK).join(', ')}`);
    }
    const d = structuredClone(src);
    d.name = args.craft;
    d.radials ??= [];
    return { design: d, source: 'stock', craft: args.craft };
  }
  if (!w.design.stack.length) {
    throw new Error('No VAB design. Pass craft (Mun Express | Duna Hauler | Suborbital Hopper) or build in the VAB.');
  }
  return { design: w.design, source: 'vab', craft: w.design.name };
}

export function callTool(name, args = {}) {
  const w = session.workshop;
  switch (name) {
    case 'ksp_new_flight':
      return session.newFlight(args.craft ?? 'Mun Express');
    case 'ksp_telemetry':
      return session.telemetry();
    case 'ksp_stage':
      return session.stage();
    case 'ksp_throttle':
      if (args.value == null) throw new Error('ksp_throttle requires value (0..1)');
      return session.setThrottle(args.value);
    case 'ksp_sas':
      if (args.mode == null) throw new Error('ksp_sas requires mode');
      return session.setSas(args.mode);
    case 'ksp_point':
      if (args.dir == null) throw new Error('ksp_point requires dir');
      return session.point(args.dir);
    case 'ksp_controls':
      return session.setControls(args);
    case 'ksp_legs':
      if (args.down == null) throw new Error('ksp_legs requires down (boolean)');
      return session.setLegs(args.down);
    case 'ksp_chutes':
      return session.armChutes();
    case 'ksp_step':
      return session.step(args.seconds ?? 1);
    case 'ksp_parts':
      return listPartsCatalog();
    case 'ksp_vab_get':
      return w.snapshot();
    case 'ksp_vab_set_name':
      if (args.name == null) throw new Error('ksp_vab_set_name requires name');
      return w.setName(args.name);
    case 'ksp_vab_clear':
      return w.clear();
    case 'ksp_vab_select':
      if (args.index == null) throw new Error('ksp_vab_select requires index');
      return w.select(args.index);
    case 'ksp_vab_add_part':
      if (args.id == null) throw new Error('ksp_vab_add_part requires id');
      return w.addStackPart(args.id, args.index);
    case 'ksp_vab_remove_part':
      if (args.index == null) throw new Error('ksp_vab_remove_part requires index');
      return w.removeStackPart(args.index);
    case 'ksp_vab_move_part':
      if (args.index == null || args.dir == null) throw new Error('ksp_vab_move_part requires index and dir');
      return w.moveStackPart(args.index, args.dir);
    case 'ksp_vab_add_radial':
      if (args.id == null) throw new Error('ksp_vab_add_radial requires id');
      return w.addRadial(args.id, args.sym, args.host);
    case 'ksp_vab_remove_radial':
      if (args.index == null) throw new Error('ksp_vab_remove_radial requires index');
      return w.removeRadial(args.index);
    case 'ksp_vab_stock':
      if (args.name == null) throw new Error('ksp_vab_stock requires name');
      return w.loadStock(args.name);
    case 'ksp_vab_save':
      return w.save(args.name);
    case 'ksp_vab_list':
      return { saved: w.listSaved(), stock: CRAFTS };
    case 'ksp_vab_load':
      if (args.name == null) throw new Error('ksp_vab_load requires name');
      return w.load(args.name);
    case 'ksp_vab_delete':
      if (args.name == null) throw new Error('ksp_vab_delete requires name');
      return w.deleteSaved(args.name);
    case 'ksp_vab_launch':
      return session.launchWorkshop();
    case 'ksp_vab_stats':
      return w.stats();
    case 'ksp_coast':
      return session.coast(args.seconds ?? 1);
    case 'ksp_warp':
      if (args.level == null) throw new Error('ksp_warp requires level (0..8)');
      return session.setWarp(args.level);
    case 'ksp_revert':
      return session.revert();
    case 'ksp_relaunch':
      return session.relaunch();
    case 'ksp_map':
      if (args.open == null) throw new Error('ksp_map requires open (boolean)');
      return session.setMap(args.open);
    case 'ksp_camera':
      return session.setCamera(args);
    case 'ksp_lang':
      if (args.lang == null) throw new Error('ksp_lang requires lang (en|zh)');
      return session.setLang(args.lang);

    case 'ksp_save':
      if (args.name == null || String(args.name).trim() === '') {
        throw new Error('ksp_save requires name');
      }
      {
        const doc = session.captureSave(args.name);
        return { ...writeSave(args.name, doc), mode: doc.mode };
      }
    case 'ksp_load':
      if (args.name == null) throw new Error('ksp_load requires name');
      return session.applySave(readSave(args.name));
    case 'ksp_saves_list':
      return { saves: listSaves() };
    case 'ksp_saves_delete':
      if (args.name == null) throw new Error('ksp_saves_delete requires name');
      return deleteSave(args.name);
    case 'ksp_vessels':
      session.requireFlight();
      return { vessels: session.listVessels(), activeId: session.activeId, targetId: session.targetId };
    case 'ksp_set_active':
      if (args.id == null) throw new Error('ksp_set_active requires id');
      return session.setActive(args.id);
    case 'ksp_recover':
      return session.recover(args.id);
    case 'ksp_spawn_orbital': {
      const src = args.design ?? args.craft ?? 'Mun Express';
      return session.spawnOrbital(src, {
        body: args.body ?? 'kerbin',
        ap_m: args.ap_m,
        pe_m: args.pe_m ?? args.ap_m,
        ta_deg: args.ta_deg ?? 0,
        name: args.name,
      });
    }
    case 'ksp_target':
      return session.setTarget(args.id ?? null);
    case 'ksp_translate':
      return session.setTranslate(args);
    case 'ksp_dock':
      return session.dock();
    case 'ksp_undock':
      return session.undock();
    case 'ksp_plan': {
      if (!args.mission) throw new Error('ksp_plan requires mission (mun-roundtrip|duna-roundtrip)');
      const resolved = resolveBudgetDesign(args, w);
      const plan = planMission(resolved.design, args.mission);
      return { source: resolved.source, craft: resolved.craft, ...plan };
    }
    case 'ksp_redesign': {
      if (!args.mission) throw new Error('ksp_redesign requires mission (mun-roundtrip|duna-roundtrip)');
      const resolved = resolveBudgetDesign(args, w);
      const red = redesignForBudget(resolved.design, args.mission);
      if (resolved.source === 'vab') w.applyDesign(red.design);
      return {
        source: resolved.source,
        craft: resolved.craft,
        appliedToVab: resolved.source === 'vab',
        stockUnchanged: resolved.source === 'stock',
        ...red,
      };
    }
    case 'ksp_sat_photo':
      return session.satPhoto();
    case 'ksp_agent_get':
      return session.agentGet();
    case 'ksp_agent_toggle':
      return session.agentToggle(args.open);
    case 'ksp_agent_plan':
      if (args.text == null) throw new Error('ksp_agent_plan requires text');
      return session.agentPlan(args.text);
    case 'ksp_agent_step':
      return session.agentStep();
    case 'ksp_agent_revert':
      return session.agentRevert(args.nodeId);
    case 'ksp_agent_check':
      return session.agentCheck();
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function send(msg) {
  const line = JSON.stringify(msg);
  log('>>', line);
  process.stdout.write(line + '\n');
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  send({ jsonrpc: '2.0', id, error });
}

function handle(msg) {
  if (msg == null || typeof msg !== 'object' || Array.isArray(msg)) {
    replyError(null, -32600, 'Invalid Request');
    return;
  }
  const { id, method, params } = msg;
  const isNote = id === undefined;
  if (!method) {
    if (!isNote) replyError(id, -32600, 'Invalid Request: missing method');
    return;
  }

  try {
    switch (method) {
      case 'initialize': {
        const requested = params?.protocolVersion || '2024-11-05';
        reply(id, {
          protocolVersion: requested,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'moonshot', version: '0.1.0' },
        });
        return;
      }
      case 'notifications/initialized':
      case 'initialized':
        log('client initialized');
        return;
      case 'ping':
        if (!isNote) reply(id, {});
        return;
      case 'tools/list':
        reply(id, { tools: TOOLS });
        return;
      case 'tools/call': {
        const name = params?.name;
        const args = params?.arguments ?? {};
        if (!name) {
          replyError(id, -32602, 'tools/call requires params.name');
          return;
        }
        Promise.resolve(callTool(name, args)).then((result) => {
          reply(id, textResult(result));
        }).catch((err) => {
          log('tool error', name, err);
          reply(id, textResult(err?.message || String(err), true));
        });
        return;
      }
      case 'shutdown':
        if (!isNote) reply(id, {});
        return;
      case 'exit':
        process.exit(0);
        return;
      default:
        if (!isNote) replyError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    log('handler error', err);
    if (!isNote) replyError(id, -32603, err?.message || String(err));
  }
}

function startStdio() {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (/^Content-Length:/i.test(trimmed)) return;
    log('<<', trimmed);
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch (err) {
      log('parse error', err.message);
      replyError(null, -32700, 'Parse error');
      return;
    }
    if (Array.isArray(msg)) {
      for (const item of msg) handle(item);
    } else {
      handle(msg);
    }
  });

  rl.on('close', () => {
    log('stdin closed');
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    log('uncaughtException', err);
  });
  process.on('unhandledRejection', (err) => {
    log('unhandledRejection', err);
  });

  log('Moonshot MCP server ready (stdio). Crafts:', CRAFTS.join(', '));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) startStdio();

export { session };
