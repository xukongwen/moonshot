#!/usr/bin/env node
// Headless Moonshot MCP stdio server. JSON-RPC 2.0 over newline-delimited
// stdin/stdout. Protocol logs go to stderr only — stdout is the wire.

import { createInterface } from 'node:readline';
import { SimSession } from './session.mjs';
import { STOCK } from '../src/stock.js';

const session = new SimSession();

const CRAFTS = Object.keys(STOCK);

const TOOLS = [
  {
    name: 'ksp_new_flight',
    description: 'Start a new flight on the Kerbin pad. Resets the current session.',
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
    description: 'Current vessel telemetry snapshot (altitude, speed, orbit, fuel, staging).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_stage',
    description: 'Fire the next staging event (ignite engines, decouple, drop boosters, or arm chutes).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_throttle',
    description: 'Set engine throttle in [0, 1].',
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
    description: 'Set stability-assist mode.',
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
    description: 'Set pitch/yaw/roll stick inputs in [-1, 1]. Omitted axes are left unchanged.',
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
    description: 'Deploy or retract landing legs.',
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
    description: 'Arm parachutes (they deploy automatically when safe).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ksp_step',
    description: 'Advance the simulation. Capped at 120 seconds per call.',
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

function callTool(name, args = {}) {
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
        try {
          const result = callTool(name, args);
          reply(id, textResult(result));
        } catch (err) {
          log('tool error', name, err);
          reply(id, textResult(err?.message || String(err), true));
        }
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
