import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../server/routes.js';

process.env.DATABASE_URL = '';
process.env.ADMIN_ORIGIN = '';

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

const protectedAdminRoutes = [
  ['GET', '/api/admin/properties'],
  ['POST', '/api/admin/properties'],
  ['GET', '/api/admin/properties/property-id'],
  ['PUT', '/api/admin/properties/property-id'],
  ['DELETE', '/api/admin/properties/property-id'],
  ['POST', '/api/admin/uploads/presign'],
  ['POST', '/api/admin/properties/property-id/photos'],
  ['GET', '/api/admin/photos/photo-id/media'],
  ['DELETE', '/api/admin/photos/photo-id'],
  ['PUT', '/api/admin/properties/property-id/photos/order'],
  ['PUT', '/api/admin/photos/photo-id/cover'],
  ['GET', '/api/admin/site'],
  ['PUT', '/api/admin/site'],
  ['POST', '/api/admin/testimonials'],
  ['DELETE', '/api/admin/testimonials/testimonial-id'],
  ['GET', '/api/admin/leads'],
  ['PATCH', '/api/admin/leads/lead-id'],
  ['DELETE', '/api/admin/leads/lead-id'],
  ['GET', '/api/admin/audit'],
  ['GET', '/api/admin/team'],
  ['POST', '/api/admin/team'],
  ['PATCH', '/api/admin/team/editor%40example.com'],
  ['DELETE', '/api/admin/team/editor%40example.com']
];

test('toda rota administrativa conhecida bloqueia acesso sem sessão', async () => {
  await withServer(async (origin) => {
    for (const [method, path] of protectedAdminRoutes) {
      const headers = { Accept: 'application/json' };
      const options = { method, headers };

      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        headers.Origin = origin;
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify({});
      }

      const response = await fetch(`${origin}${path}`, options);
      assert.equal(
        response.status,
        401,
        `${method} ${path} deveria bloquear anônimo antes da lógica de negócio`
      );
      assert.deepEqual(
        await response.json(),
        { error: 'AUTH_REQUIRED', login: true },
        `${method} ${path} retornou contrato inesperado`
      );
    }
  });
});

test('logout global exige sessão autenticada', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/auth/logout-all`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}'
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'AUTH_REQUIRED', login: true });
  });
});

test('sonda de sessão é a única exceção anônima sob /api/admin', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/admin/session`, {
      headers: { Accept: 'application/json' }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      authenticated: false,
      user: null
    });
    assert.match(response.headers.get('cache-control') || '', /no-store/i);
  });
});

test('métodos não suportados em API não executam comportamento alternativo', async () => {
  await withServer(async (origin) => {
    const publicWrongMethod = await fetch(`${origin}/api/properties`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(publicWrongMethod.status, 404);
    assert.deepEqual(await publicWrongMethod.json(), { error: 'NOT_FOUND' });

    const adminWrongMethod = await fetch(`${origin}/api/admin/properties/property-id`, {
      method: 'PATCH',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(adminWrongMethod.status, 401);
    assert.deepEqual(await adminWrongMethod.json(), { error: 'AUTH_REQUIRED', login: true });
  });
});


test('logout administrativo exige mesma origem e é idempotente', async () => {
  await withServer(async (origin) => {
    const blocked = await fetch(`${origin}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    assert.equal(blocked.status, 403);
    assert.deepEqual(await blocked.json(), { error: 'CROSS_SITE_REQUEST_BLOCKED' });

    const allowed = await fetch(`${origin}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { ok: true });
    assert.match(allowed.headers.get('cache-control') || '', /no-store/i);
    assert.match(allowed.headers.get('set-cookie') || '', /gisley_admin_session=/i);
  });
});


test('preflight cross-origin não recebe CORS administrativo permissivo', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/admin/site`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
        'Sec-Fetch-Site': 'cross-site'
      }
    });

    assert.ok([401, 403, 404].includes(response.status));
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
  });
});
