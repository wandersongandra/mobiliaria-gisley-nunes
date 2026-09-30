import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContactLead, normalizePropertyInput, normalizeSiteSettings } from '../server/validation.js';

test('normalizePropertyInput limita números negativos e texto', () => {
  const data = normalizePropertyInput({ title: ' Casa Ipê ', price: -10, bedrooms: 999, purpose: 'Outro' });
  assert.equal(data.title, 'Casa Ipê');
  assert.equal(data.price, 0);
  assert.equal(data.bedrooms, 50);
  assert.equal(data.purpose, 'Comprar');
});

test('normalizeSiteSettings bloqueia URL fora do Instagram', () => {
  assert.throws(() => normalizeSiteSettings({ instagramUrl: 'javascript:alert(1)' }), /INVALID_INSTAGRAM_URL/);
  assert.throws(() => normalizeSiteSettings({ instagramUrl: 'https://example.com/a' }), /INVALID_INSTAGRAM_URL/);
});

test('normalizeContactLead exige e-mail válido e mensagem', () => {
  assert.throws(() => normalizeContactLead({ name: 'Ana', email: 'invalido', message: 'Olá' }), /INVALID_CONTACT/);
  const data = normalizeContactLead({ name: 'Ana', email: 'ANA@EXAMPLE.COM', message: 'Tenho interesse', interest: 'Quero comprar um imóvel' });
  assert.equal(data.email, 'ana@example.com');
  assert.equal(data.interest, 'Quero comprar um imóvel');
});
