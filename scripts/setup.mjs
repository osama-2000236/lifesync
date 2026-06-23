#!/usr/bin/env node
// ============================================
// LifeSync — one-time setup
// ============================================
// Installs everything once: backend deps, frontend deps, the Python model
// environment, and the database. Run this a single time on a fresh machine:
//
//   npm run setup
//
// Then start the app any time with:  npm start
// ============================================

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_WIN = process.platform === 'win32';
const C = { reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m' };
const step = (n, msg) => console.log(`\n${C.cyan}${C.bold}[${n}/5] ${msg}${C.reset}`);
const ok = (msg) => console.log(`${C.green}  ✓ ${msg}${C.reset}`);
const warn = (msg) => console.log(`${C.yellow}  ! ${msg}${C.reset}`);

const run = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, stdio: 'inherit', shell: true, ...opts });

// Prefer the lockfile-deterministic `npm ci`; fall back to `npm install` when
// no/stale lockfile makes ci fail, so a fresh machine still gets dependencies.
const installDeps = (label, ciCmd, installCmd) => {
  try {
    run(ciCmd);
  } catch {
    warn(`${label}: "npm ci" failed (missing/stale lockfile?) — falling back to "npm install".`);
    run(installCmd);
  }
};

console.log(`\n${C.green}${C.bold}  LifeSync setup${C.reset} ${C.gray}— one-time install${C.reset}`);

// 0) .env
const envPath = path.join(ROOT, '.env');
if (!fs.existsSync(envPath)) {
  fs.copyFileSync(path.join(ROOT, '.env.example'), envPath);
  warn('Created .env from .env.example — open it and set DB_PASSWORD to your MySQL root password.');
}
dotenv.config({ path: envPath });

// 1) backend deps
step(1, 'Installing backend dependencies');
installDeps('backend', 'npm ci', 'npm install');
ok('backend dependencies installed');

// 2) frontend deps
step(2, 'Installing frontend dependencies');
installDeps('frontend', 'npm --prefix client ci', 'npm --prefix client install');
ok('frontend dependencies installed');

// 3) Python model environment
step(3, 'Setting up the local AI (Python) environment');
const venvPy = IS_WIN
  ? path.join(ROOT, 'model_runtime', '.venv', 'Scripts', 'python.exe')
  : path.join(ROOT, 'model_runtime', '.venv', 'bin', 'python');
try {
  if (!fs.existsSync(venvPy)) {
    run(`${IS_WIN ? 'python' : 'python3'} -m venv .venv`, { cwd: path.join(ROOT, 'model_runtime') });
  }
  run(`"${venvPy}" -m pip install --quiet --upgrade pip`);
  run(`"${venvPy}" -m pip install --quiet -r requirements.txt`, { cwd: path.join(ROOT, 'model_runtime') });
  ok('AI model environment ready');
} catch {
  warn('Python setup failed. Install Python 3.10+ (and tick "Add to PATH"), then re-run "npm run setup".');
}

// 4) Database
step(4, 'Creating the database');
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const probe = () => new Promise((resolve) => {
  const s = net.connect({ port: DB_PORT, host: DB_HOST });
  s.setTimeout(800);
  s.once('connect', () => { s.destroy(); resolve(true); });
  s.once('error', () => resolve(false));
  s.once('timeout', () => { s.destroy(); resolve(false); });
});
const findMysqld = () => {
  const home = os.homedir();
  const cands = IS_WIN
    ? [path.join(home, 'scoop', 'apps', 'mysql', 'current', 'bin', 'mysqld.exe'),
       ...['C:/Program Files/MySQL', 'C:/Program Files (x86)/MySQL'].flatMap((b) => {
         try { return fs.readdirSync(b).map((d) => path.join(b, d, 'bin', 'mysqld.exe')); } catch { return []; } })]
    : ['/usr/local/bin/mysqld', '/opt/homebrew/bin/mysqld', '/usr/sbin/mysqld'];
  return cands.find((p) => fs.existsSync(p)) || null;
};

let dbPortOpen = await probe();
if (!dbPortOpen) {
  const mysqld = findMysqld();
  if (mysqld) {
    console.log(`${C.gray}  MySQL not running — starting it (${mysqld})...${C.reset}`);
    spawn(mysqld, ['--console'], { detached: true, stdio: 'ignore', shell: false }).unref();
    for (let i = 0; i < 30 && !dbPortOpen; i++) { await new Promise((r) => setTimeout(r, 1000)); dbPortOpen = await probe(); }
  }
}
if (!dbPortOpen) {
  warn('MySQL is not running and could not be started automatically. Start MySQL, then re-run: npm run setup');
} else {
  const name = process.env.DB_NAME || 'lifesync_db';

  // Create the database with the mysql2 driver (already a dependency) rather
  // than shelling out to the `mysql` CLI. Avoids PATH lookup and shell-quoting
  // the SQL — the old CLI path double-escaped the backticks and split the
  // -e argument on spaces, so it never actually created the database.
  if (!/^[A-Za-z0-9_$]+$/.test(name)) {
    warn(`DB_NAME "${name}" has unusual characters; create the database manually:  CREATE DATABASE \`${name}\`;`);
  } else {
    try {
      const { createConnection } = await import('mysql2/promise');
      const conn = await createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
      });
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
      await conn.end();
      ok(`database "${name}" ready (tables are created automatically on first start)`);
    } catch (err) {
      warn(`Could not create the database "${name}" automatically: ${err.message}`);
      warn(`Create it manually:  CREATE DATABASE \`${name}\`;`);
    }
  }
}

// 5) Done
step(5, 'Done');
console.log(`\n${C.green}${C.bold}  Setup complete!${C.reset}`);
console.log(`  Start the whole project any time with:  ${C.cyan}${C.bold}npm start${C.reset}`);
console.log(`  ${C.gray}(optional) For Gemma / Custom models, install & open LM Studio and load a model.${C.reset}\n`);
