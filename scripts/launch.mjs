#!/usr/bin/env node
// ============================================
// LifeSync — one-command launcher
// ============================================
// Starts everything the app needs and opens it in your browser:
//   MySQL → local BERT model → backend API → frontend website.
// Re-uses anything already running. Press Ctrl+C to stop it all.
//
//   npm start        (or)   node scripts/launch.mjs
// ============================================

import { spawn } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const IS_WIN = process.platform === 'win32';
const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const PORTS = {
  db: Number(process.env.DB_PORT) || 3306,
  bert: 1235,
  api: Number(process.env.PORT) || 5000,
  web: 5173,
  lmstudio: 1234,
};

const children = [];
let shuttingDown = false;

const log = (tag, msg, color = C.cyan) =>
  console.log(`${color}${C.bold}[${tag}]${C.reset} ${msg}`);
const ok = (msg) => log('✓', msg, C.green);
const warn = (msg) => log('!', msg, C.yellow);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const portOpen = (port, host = '127.0.0.1') =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(800);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });

const httpOk = (port, pathName = '/') =>
  new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathName, timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });

const waitFor = async (check, label, timeoutMs = 60000) => {
  const started = Date.now();
  process.stdout.write(`${C.gray}   waiting for ${label}...${C.reset}`);
  while (Date.now() - started < timeoutMs) {
    if (await check()) { process.stdout.write(`${C.green} ready${C.reset}\n`); return true; }
    process.stdout.write('.');
    await sleep(1000);
  }
  process.stdout.write(`${C.red} timed out${C.reset}\n`);
  return false;
};

const start = (tag, command, args, opts = {}) => {
  const child = spawn(command, args, { cwd: ROOT, shell: IS_WIN, ...opts });
  children.push({ tag, child });
  const prefix = `${C.gray}[${tag}]${C.reset} `;
  const pipe = (stream) => stream && stream.on('data', (d) => {
    const text = d.toString().trimEnd();
    if (text) process.stdout.write(prefix + text.replace(/\n/g, '\n' + prefix) + '\n');
  });
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code) => {
    if (!shuttingDown && code && code !== 0) warn(`${tag} exited (code ${code})`);
  });
  return child;
};

const firstExisting = (candidates) => candidates.find((p) => p && fs.existsSync(p)) || null;

const findMysqld = () => {
  const home = os.homedir();
  const candidates = IS_WIN
    ? [
        path.join(home, 'scoop', 'apps', 'mysql', 'current', 'bin', 'mysqld.exe'),
        ...['C:/Program Files/MySQL', 'C:/Program Files (x86)/MySQL']
          .flatMap((base) => {
            try { return fs.readdirSync(base).map((d) => path.join(base, d, 'bin', 'mysqld.exe')); }
            catch { return []; }
          }),
        'mysqld',
      ]
    : ['/usr/local/bin/mysqld', '/opt/homebrew/bin/mysqld', '/usr/sbin/mysqld', 'mysqld'];
  return firstExisting(candidates.filter((c) => c !== 'mysqld')) || 'mysqld';
};

const findVenvPython = () => firstExisting([
  path.join(ROOT, 'model_runtime', '.venv', 'Scripts', 'python.exe'),
  path.join(ROOT, 'model_runtime', '.venv', 'bin', 'python'),
]);

const openBrowser = (url) => {
  try {
    if (IS_WIN) {
      // `start` is a cmd builtin; the empty "" is its title argument.
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
      spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch { /* ignore */ }
};

const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${C.yellow}Stopping LifeSync...${C.reset}`);
  for (const { child } of children) {
    try {
      if (IS_WIN && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: true });
      else child.kill('SIGTERM');
    } catch { /* ignore */ }
  }
  setTimeout(() => process.exit(0), 800);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ──────────────────────────────────────────────
const main = async () => {
  console.log(`\n${C.green}${C.bold}  LifeSync launcher${C.reset} ${C.gray}— starting everything for you${C.reset}\n`);

  // .env
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(path.join(ROOT, '.env.example'), envPath);
    warn('.env was missing — created one from .env.example. Edit DB_PASSWORD if needed.');
  }

  // 1) MySQL
  if (await portOpen(PORTS.db)) {
    ok(`MySQL already running on :${PORTS.db}`);
  } else {
    const mysqld = findMysqld();
    log('db', `starting MySQL (${mysqld})`);
    // shell:false → the full path (which may contain spaces) is passed as-is.
    start('mysql', mysqld, ['--console'], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    if (!await waitFor(() => portOpen(PORTS.db), 'MySQL', 30000)) {
      warn(`Could not start MySQL automatically (looked for: ${mysqld}).`);
      warn('Likely not installed, or its data directory is not initialized. Install/start MySQL (e.g. as a service), then re-run.');
    }
  }

  // 2) Local BERT model runtime
  if (await portOpen(PORTS.bert)) {
    ok(`BERT model runtime already running on :${PORTS.bert}`);
  } else {
    const py = findVenvPython();
    if (!py) {
      warn('Python model env not found. Run "npm run setup" once. Chat will use the rule-based fallback meanwhile.');
    } else {
      log('ai', 'starting local BERT model (GPU if available, else CPU)');
      // shell:false → the venv python path (may contain spaces) is passed as-is.
      start('bert', py, ['model_runtime/server.py', '--provider', 'auto',
        '--onnx', 'model_runtime/artifacts/bert_intent_directml.onnx'],
        { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      await waitFor(() => httpOk(PORTS.bert, '/v1/status'), 'BERT model', 90000);
    }
  }

  // 3) Backend API
  if (await portOpen(PORTS.api)) {
    ok(`Backend already running on :${PORTS.api}`);
  } else {
    log('api', 'starting backend');
    start('api', process.execPath, ['server/app.js'], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    if (!await waitFor(() => httpOk(PORTS.api, '/api/health'), 'backend API', 45000)) {
      warn('Backend did not come up — usually a database issue. Check the [api] logs above.');
    }
  }

  // 4) Frontend
  if (await portOpen(PORTS.web)) {
    ok(`Frontend already running on :${PORTS.web}`);
  } else {
    log('web', 'starting frontend');
    start('web', IS_WIN ? 'npm.cmd' : 'npm', ['--prefix', 'client', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORTS.web)],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    await waitFor(() => portOpen(PORTS.web), 'frontend', 45000);
  }

  // LM Studio (optional — only needed for Gemma / Custom models)
  const lmUp = await portOpen(PORTS.lmstudio);

  const url = `http://localhost:${PORTS.web}`;
  openBrowser(url);

  console.log(`\n${C.green}${C.bold}  LifeSync is running 🎉${C.reset}`);
  console.log(`  ${C.bold}App:${C.reset}     ${C.cyan}${url}${C.reset}`);
  console.log(`  ${C.bold}API:${C.reset}     http://localhost:${PORTS.api}/api/health`);
  console.log(`  ${C.bold}Model:${C.reset}   LifeSync BERT (on-device, default)`);
  console.log(`  ${C.bold}Gemma:${C.reset}   ${lmUp ? C.green + 'LM Studio detected (:1234) — Gemma/Custom ready' : C.yellow + 'LM Studio not running — start it to use Gemma/Custom models'}${C.reset}`);
  console.log(`\n  ${C.gray}First run? Create an account in the app, or:${C.reset}`);
  console.log(`  ${C.gray}TEST_USER_EMAIL=you@test.local TEST_USER_PASSWORD=Passw0rd1 node scripts/provision-qa-user.js${C.reset}`);
  console.log(`\n  ${C.bold}${C.yellow}Press Ctrl+C to stop everything.${C.reset}\n`);
};

main().catch((e) => { console.error(`${C.red}Launcher error:${C.reset}`, e.message); shutdown(); });
