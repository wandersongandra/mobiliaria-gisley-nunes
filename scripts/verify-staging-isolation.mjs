#!/usr/bin/env node
// Offline, read-only gate. Invoke with independent, operator-approved target
// values; never infer the staging database or hosts from the .env being checked.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    'env-file': { type: 'string' },
    'public-origin': { type: 'string' },
    'admin-origin': { type: 'string' },
    database: { type: 'string' },
    'production-database': { type: 'string' },
    'production-user': { type: 'string' },
  },
  strict: true,
});

const required = ['env-file', 'public-origin', 'admin-origin', 'database', 'production-database', 'production-user'];
const missing = required.filter(key => !values[key]);
if (missing.length) {
  console.error(`Staging isolation: FAIL (missing required arguments: ${missing.join(', ')})`);
  process.exit(2);
}

const parseOrigin = (input) => {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.pathname !== '/' || (url.port && url.port !== '443')) return null;
    return url.origin;
  } catch {
    return null;
  }
};

const failures = [];
const publicOrigin = parseOrigin(values['public-origin']);
const adminOrigin = parseOrigin(values['admin-origin']);
if (!publicOrigin || !adminOrigin || publicOrigin === adminOrigin) {
  failures.push('operator-approved origins must be distinct HTTPS hosts');
}
if (!/^[A-Za-z0-9_]{1,64}$/.test(values.database)
  || !/^[A-Za-z0-9_]{1,64}$/.test(values['production-database'])
  || values.database === values['production-database']) {
  failures.push('operator-approved staging database must differ from production');
}

let content;
try {
  content = readFileSync(values['env-file'], 'utf8');
} catch {
  console.error('Staging isolation: FAIL (cannot read the private environment file)');
  process.exit(1);
}

const env = new Map();
for (const line of content.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const match = trimmed.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (!match) continue;
  const [, key, rawValue] = match;
  if (env.has(key)) {
    failures.push(`duplicate ${key} assignment`);
    continue;
  }
  const value = rawValue.trim();
  env.set(key, /^(['"]).*\1$/.test(value) ? value.slice(1, -1) : value);
}

const check = (condition, reason) => { if (!condition) failures.push(reason); };
check(env.get('APP_ENV') === 'production', 'APP_ENV must enable production security middleware');
check(env.get('APP_DEBUG') === 'false', 'APP_DEBUG must be false');
check(parseOrigin(env.get('APP_URL') || '') === publicOrigin, 'APP_URL differs from approved staging public origin');
check(parseOrigin(env.get('ADMIN_ORIGIN') || '') === adminOrigin, 'ADMIN_ORIGIN differs from approved staging admin origin');
check(env.get('DB_CONNECTION') === 'mysql', 'DB_CONNECTION must be mysql');
check(env.get('DB_DATABASE') === values.database, 'DB_DATABASE differs from approved staging database');
check(Boolean(env.get('DB_USERNAME')) && env.get('DB_USERNAME') !== values['production-user'],
  'staging database user is missing or shared with production');
check(Boolean(env.get('DB_PASSWORD')), 'staging database password is missing');
check(!env.get('DATABASE_URL'), 'DATABASE_URL overrides the isolated MySQL settings');
check(env.get('MAIL_MAILER') === 'log', 'staging must not transmit email');
check(!env.get('SESSION_DOMAIN'), 'session cookies must remain host-bound');

if (failures.length) {
  console.error('Staging isolation: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('No environment value, password or token was printed.');
  process.exit(1);
}

console.log('Staging isolation: PASS (configuration only; database permissions and runtime not tested).');
