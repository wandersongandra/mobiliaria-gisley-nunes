import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configuredAdminOrigin, configuredPublicOrigin } from '../server/config.js';
import { requestHostOrigin, requestOrigin, requireAdminOrigin } from '../server/security.js';

function mockRequest({ host = 'localhost:3000', proto = '' } = {}) {
  return {
    secure: false,
    headers: { 'x-forwarded-proto': proto },
    get(name) { return name.toLowerCase() === 'host' ? host : ''; }
  };
}

test('configuredPublicOrigin normaliza uma origem HTTPS', () => {
  const previous = process.env.PUBLIC_ORIGIN;
  process.env.PUBLIC_ORIGIN = 'https://example.com/path?q=1';
  assert.equal(configuredPublicOrigin(), 'https://example.com');
  process.env.PUBLIC_ORIGIN = previous;
});

test('requestOrigin rejeita Host inválido', () => {
  const previous = process.env.PUBLIC_ORIGIN;
  process.env.PUBLIC_ORIGIN = '';
  assert.equal(requestOrigin(mockRequest({ host: 'evil.com/path' })), '');
  process.env.PUBLIC_ORIGIN = previous;
});

test('requestOrigin usa protocolo encaminhado HTTPS somente em proxy confiável', () => {
  const previousPublic = process.env.PUBLIC_ORIGIN;
  const previousProxy = process.env.TRUST_PROXY_MODE;
  process.env.PUBLIC_ORIGIN = '';
  process.env.TRUST_PROXY_MODE = 'cloudflare';
  assert.equal(requestOrigin(mockRequest({ host: 'site.com', proto: 'https' })), 'https://site.com');
  if (previousPublic === undefined) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = previousPublic;
  if (previousProxy === undefined) delete process.env.TRUST_PROXY_MODE; else process.env.TRUST_PROXY_MODE = previousProxy;
});


test('requestHostOrigin mantém a origem real mesmo com domínio público canônico', () => {
  const previousPublic = process.env.PUBLIC_ORIGIN;
  const previousProxy = process.env.TRUST_PROXY_MODE;
  process.env.PUBLIC_ORIGIN = 'https://www.gisley.test';
  process.env.TRUST_PROXY_MODE = 'cloudflare';
  const req = mockRequest({ host: 'painel.gisley.test', proto: 'https' });
  assert.equal(requestOrigin(req), 'https://www.gisley.test');
  assert.equal(requestHostOrigin(req), 'https://painel.gisley.test');
  if (previousPublic === undefined) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = previousPublic;
  if (previousProxy === undefined) delete process.env.TRUST_PROXY_MODE; else process.env.TRUST_PROXY_MODE = previousProxy;
});

test('configuredAdminOrigin normaliza o subdomínio do painel', () => {
  const previous = process.env.ADMIN_ORIGIN;
  process.env.ADMIN_ORIGIN = 'https://painel.gisley.test/admin?x=1';
  assert.equal(configuredAdminOrigin(), 'https://painel.gisley.test');
  process.env.ADMIN_ORIGIN = previous;
});


test('requireAdminOrigin redireciona login iniciado no domínio público', () => {
  const previousAdmin = process.env.ADMIN_ORIGIN;
  const previousPublic = process.env.PUBLIC_ORIGIN;
  process.env.ADMIN_ORIGIN = 'https://painel.gisley.test';
  process.env.PUBLIC_ORIGIN = 'https://www.gisley.test';

  const req = {
    method: 'GET',
    originalUrl: '/api/auth/login',
    path: '/login',
    secure: true,
    headers: { 'x-forwarded-proto': 'https' },
    get(name) { return name.toLowerCase() === 'host' ? 'www.gisley.test' : ''; }
  };
  const res = {
    statusCode: 200,
    location: '',
    redirect(code, location) { this.statusCode = code; this.location = location; return this; },
    status(code) { this.statusCode = code; return this; },
    json() { return this; }
  };
  let nextCalled = false;
  requireAdminOrigin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 307);
  assert.equal(res.location, 'https://painel.gisley.test/api/auth/login');

  if (previousAdmin === undefined) delete process.env.ADMIN_ORIGIN; else process.env.ADMIN_ORIGIN = previousAdmin;
  if (previousPublic === undefined) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = previousPublic;
});
