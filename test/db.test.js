import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProperty, getPropertyBySlug, listProperties } from '../server/db.js';

// Garante que os testes exercitem o fallback, nunca uma conexão real.
process.env.DATABASE_URL = '';

test('listProperties público retorna apenas imóveis publicados', async () => {
  const rows = await listProperties({ publicOnly: true });
  assert.ok(rows.length >= 1);
  assert.ok(rows.every((row) => row.status === 'published'));
});

test('getPropertyBySlug encontra um imóvel pelo slug', async () => {
  const row = await getPropertyBySlug('casa-ipe');
  assert.ok(row);
  assert.equal(row.slug, 'casa-ipe');
  assert.ok(Array.isArray(row.photos));
  assert.ok(row.photos.length >= 1);
});

test('getPropertyBySlug retorna null para slug inexistente', async () => {
  assert.equal(await getPropertyBySlug('imovel-inexistente'), null);
});

test('getProperty retorna null para id inexistente', async () => {
  assert.equal(await getProperty('id-inexistente'), null);
});