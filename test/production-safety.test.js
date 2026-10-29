import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

test('produção sem banco nunca expõe imóveis demonstrativos', () => {
  const script = `
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = '';
    const db = await import('./server/db.js');
    const rows = await db.listProperties({ publicOnly: true });
    const property = await db.getPropertyBySlug('casa-ipe');
    process.stdout.write(JSON.stringify({ count: rows.length, property }));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: path.resolve('.'),
    env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: '' },
    encoding: 'utf8'
  });
  const result = JSON.parse(output);
  assert.equal(result.count, 0);
  assert.equal(result.property, null);
});

test('backend Node falha fechado fora do runtime explícito de preview', () => {
  const script = `
    const { assertNodeRuntimeBoundary } = await import('./server/config.js');
    try {
      assertNodeRuntimeBoundary();
      process.stdout.write('OK');
    } catch (error) {
      process.stdout.write(error.message);
    }
  `;
  const run = (runtime) => execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ...(runtime ? { GISELY_NODE_RUNTIME: runtime } : {})
    },
    encoding: 'utf8'
  }).trim();

  assert.equal(run(''), 'NODE_RUNTIME_DISABLED_FOR_PRODUCTION');
  assert.equal(run('preview'), 'OK');
});
