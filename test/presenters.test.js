import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminProperty, publicProperty } from '../server/presenters.js';

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
    price_band: 1,
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
  assert.equal(Object.hasOwn(result, 'price_band'), false);
  assert.equal(Object.hasOwn(result.photos[0], 'id'), false);
  assert.equal(Object.hasOwn(result.photos[0], 'property_id'), false);
  assert.equal(Object.hasOwn(result.photos[0], 'storage_path'), false);
  assert.equal(result.photos[0].url, '/manus-storage/morada/properties/internal/secret.jpg');
});


test('adminProperty remove campos internos de storage sem quebrar gestão da galeria', () => {
  const result = adminProperty({
    id: 'property-id',
    slug: 'casa',
    title: 'Casa',
    location: 'Lourdes · Belo Horizonte',
    status: 'draft',
    photos: [{
      id: 'photo-id',
      property_id: 'property-id',
      storage_path: 'gisley/properties/property-id/private.jpg',
      storage_provider: 'r2',
      uploaded_by: 'editor@example.com',
      mime_type: 'image/jpeg',
      file_size: 1234,
      width: 1200,
      height: 800,
      url: 'https://media.example.com/photo.jpg',
      alt_text: 'Sala',
      sort_order: 0,
      is_cover: 1
    }]
  });

  assert.equal(result.id, 'property-id');
  assert.equal(result.photos[0].id, 'photo-id');
  assert.equal(result.photos[0].url, 'https://media.example.com/photo.jpg');
  for (const key of ['storage_path','storage_provider','uploaded_by','mime_type','file_size','width','height','property_id']) {
    assert.equal(Object.hasOwn(result.photos[0], key), false, `campo interno vazou: ${key}`);
  }
});
