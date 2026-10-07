import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminProperty, publicProperty, staffInvitationView } from '../server/presenters.js';

test('staffInvitationView não expõe token ou hash de convite', () => {
  const result = staffInvitationView({
    token_hash: 'a'.repeat(64),
    email: 'editor@example.com',
    name: 'Editor',
    role: 'editor',
    invited_by: 'gestor@example.com',
    expires_at_ms: '1790000000000',
    created_at: '2026-10-02T12:00:00.000Z'
  });

  assert.equal(result.email, 'editor@example.com');
  assert.equal(result.expires_at_ms, 1790000000000);
  assert.equal(Object.hasOwn(result, 'token_hash'), false);
  assert.equal(Object.hasOwn(result, 'invitation_token'), false);
});

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
  assert.equal(result.photos[0].url, '/api/admin/photos/photo-id/media');
  assert.equal(result.cover_url, '/api/admin/photos/photo-id/media');
  for (const key of ['storage_path','storage_provider','uploaded_by','mime_type','file_size','width','height','property_id']) {
    assert.equal(Object.hasOwn(result.photos[0], key), false, `campo interno vazou: ${key}`);
  }
});


test('adminProperty mantém metadados internos de storage fora da resposta', () => {
  const result = adminProperty({
    id: 'property-id',
    slug: 'casa-teste',
    title: 'Casa Teste',
    status: 'draft',
    photos: [{
      id: 'photo-id',
      property_id: 'property-id',
      storage_path: 'gisley/properties/property-id/private.webp',
      storage_provider: 'r2',
      mime_type: 'image/webp',
      file_size: 123456,
      width: 1600,
      height: 1200,
      uploaded_by: 'editor@gisley.test',
      url: 'https://media.gisley.test/gisley/properties/property-id/private.webp',
      alt_text: 'Sala',
      sort_order: 0,
      is_cover: 1,
      created_at: '2026-10-01T12:00:00.000Z'
    }]
  });

  const photo = result.photos[0];
  for (const key of [
    'property_id',
    'storage_path',
    'storage_provider',
    'mime_type',
    'file_size',
    'width',
    'height',
    'uploaded_by'
  ]) {
    assert.equal(Object.hasOwn(photo, key), false, key);
  }
  assert.equal(photo.id, 'photo-id');
  assert.equal(photo.url, '/api/admin/photos/photo-id/media');
});


test('presenters rejeitam esquemas de mídia inseguros', () => {
  const malicious = publicProperty({
    slug: 'teste',
    title: 'Teste',
    cover_url: 'javascript:alert(1)',
    photos: [
      { url: 'data:image/svg+xml,<svg onload=alert(1)>', alt_text: 'x' },
      { url: 'http://inseguro.example/foto.jpg', alt_text: 'y' },
      { url: 'https://media.gisley.test/foto.webp', alt_text: 'z' },
      { url: '/media/gisley/properties/id/foto.webp', alt_text: 'w' }
    ]
  });

  assert.equal(malicious.cover_url, '');
  assert.equal(malicious.photos[0].url, '');
  assert.equal(malicious.photos[1].url, '');
  assert.equal(malicious.photos[2].url, 'https://media.gisley.test/foto.webp');
  assert.equal(malicious.photos[3].url, '/media/gisley/properties/id/foto.webp');
});
