import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fakeSecret = ['test', 'secret', 'must', 'remain', 'private'].join('-');
const sample = `APP_NAME="Gisley Nunes - Staging"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://staging.example.test
ADMIN_ORIGIN=https://painel-staging.example.test
DB_CONNECTION=mysql
DB_DATABASE=gisley77_staging
DB_USERNAME=gisley77_stagingapp
DB_PASSWORD="${fakeSecret}"
DATABASE_URL=
MAIL_MAILER=log
SESSION_DOMAIN=
`;

function run(envText) {
  const dir = mkdtempSync(join(tmpdir(), 'gisley-staging-isolation-'));
  const path = join(dir, '.env');
  try {
    writeFileSync(path, envText, { mode: 0o600 });
    return spawnSync(process.execPath, [
      new URL('../scripts/verify-staging-isolation.mjs', import.meta.url).pathname,
      '--env-file', path,
      '--public-origin', 'https://staging.example.test',
      '--admin-origin', 'https://painel-staging.example.test',
      '--database', 'gisley77_staging',
      '--production-database', 'gisley77_gisley_nunes',
      '--production-user', 'gisley77_gisley_app',
    ], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('isolated staging configuration passes an offline, read-only gate', () => {
  const result = run(sample);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Staging isolation: PASS/);
});

test('rejects the exact production URL/database/user misconfiguration observed in staging', () => {
  const result = run(sample
    .replace('https://staging.example.test', 'https://www.example.test')
    .replace('https://painel-staging.example.test', 'https://painel.example.test')
    .replace('DB_DATABASE=gisley77_staging', 'DB_DATABASE=gisley77_gisley_nunes')
    .replace('DB_USERNAME=gisley77_stagingapp', 'DB_USERNAME=gisley77_gisley_app'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /APP_URL differs/);
  assert.match(result.stderr, /ADMIN_ORIGIN differs/);
  assert.match(result.stderr, /DB_DATABASE differs/);
  assert.match(result.stderr, /shared with production/);
  assert.ok(!result.stderr.includes(fakeSecret));
});

test('rejects DATABASE_URL override and an external mailer', () => {
  const result = run(sample.replace('DATABASE_URL=', 'DATABASE_URL=mysql:' + '//user:private@localhost/production')
    .replace('MAIL_MAILER=log', 'MAIL_MAILER=smtp'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL overrides/);
  assert.match(result.stderr, /must not transmit email/);
  assert.doesNotMatch(result.stderr, /private@localhost/);
});

test('rejects duplicate configuration keys to avoid ambiguous runtime behavior', () => {
  const result = run(sample + '\nDB_DATABASE=gisley77_gisley_nunes\n');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /duplicate DB_DATABASE/);
});
