import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicProperty } from '../server/presenters.js';

test('publicProperty remove identificadores e caminhos internos', () => {
  const result = publicProperty({
    id: 'internal-property-id',
    slug: 'casa-teste',
    title: 'Casa Teste',
    location: 'Lourdes · Belo Horizonte',
    city: 'Belo Horizonte',
    purpose: 'Comprar',
    type: 'Casa',
    price: 1000000,
    price_label: 'R$ 1.000.000',
    photos: [{
      id: 'internal-photo-id',
      property_id: 'internal-property-id',
      storage_path: 'morada/properties/internal/secret.jpg',
      url: '/manus-storage/morada/properties/internal/secret.jpg',
      alt_text: 'Sala',
      sort_order: 0,
      is_cover: 1
    }]
  });

  assert.equal(result.slug, 'casa-teste');
  assert.equal(Object.hasOwn(result, 'id'), false);
  assert.equal(Object.hasOwn(result.photos[0], 'id'), false);
  assert.equal(Object.hasOwn(result.photos[0], 'property_id'), false);
  assert.equal(Object.hasOwn(result.photos[0], 'storage_path'), false);
  assert.equal(result.photos[0].url, '/manus-storage/morada/properties/internal/secret.jpg');
});
