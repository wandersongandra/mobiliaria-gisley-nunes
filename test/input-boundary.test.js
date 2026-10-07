import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../server/routes.js';
import { apiErrorHandler } from '../server/errors.js';

process.env.DATABASE_URL = '';
process.env.ADMIN_ORIGIN = '';
process.env.ENABLE_LEGACY_STORAGE_ROUTE = 'false';

async function withServer(run) {
  const app = express();
  app.use(express.json({ limit: '256kb', type: 'application/json' }));
  app.use(cookieParser());
  registerRoutes(app);
  app.use(apiErrorHandler);

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

test('JSON malformado recebe contrato 400 estável', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/contact`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: '{"name":"Ana",'
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'INVALID_JSON' });
  });
});

test('payload acima de 256 KB é rejeitado antes da lógica de negócio', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/contact`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        name: 'Ana',
        email: 'ana@example.com',
        message: 'x'.repeat(300 * 1024)
      })
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'PAYLOAD_TOO_LARGE' });
  });
});

test('body com tipo não JSON é rejeitado com 415', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/contact`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'text/plain',
        Accept: 'application/json'
      },
      body: 'name=Ana'
    });

    assert.equal(response.status, 415);
    assert.deepEqual(await response.json(), { error: 'UNSUPPORTED_MEDIA_TYPE' });
  });
});
