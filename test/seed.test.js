import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoProperties, priceBand, seedRows } from '../server/seed.js';

test('priceBand classifica corretamente por faixa de preço', () => {
  assert.equal(priceBand(0), 1);
  assert.equal(priceBand(1499999), 1);
  assert.equal(priceBand(1500000), 2);
  assert.equal(priceBand(3000000), 2);
  assert.equal(priceBand(3000001), 3);
});

test('seedRows retorna imóveis no formato do banco', () => {
  const rows = seedRows();
  assert.equal(rows.length, demoProperties.length);
  assert.ok(rows.length > 0);

  const first = rows[0];
  assert.ok(first.id);
  assert.ok(first.slug);
  assert.ok(first.price_label);
  assert.equal(first.price_band, priceBand(first.price));
  assert.ok(Array.isArray(first.photos));
  assert.ok(first.photos.length >= 1);
  assert.equal(first.photos[0].is_cover, 1);

  // Campos adicionados na Fase 5 devem estar presentes e serem numéricos.
  assert.equal(typeof first.suites, 'number');
  assert.equal(typeof first.parking_spots, 'number');
  assert.equal(typeof first.condo_fee, 'number');
  assert.equal(typeof first.iptu, 'number');
});