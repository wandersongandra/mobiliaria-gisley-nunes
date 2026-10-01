import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configuredAdminOrigin, configuredPublicOrigin } from '../server/config.js';
import {
  clientAddress,
  hostIsKnown,
  requestHostOrigin,
  requestOrigin,
  requireAdminOrigin,
  requireAdminRequestContext,
  requireSameOrigin,
  securityHeaders
} from '../server/security.js';

function mockRequest({ host = 'localhost:3000', proto = '' } = {}) {
  return {
    secure: false,
    headers: { 'x-forwarded-proto': proto },
    get(name) { return name.toLowerCase() === 'host' ? host : ''; }
  };
}

test('configuredPublicOrigin aceita apenas origem canônica sem path/query/credenciais', () => {
  const previous = process.env.PUBLIC_ORIGIN;

  process.env.PUBLIC_ORIGIN = 'https://example.com/';
  assert.equal(configuredPublicOrigin(), 'https://example.com');

  for (const invalid of [
    'https://example.com/admin',
    'https://example.com/?x=1',
    'https://example.com/#fragment',
    'https://user:pass@example.com/'
  ]) {
    process.env.PUBLIC_ORIGIN = invalid;
    assert.equal(configuredPublicOrigin(), '', invalid);
  }

  if (previous === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = previous;
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

test('configuredAdminOrigin exige origem administrativa canônica', () => {
  const previous = process.env.ADMIN_ORIGIN;
  process.env.ADMIN_ORIGIN = 'https://painel.gisley.test/';
  assert.equal(configuredAdminOrigin(), 'https://painel.gisley.test');

  process.env.ADMIN_ORIGIN = 'https://painel.gisley.test/admin';
  assert.equal(configuredAdminOrigin(), '');

  if (previous === undefined) delete process.env.ADMIN_ORIGIN;
  else process.env.ADMIN_ORIGIN = previous;
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


function middlewareResult(middleware, req) {
  const result = { nextCalled: false, statusCode: 200, body: null };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(value) { result.body = value; return this; },
    redirect(code, location) { result.statusCode = code; result.location = location; return this; }
  };
  middleware(req, res, () => { result.nextCalled = true; });
  return result;
}

function originRequest({
  method = 'POST',
  host = 'www.gisley.test',
  originalUrl = '/api/contact',
  origin = '',
  fetchSite = '',
  secure = true
} = {}) {
  return {
    method,
    originalUrl,
    url: originalUrl,
    path: originalUrl,
    secure,
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      origin,
      'sec-fetch-site': fetchSite,
      'x-forwarded-proto': secure ? 'https' : ''
    },
    get(name) {
      const key = name.toLowerCase();
      if (key === 'host') return host;
      if (key === 'origin') return origin;
      if (key === 'sec-fetch-site') return fetchSite;
      return '';
    }
  };
}

test('hostIsKnown aceita somente hosts canônicos quando configurados', () => {
  const prevPublic = process.env.PUBLIC_ORIGIN;
  const prevAdmin = process.env.ADMIN_ORIGIN;
  process.env.PUBLIC_ORIGIN = 'https://www.gisley.test';
  process.env.ADMIN_ORIGIN = 'https://painel.gisley.test';

  assert.equal(hostIsKnown(originRequest({ host: 'www.gisley.test' })), true);
  assert.equal(hostIsKnown(originRequest({ host: 'painel.gisley.test' })), true);
  assert.equal(hostIsKnown(originRequest({ host: 'evil.example' })), false);
  assert.equal(hostIsKnown(originRequest({ host: 'www.gisley.test.evil.example' })), false);

  if (prevPublic === undefined) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = prevPublic;
  if (prevAdmin === undefined) delete process.env.ADMIN_ORIGIN; else process.env.ADMIN_ORIGIN = prevAdmin;
});

test('origens canônicas separam mutações públicas e administrativas', () => {
  const prevPublic = process.env.PUBLIC_ORIGIN;
  const prevAdmin = process.env.ADMIN_ORIGIN;
  process.env.PUBLIC_ORIGIN = 'https://www.gisley.test';
  process.env.ADMIN_ORIGIN = 'https://painel.gisley.test';

  const publicOk = middlewareResult(requireSameOrigin, originRequest({
    originalUrl: '/api/contact',
    host: 'www.gisley.test',
    origin: 'https://www.gisley.test',
    fetchSite: 'same-origin'
  }));
  assert.equal(publicOk.nextCalled, true);

  const panelCannotPostContact = middlewareResult(requireSameOrigin, originRequest({
    originalUrl: '/api/contact',
    host: 'www.gisley.test',
    origin: 'https://painel.gisley.test',
    fetchSite: 'same-site'
  }));
  assert.equal(panelCannotPostContact.statusCode, 403);

  const adminOk = middlewareResult(requireSameOrigin, originRequest({
    originalUrl: '/api/admin/site',
    host: 'painel.gisley.test',
    origin: 'https://painel.gisley.test',
    fetchSite: 'same-origin'
  }));
  assert.equal(adminOk.nextCalled, true);

  const publicCannotMutateAdmin = middlewareResult(requireSameOrigin, originRequest({
    originalUrl: '/api/admin/site',
    host: 'painel.gisley.test',
    origin: 'https://www.gisley.test',
    fetchSite: 'same-site'
  }));
  assert.equal(publicCannotMutateAdmin.statusCode, 403);

  const missingOrigin = middlewareResult(requireSameOrigin, originRequest({
    originalUrl: '/api/admin/site',
    host: 'painel.gisley.test',
    origin: '',
    fetchSite: 'same-origin'
  }));
  assert.equal(missingOrigin.statusCode, 403);

  const contradictoryFetchMetadata = middlewareResult(requireSameOrigin, originRequest({
    originalUrl: '/api/admin/site',
    host: 'painel.gisley.test',
    origin: 'https://painel.gisley.test',
    fetchSite: 'cross-site'
  }));
  assert.equal(contradictoryFetchMetadata.statusCode, 403);

  if (prevPublic === undefined) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = prevPublic;
  if (prevAdmin === undefined) delete process.env.ADMIN_ORIGIN; else process.env.ADMIN_ORIGIN = prevAdmin;
});


test('CF-Connecting-IP é ignorado por padrão mesmo em modo Cloudflare', () => {
  const prevMode = process.env.TRUST_PROXY_MODE;
  const prevClient = process.env.TRUST_CLIENT_IP_HEADER;
  process.env.TRUST_PROXY_MODE = 'cloudflare';
  process.env.TRUST_CLIENT_IP_HEADER = 'false';

  const req = {
    headers: { 'cf-connecting-ip': '203.0.113.99' },
    socket: { remoteAddress: '10.0.0.5' }
  };
  assert.equal(clientAddress(req), '10.0.0.5');

  process.env.TRUST_CLIENT_IP_HEADER = 'true';
  assert.equal(clientAddress(req), '203.0.113.99');

  if (prevMode === undefined) delete process.env.TRUST_PROXY_MODE; else process.env.TRUST_PROXY_MODE = prevMode;
  if (prevClient === undefined) delete process.env.TRUST_CLIENT_IP_HEADER; else process.env.TRUST_CLIENT_IP_HEADER = prevClient;
});


test('hosts canônicos ignoram protocolo encaminhado contraditório', () => {
  const prevPublic = process.env.PUBLIC_ORIGIN;
  const prevAdmin = process.env.ADMIN_ORIGIN;
  const prevProxy = process.env.TRUST_PROXY_MODE;

  process.env.PUBLIC_ORIGIN = 'https://www.gisley.test';
  process.env.ADMIN_ORIGIN = 'https://painel.gisley.test';
  process.env.TRUST_PROXY_MODE = 'cloudflare';

  const publicReq = mockRequest({ host: 'www.gisley.test', proto: 'http' });
  const adminReq = mockRequest({ host: 'painel.gisley.test', proto: 'http' });

  assert.equal(requestHostOrigin(publicReq), 'https://www.gisley.test');
  assert.equal(requestHostOrigin(adminReq), 'https://painel.gisley.test');

  if (prevPublic === undefined) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = prevPublic;
  if (prevAdmin === undefined) delete process.env.ADMIN_ORIGIN; else process.env.ADMIN_ORIGIN = prevAdmin;
  if (prevProxy === undefined) delete process.env.TRUST_PROXY_MODE; else process.env.TRUST_PROXY_MODE = prevProxy;
});

test('Host público não pode virar origem administrativa por X-Forwarded-Proto', () => {
  const prevPublic = process.env.PUBLIC_ORIGIN;
  const prevAdmin = process.env.ADMIN_ORIGIN;
  const prevProxy = process.env.TRUST_PROXY_MODE;

  process.env.PUBLIC_ORIGIN = 'https://www.gisley.test';
  process.env.ADMIN_ORIGIN = 'https://painel.gisley.test';
  process.env.TRUST_PROXY_MODE = 'cloudflare';

  const req = mockRequest({ host: 'www.gisley.test', proto: 'https' });
  assert.equal(requestHostOrigin(req), 'https://www.gisley.test');
  assert.notEqual(requestHostOrigin(req), 'https://painel.gisley.test');

  if (prevPublic === undefined) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = prevPublic;
  if (prevAdmin === undefined) delete process.env.ADMIN_ORIGIN; else process.env.ADMIN_ORIGIN = prevAdmin;
  if (prevProxy === undefined) delete process.env.TRUST_PROXY_MODE; else process.env.TRUST_PROXY_MODE = prevProxy;
});


test('Origin null é rejeitada em mutações com origem canônica configurada', () => {
  const prevPublic = process.env.PUBLIC_ORIGIN;
  process.env.PUBLIC_ORIGIN = 'https://www.gisley.test';

  const result = middlewareResult(requireSameOrigin, originRequest({
    originalUrl: '/api/contact',
    host: 'www.gisley.test',
    origin: 'null',
    fetchSite: 'same-origin'
  }));

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.deepEqual(result.body, { error: 'CROSS_SITE_REQUEST_BLOCKED' });

  if (prevPublic === undefined) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = prevPublic;
});

test('same-site não é aceito como same-origin mesmo com Origin correto', () => {
  const prevAdmin = process.env.ADMIN_ORIGIN;
  process.env.ADMIN_ORIGIN = 'https://painel.gisley.test';

  const result = middlewareResult(requireSameOrigin, originRequest({
    originalUrl: '/api/admin/site',
    host: 'painel.gisley.test',
    origin: 'https://painel.gisley.test',
    fetchSite: 'same-site'
  }));

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);

  if (prevAdmin === undefined) delete process.env.ADMIN_ORIGIN; else process.env.ADMIN_ORIGIN = prevAdmin;
});

test('callback OAuth no domínio público não é redirecionado nem processado', () => {
  const prevAdmin = process.env.ADMIN_ORIGIN;
  const prevPublic = process.env.PUBLIC_ORIGIN;
  process.env.ADMIN_ORIGIN = 'https://painel.gisley.test';
  process.env.PUBLIC_ORIGIN = 'https://www.gisley.test';

  const req = originRequest({
    method: 'GET',
    host: 'www.gisley.test',
    originalUrl: '/api/auth/callback?code=abc&state=xyz',
    origin: '',
    fetchSite: 'none'
  });
  const result = middlewareResult(requireAdminOrigin, req);

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 404);
  assert.deepEqual(result.body, { error: 'NOT_FOUND' });

  if (prevAdmin === undefined) delete process.env.ADMIN_ORIGIN; else process.env.ADMIN_ORIGIN = prevAdmin;
  if (prevPublic === undefined) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = prevPublic;
});


test('admin GET rejeita same-site/cross-site mesmo sem mutação', () => {
  const prevAdmin = process.env.ADMIN_ORIGIN;
  process.env.ADMIN_ORIGIN = 'https://painel.gisley.test';

  for (const fetchSite of ['same-site', 'cross-site']) {
    const result = middlewareResult(requireAdminRequestContext, originRequest({
      method: 'GET',
      host: 'painel.gisley.test',
      originalUrl: '/api/admin/session',
      fetchSite,
      secure: true
    }));

    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.body, { error: 'CROSS_SITE_REQUEST_BLOCKED' });
  }

  for (const fetchSite of ['same-origin', 'none', '']) {
    const result = middlewareResult(requireAdminRequestContext, originRequest({
      method: 'GET',
      host: 'painel.gisley.test',
      originalUrl: '/api/admin/session',
      fetchSite,
      secure: true
    }));
    assert.equal(result.nextCalled, true, fetchSite || 'header ausente');
  }

  if (prevAdmin === undefined) delete process.env.ADMIN_ORIGIN;
  else process.env.ADMIN_ORIGIN = prevAdmin;
});

test('admin request context falha fechado no host público', () => {
  const prevAdmin = process.env.ADMIN_ORIGIN;
  const prevPublic = process.env.PUBLIC_ORIGIN;
  process.env.ADMIN_ORIGIN = 'https://painel.gisley.test';
  process.env.PUBLIC_ORIGIN = 'https://www.gisley.test';

  const result = middlewareResult(requireAdminRequestContext, originRequest({
    method: 'GET',
    host: 'www.gisley.test',
    originalUrl: '/api/admin/session',
    fetchSite: 'same-origin',
    secure: true
  }));

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 404);
  assert.deepEqual(result.body, { error: 'NOT_FOUND' });

  if (prevAdmin === undefined) delete process.env.ADMIN_ORIGIN; else process.env.ADMIN_ORIGIN = prevAdmin;
  if (prevPublic === undefined) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = prevPublic;
});


test('porta HTTPS padrão explícita é aceita, mas portas divergentes são rejeitadas', () => {
  const prevPublic = process.env.PUBLIC_ORIGIN;
  const prevAdmin = process.env.ADMIN_ORIGIN;

  process.env.PUBLIC_ORIGIN = 'https://www.gisley.test';
  process.env.ADMIN_ORIGIN = 'https://painel.gisley.test';

  assert.equal(hostIsKnown(originRequest({ host: 'www.gisley.test:443' })), true);
  assert.equal(hostIsKnown(originRequest({ host: 'painel.gisley.test:443' })), true);
  assert.equal(hostIsKnown(originRequest({ host: 'www.gisley.test:444' })), false);
  assert.equal(hostIsKnown(originRequest({ host: 'painel.gisley.test:8443' })), false);

  assert.equal(
    requestHostOrigin(originRequest({ host: 'painel.gisley.test:443', secure: true })),
    'https://painel.gisley.test'
  );

  if (prevPublic === undefined) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = prevPublic;
  if (prevAdmin === undefined) delete process.env.ADMIN_ORIGIN; else process.env.ADMIN_ORIGIN = prevAdmin;
});

test('origem com porta não padrão exige exatamente a mesma porta no Host', () => {
  const prevAdmin = process.env.ADMIN_ORIGIN;
  process.env.ADMIN_ORIGIN = 'https://painel.gisley.test:8443';

  assert.equal(hostIsKnown(originRequest({ host: 'painel.gisley.test:8443' })), true);
  assert.equal(hostIsKnown(originRequest({ host: 'painel.gisley.test' })), false);
  assert.equal(hostIsKnown(originRequest({ host: 'painel.gisley.test:443' })), false);

  if (prevAdmin === undefined) delete process.env.ADMIN_ORIGIN; else process.env.ADMIN_ORIGIN = prevAdmin;
});

test('Host com lista, espaços ou sufixo malicioso não é aceito', () => {
  const prevPublic = process.env.PUBLIC_ORIGIN;
  const prevAdmin = process.env.ADMIN_ORIGIN;
  process.env.PUBLIC_ORIGIN = 'https://www.gisley.test';
  process.env.ADMIN_ORIGIN = 'https://painel.gisley.test';

  for (const host of [
    'painel.gisley.test,evil.example',
    'painel.gisley.test evil.example',
    'painel.gisley.test.evil.example',
    '.painel.gisley.test',
    'painel.gisley.test.'
  ]) {
    assert.equal(hostIsKnown(originRequest({ host })), false, host);
  }

  if (prevPublic === undefined) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = prevPublic;
  if (prevAdmin === undefined) delete process.env.ADMIN_ORIGIN; else process.env.ADMIN_ORIGIN = prevAdmin;
});


test('CSP bloqueia atributos de script, frames, workers e objetos', () => {
  const req = {};
  const headers = new Map();
  const res = {
    locals: {},
    setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); }
  };
  let nextCalled = false;
  securityHeaders(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  const csp = headers.get('content-security-policy') || '';
  assert.match(csp, /script-src-attr 'none'/);
  assert.match(csp, /frame-src 'none'/);
  assert.match(csp, /worker-src 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(csp.includes("'unsafe-eval'"), false);
  assert.equal(csp.includes("script-src 'self' 'unsafe-inline'"), false);
});


test('Host desconhecido em produção recebe 421 antes das rotas', async () => {
  const { execFileSync } = await import('node:child_process');
  const script = `
    process.env.NODE_ENV='production';
    process.env.PUBLIC_ORIGIN='https://www.gisley.test';
    process.env.ADMIN_ORIGIN='https://painel.gisley.test';
    const { requireKnownHost } = await import('./server/security.js');
    const req = {
      path: '/api/site',
      socket: { remoteAddress: '203.0.113.10' },
      get(name) { return name.toLowerCase() === 'host' ? 'evil.example' : ''; }
    };
    const result = { statusCode: 200, body: null, nextCalled: false };
    const res = {
      status(code) { result.statusCode = code; return this; },
      json(body) { result.body = body; return this; }
    };
    requireKnownHost(req, res, () => { result.nextCalled = true; });
    process.stdout.write(JSON.stringify(result));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  const result = JSON.parse(output);
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 421);
  assert.deepEqual(result.body, { error: 'MISDIRECTED_REQUEST' });
});


test('CSP não permite unsafe-inline unsafe-eval nem atributos script', () => {
  const req = { headers: {}, get() { return ''; } };
  const headers = new Map();
  const res = {
    locals: {},
    setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); }
  };
  let called = false;
  securityHeaders(req, res, () => { called = true; });

  assert.equal(called, true);
  const csp = headers.get('content-security-policy') || '';
  assert.match(csp, /script-src 'self' 'nonce-[^']+'/);
  assert.match(csp, /script-src-attr 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(csp.includes("'unsafe-inline'"), false);
  assert.equal(csp.includes("'unsafe-eval'"), false);
});
