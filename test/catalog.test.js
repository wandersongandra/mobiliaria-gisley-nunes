import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogNeighborhood, catalogNeighborhoods, neighborhoodFromLocation, slugifyCatalogName } from '../server/catalog.js';

test('catálogo deriva bairro e slug estável a partir da localização', () => {
  assert.equal(neighborhoodFromLocation(' Lourdes  ·  Belo Horizonte '), 'Lourdes');
  assert.equal(slugifyCatalogName('São Pedro / Belo Horizonte'), 'sao-pedro-belo-horizonte');
});

test('catálogo agrupa imóveis por bairro sem duplicar entradas', () => {
  const groups = catalogNeighborhoods([
    { title: 'A', location: 'Lourdes · Belo Horizonte' },
    { title: 'B', location: 'Lourdes · Belo Horizonte' },
    { title: 'C', location: 'Savassi · Belo Horizonte' }
  ]);

  assert.deepEqual(groups.map(({ name, slug, count }) => ({ name, slug, count })), [
    { name: 'Lourdes', slug: 'lourdes', count: 2 },
    { name: 'Savassi', slug: 'savassi', count: 1 }
  ]);
  assert.equal(catalogNeighborhood([
    { title: 'A', location: 'Lourdes · Belo Horizonte' }
  ], 'lourdes').name, 'Lourdes');
  assert.equal(catalogNeighborhood([], 'lourdes'), null);
});
