import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../server/routes.js';

process.env.DATABASE_URL = '';
process.env.ADMIN_ORIGIN = '';
process.env.ENABLE_LEGACY_STORAGE_ROUTE = 'false';

async function withEditorServer(run) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  const editorMiddleware = (req, res, next) => {
    req.admin = {
      openId: 'editor-open-id',
      email: 'editor@gisley.test',
      name: 'Editor Teste',
      role: 'editor'
    };
    next();
  };

  registerRoutes(app, { adminMiddleware: editorMiddleware });

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

const managerOnly = [
  ['PUT', '/api/admin/site'],
  ['POST', '/api/admin/testimonials'],
  ['DELETE', '/api/admin/testimonials/testimonial-id'],
  ['DELETE', '/api/admin/leads/lead-id'],
  ['GET', '/api/admin/audit'],
  ['GET', '/api/admin/team'],
  ['POST', '/api/admin/team'],
  ['PATCH', '/api/admin/team/person%40example.com'],
  ['DELETE', '/api/admin/team/person%40example.com']
];

test('editor recebe 403 em todas as rotas exclusivas de gestor', async () => {
  await withEditorServer(async (origin) => {
    for (const [method, path] of managerOnly) {
      const headers = { Accept: 'application/json' };
      const options = { method, headers };

      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        headers.Origin = origin;
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify({});
      }

      const response = await fetch(`${origin}${path}`, options);
      assert.equal(response.status, 403, `${method} ${path} deveria exigir Gestor`);
      assert.deepEqual(await response.json(), { error: 'MANAGER_REQUIRED' });
    }
  });
});

test('método inesperado não contorna o guard administrativo do editor', async () => {
  await withEditorServer(async (origin) => {
    const response = await fetch(`${origin}/api/admin/team`, {
      method: 'PUT',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: '{}'
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'NOT_FOUND' });
  });
});
