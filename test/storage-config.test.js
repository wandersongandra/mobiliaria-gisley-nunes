import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function runStorageAssertion(env = {}) {
  const script = `
    process.env.NODE_ENV='production';
    Object.assign(process.env, JSON.parse(process.argv[1]));
    const { assertStorageConfiguration } = await import('./server/config.js');
    try {
      assertStorageConfiguration();
      process.stdout.write(JSON.stringify({ ok: true }));
    } catch (error) {
      process.stdout.write(JSON.stringify({ ok: false, error: error.message }));
    }
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(env)], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      R2_ACCOUNT_ID: '',
      R2_BUCKET: '',
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: '',
      ENABLE_LEGACY_STORAGE_ROUTE: 'false'
    }
  });
  return JSON.parse(output);
}

const valid = {
  R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  R2_BUCKET: 'gisley-nunes-imoveis',
  R2_ACCESS_KEY_ID: 'abcdefghijklmnop',
  R2_SECRET_ACCESS_KEY: '1234567890abcdefghijklmnopqrstuvwxyz',
  ENABLE_LEGACY_STORAGE_ROUTE: 'false'
};

test('produção exige R2 completo', () => {
  assert.deepEqual(runStorageAssertion({}), {
    ok: false,
    error: 'R2_STORAGE_NOT_CONFIGURED'
  });
  assert.deepEqual(runStorageAssertion(valid), { ok: true });
});

test('produção rejeita account id bucket e segredo R2 inválidos', () => {
  assert.equal(runStorageAssertion({ ...valid, R2_ACCOUNT_ID: 'abc' }).error, 'R2_ACCOUNT_ID_INVALID');
  assert.equal(runStorageAssertion({ ...valid, R2_BUCKET: '../bucket' }).error, 'R2_BUCKET_INVALID');
  assert.equal(runStorageAssertion({ ...valid, R2_ACCESS_KEY_ID: 'short' }).error, 'R2_ACCESS_KEY_INVALID');
  assert.equal(runStorageAssertion({ ...valid, R2_SECRET_ACCESS_KEY: 'short' }).error, 'R2_SECRET_KEY_INVALID');
});

test('rota legado de storage nunca pode ser habilitada em produção', () => {
  assert.equal(
    runStorageAssertion({ ...valid, ENABLE_LEGACY_STORAGE_ROUTE: 'true' }).error,
    'LEGACY_STORAGE_ROUTE_FORBIDDEN_IN_PRODUCTION'
  );
});
