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


test('produção rejeita origens canônicas ambíguas', () => {
  for (const publicOrigin of [
    'https://www.gisley.test/admin',
    'https://www.gisley.test/?next=x',
    'https://user:pass@www.gisley.test/'
  ]) {
    const output = run(`
      const security = await import('./server/security.js');
      try { security.assertSecurityConfiguration(); process.stdout.write('OK'); }
      catch (error) { process.stdout.write(error.message); }
    `, { PUBLIC_ORIGIN: publicOrigin });
    assert.equal(output, 'PUBLIC_ORIGIN_NOT_CONFIGURED', publicOrigin);
  }

  const adminOutput = run(`
    const security = await import('./server/security.js');
    try { security.assertSecurityConfiguration(); process.stdout.write('OK'); }
    catch (error) { process.stdout.write(error.message); }
  `, { ADMIN_ORIGIN: 'https://painel.gisley.test/admin' });
  assert.equal(adminOutput, 'ADMIN_ORIGIN_NOT_CONFIGURED');
});

test('produção rejeita host parecido ou porta fora da origem canônica', () => {
  const output = run(`
    const security = await import('./server/security.js');
    const hosts = [
      'www.gisley.test.evil.example',
      'painel.gisley.test.evil.example',
      'www.gisley.test:8443',
      'painel.gisley.test:8443'
    ];
    const result = hosts.map((host) => {
      const req = {
        path: '/api/site',
        socket: { remoteAddress: '203.0.113.10' },
        get(name) { return name.toLowerCase() === 'host' ? host : ''; }
      };
      const state = { status: 200, next: false };
      const res = {
        status(code) { state.status = code; return this; },
        json() { return this; }
      };
      security.requireKnownHost(req, res, () => { state.next = true; });
      return { host, status: state.status, next: state.next };
    });
    process.stdout.write(JSON.stringify(result));
  `);

  for (const item of JSON.parse(output)) {
    assert.equal(item.status, 421, item.host);
    assert.equal(item.next, false, item.host);
  }
});

test('health/readiness só ignoram Host quando conexão é realmente loopback', () => {
  const output = run(`
    const security = await import('./server/security.js');
    const check = (remoteAddress) => {
      const req = {
        path: '/_app/ready',
        socket: { remoteAddress },
        get(name) { return name.toLowerCase() === 'host' ? 'unknown.internal' : ''; }
      };
      const state = { status: 200, next: false };
      const res = {
        status(code) { state.status = code; return this; },
        json() { return this; }
      };
      security.requireKnownHost(req, res, () => { state.next = true; });
      return state;
    };
    process.stdout.write(JSON.stringify({
      loopback: check('127.0.0.1'),
      remote: check('203.0.113.20')
    }));
  `);

  const result = JSON.parse(output);
  assert.equal(result.loopback.next, true);
  assert.equal(result.remote.next, false);
  assert.equal(result.remote.status, 421);
});
