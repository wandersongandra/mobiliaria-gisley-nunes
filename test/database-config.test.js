import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function run(env = {}) {
  const script = `
    process.env.NODE_ENV='production';
    Object.assign(process.env, JSON.parse(process.argv[1]));
    const { assertDatabaseConfiguration, databaseSslConfig } = await import('./server/config.js');
    try {
      assertDatabaseConfiguration();
      const ssl = databaseSslConfig();
      process.stdout.write(JSON.stringify({ ok:true, ssl }));
    } catch (error) {
      process.stdout.write(JSON.stringify({ ok:false, error:error.message }));
    }
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(env)], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: '',
      DATABASE_SSL_MODE: '',
      DATABASE_SSL_CA_BASE64: ''
    }
  });
  return JSON.parse(output);
}

const valid = {
  DATABASE_URL: 'mysql://gisley:senha-forte@db.example.com:3306/gisley',
  DATABASE_SSL_MODE: 'verify'
};

test('produção exige DATABASE_URL MySQL com credenciais', () => {
  assert.equal(run({}).error, 'DATABASE_NOT_CONFIGURED');
  assert.equal(run({ DATABASE_URL:'postgres://u:p@db.example/db', DATABASE_SSL_MODE:'verify' }).error, 'DATABASE_URL_INVALID');
  assert.equal(run({ DATABASE_URL:'mysql://db.example.com/db', DATABASE_SSL_MODE:'verify' }).error, 'DATABASE_URL_INVALID');
  assert.equal(run(valid).ok, true);
});

test('produção exige TLS verificado para MySQL', () => {
  assert.equal(run({ ...valid, DATABASE_SSL_MODE:'disable' }).error, 'DATABASE_TLS_REQUIRED');
  const result = run(valid);
  assert.equal(result.ok, true);
  assert.equal(result.ssl.rejectUnauthorized, true);
});

test('CA customizada precisa ser certificado PEM em base64', () => {
  assert.equal(
    run({ ...valid, DATABASE_SSL_CA_BASE64: Buffer.from('nao-e-certificado').toString('base64') }).error,
    'DATABASE_SSL_CA_INVALID'
  );
  const pem = '-----BEGIN CERTIFICATE-----\nTESTE\n-----END CERTIFICATE-----';
  const result = run({ ...valid, DATABASE_SSL_CA_BASE64: Buffer.from(pem).toString('base64') });
  assert.equal(result.ok, true);
  assert.match(result.ssl.ca, /BEGIN CERTIFICATE/);
});
