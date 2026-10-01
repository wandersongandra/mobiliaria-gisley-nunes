import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function run(script, overrides = {}) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PUBLIC_ORIGIN: 'https://www.gisley.test',
      ADMIN_ORIGIN: 'https://painel.gisley.test',
      TRUST_PROXY_MODE: '',
      TRUST_CLIENT_IP_HEADER: 'false',
      ...overrides
    },
    encoding: 'utf8'
  }).trim();
}

test('produção rejeita Host desconhecido com 421', () => {
  const output = run(`
    const security = await import('./server/security.js');
    const req = {
      path: '/api/site',
      socket: { remoteAddress: '203.0.113.10' },
      get(name) { return name.toLowerCase() === 'host' ? 'evil.example' : ''; }
    };
    const result = { status: 200, body: null, next: false };
    const res = {
      status(code) { result.status = code; return this; },
      json(body) { result.body = body; return this; }
    };
    security.requireKnownHost(req, res, () => { result.next = true; });
    process.stdout.write(JSON.stringify(result));
  `);
  assert.deepEqual(JSON.parse(output), {
    status: 421,
    body: { error: 'MISDIRECTED_REQUEST' },
    next: false
  });
});

test('produção exige separação entre host público e painel', () => {
  const output = run(`
    const security = await import('./server/security.js');
    try { security.assertSecurityConfiguration(); process.stdout.write('OK'); }
    catch (error) { process.stdout.write(error.message); }
  `, {
    PUBLIC_ORIGIN: 'https://gisley.test',
    ADMIN_ORIGIN: 'https://gisley.test'
  });
  assert.equal(output, 'ORIGIN_SEPARATION_REQUIRED');
});

test('produção não aceita confiança de IP cliente sem modo Cloudflare', () => {
  const output = run(`
    const security = await import('./server/security.js');
    try { security.assertSecurityConfiguration(); process.stdout.write('OK'); }
    catch (error) { process.stdout.write(error.message); }
  `, {
    TRUST_PROXY_MODE: '',
    TRUST_CLIENT_IP_HEADER: 'true'
  });
  assert.equal(output, 'UNSAFE_CLIENT_IP_TRUST');
});
