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
