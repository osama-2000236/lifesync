#!/usr/bin/env node
/**
 * Production env preflight for the **backend** (complements validate-release-env.mjs
 * which checks frontend Vite vars).
 *
 * Loads root .env if present, then runs collectProductionEnvErrors as if
 * NODE_ENV=production (unless you already set it).
 *
 * Usage:
 *   npm run preflight:production
 *   node scripts/validate-production-env.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dir, '..');

const loadEnvFile = (file) => {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
};

loadEnvFile(path.join(root, '.env'));

const {
  collectProductionEnvErrors,
  collectProductionEnvWarnings,
} = require('../server/config/productionEnv.js');

// Always evaluate production rules for this script — that's the point.
const env = { ...process.env, NODE_ENV: 'production' };
const errors = collectProductionEnvErrors(env);
const warnings = collectProductionEnvWarnings(env);

for (const w of warnings) {
  console.warn(`[preflight:production] WARN: ${w}`);
}

if (errors.length) {
  console.error('[preflight:production] FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('[preflight:production] Production environment checks passed.');
