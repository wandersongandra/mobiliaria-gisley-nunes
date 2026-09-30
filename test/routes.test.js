import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../server/routes.js';

process.env.DATABASE_URL = '';

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

    const catalog = await fetch(`${origin}/api/properties`);
    assert.equal(catalog.status, 200);
    const catalogBody = await catalog.json();
    assert.ok(Array.isArray(catalogBody.properties));
    assert.ok(catalogBody.properties.length >= 1);

    const missing = await fetch(`${origin}/api/properties/imovel-inexistente`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'NOT_FOUND' });
  });
});

test('rota de storage rejeita caminhos fora do namespace da imobiliária', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/manus-storage/outro-projeto/arquivo.jpg`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'INVALID_ASSET' });
  });
});
