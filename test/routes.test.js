import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../server/routes.js';

process.env.DATABASE_URL = '';
process.env.ENABLE_LEGACY_STORAGE_ROUTE = 'false';

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  registerRoutes(app);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('rotas públicas essenciais respondem com contrato esperado', async () => {
  await withServer(async (origin) => {
    const health = await fetch(`${origin}/_app/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, service: 'morada' });

    const ready = await fetch(`${origin}/_app/ready`);
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { ok: false });

    const catalog = await fetch(`${origin}/api/properties`);
    assert.equal(catalog.status, 200);
    const catalogBody = await catalog.json();
    assert.ok(Array.isArray(catalogBody.properties));
    assert.ok(catalogBody.properties.length >= 1);

    const missing = await fetch(`${origin}/api/properties/imovel-inexistente`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'NOT_FOUND' });

    const unknownApi = await fetch(`${origin}/api/rota-inexistente`);
    assert.equal(unknownApi.status, 404);
    assert.deepEqual(await unknownApi.json(), { error: 'NOT_FOUND' });
  });
});

test('rotas administrativas e mutações bloqueiam acesso indevido', async () => {
  await withServer(async (origin) => {
    const admin = await fetch(`${origin}/api/admin/properties`);
    assert.equal(admin.status, 401);
    assert.deepEqual(await admin.json(), { error: 'AUTH_REQUIRED', login: true });

    const crossSite = await fetch(`${origin}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', message: 'Olá' })
    });
    assert.equal(crossSite.status, 403);
    assert.deepEqual(await crossSite.json(), { error: 'CROSS_SITE_REQUEST_BLOCKED' });

    const bot = await fetch(`${origin}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ name: 'Bot', email: 'bot@example.com', message: 'spam', website: 'https://spam.example' })
    });
    assert.equal(bot.status, 201);
    assert.deepEqual(await bot.json(), { ok: true });

    const legitimate = await fetch(`${origin}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', message: 'Tenho interesse', interest: 'Quero comprar um imóvel' })
    });
    assert.equal(legitimate.status, 503);
    assert.deepEqual(await legitimate.json(), { error: 'CONTACT_UNAVAILABLE' });
  });
});

test('rota pública de storage legado fica desativada por padrão', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/manus-storage/morada/properties/antigo/arquivo.jpg`);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('location'), null);
  });
});


test('rotas de autenticação usam no-store e logout global exige sessão válida', async () => {
  await withServer(async (origin) => {
    const previousProxyMode = process.env.TRUST_PROXY_MODE;
    const previousClientIpTrust = process.env.TRUST_CLIENT_IP_HEADER;
    process.env.TRUST_PROXY_MODE = 'cloudflare';
    process.env.TRUST_CLIENT_IP_HEADER = 'true';
    const testClientIp = '198.51.100.17';

    try {
      const logoutAll = await fetch(`${origin}/api/auth/logout-all`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'CF-Connecting-IP': testClientIp,
          Accept: 'application/json'
        }
      });
      assert.equal(logoutAll.status, 401);
      assert.deepEqual(await logoutAll.json(), { error: 'AUTH_REQUIRED', login: true });
      assert.match(logoutAll.headers.get('cache-control') || '', /no-store/i);
      assert.equal(logoutAll.headers.get('referrer-policy'), 'no-referrer');

      const probe = await fetch(`${origin}/api/admin/session`, {
        headers: { Accept: 'application/json', 'CF-Connecting-IP': testClientIp }
      });
      const probeBody = await probe.json();
      const csrfToken = probeBody.csrfToken;
      const csrfCookie = (probe.headers.get('set-cookie') || '').split(';')[0];

      const logout = await fetch(`${origin}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'CF-Connecting-IP': testClientIp,
          Accept: 'application/json',
          Cookie: csrfCookie,
          'X-CSRF-Token': csrfToken
        }
      });
      assert.equal(logout.status, 200);
      assert.deepEqual(await logout.json(), { ok: true });
      assert.match(logout.headers.get('cache-control') || '', /no-store/i);
      assert.equal(logout.headers.get('referrer-policy'), 'no-referrer');

      const remainingAllowed = await Promise.all(Array.from({ length: 58 }, () => fetch(`${origin}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'CF-Connecting-IP': testClientIp,
          Accept: 'application/json',
          Cookie: csrfCookie,
          'X-CSRF-Token': csrfToken
        }
      })));
      assert.ok(remainingAllowed.every((response) => response.status === 200));

      const rateLimited = await fetch(`${origin}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'CF-Connecting-IP': testClientIp,
          Accept: 'application/json',
          Cookie: csrfCookie,
          'X-CSRF-Token': csrfToken
        }
      });
      assert.equal(rateLimited.status, 429);
      assert.equal((await rateLimited.json()).error, 'RATE_LIMITED');
    } finally {
      if (previousProxyMode === undefined) delete process.env.TRUST_PROXY_MODE;
      else process.env.TRUST_PROXY_MODE = previousProxyMode;
      if (previousClientIpTrust === undefined) delete process.env.TRUST_CLIENT_IP_HEADER;
      else process.env.TRUST_CLIENT_IP_HEADER = previousClientIpTrust;
    }
  });
});


test('cookie administrativo inválido é limpo pela sonda de sessão', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/admin/session`, {
      headers: {
        Accept: 'application/json',
        Cookie: 'gisley_admin_session=token-invalido'
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.authenticated, false);
    assert.equal(body.user, null);
    assert.match(body.csrfToken, /^[A-Za-z0-9_-]{43}$/);

    const setCookie = response.headers.get('set-cookie') || '';
    assert.match(setCookie, /gisley_admin_session=/);
    assert.match(setCookie, /Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });
});


test('API rejeita body não JSON antes da lógica de negócio', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/contact`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'text/plain',
        Accept: 'application/json'
      },
      body: 'name=Ana&email=ana@example.com'
    });

    assert.equal(response.status, 415);
    assert.deepEqual(await response.json(), { error: 'UNSUPPORTED_MEDIA_TYPE' });
  });
});

test('API aceita logout sem body quando CSRF é válido', async () => {
  await withServer(async (origin) => {
    const probe = await fetch(`${origin}/api/admin/session`, { headers: { Accept: 'application/json' } });
    const probeBody = await probe.json();
    const csrfCookie = (probe.headers.get('set-cookie') || '').split(';')[0];

    const response = await fetch(`${origin}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Origin: origin,
        Accept: 'application/json',
        Cookie: csrfCookie,
        'X-CSRF-Token': probeBody.csrfToken
      }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });
});


test('mídia R2 não é exposta sem vínculo publicado no banco', async () => {
  await withServer(async (origin) => {
    const response = await fetch(
      `${origin}/media/gisley/properties/property-id/foto.webp`,
      { redirect: 'manual', headers: { Accept: 'image/webp' } }
    );
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('location'), null);
  });
});
