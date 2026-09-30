import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContactLead, normalizePropertyInput, normalizeSiteSettings } from '../server/validation.js';

test('normalizePropertyInput limita números negativos e texto', () => {
  const data = normalizePropertyInput({ title: ' Casa Ipê ', location: 'Belvedere · Belo Horizonte', price: -10, bedrooms: 999, purpose: 'Outro' });
  assert.equal(data.title, 'Casa Ipê');
  assert.equal(data.price, 0);
  assert.equal(data.bedrooms, 50);
  assert.equal(data.purpose, 'Comprar');
});

test('normalizePropertyInput exige localização e cria preço exibido', () => {
  assert.throws(() => normalizePropertyInput({ title: 'Sem endereço' }), /LOCATION_REQUIRED/);
  const data = normalizePropertyInput({ title: 'Casa', location: 'Lourdes · Belo Horizonte', price: 2480000 });
  assert.equal(data.priceLabel, 'R$ 2.480.000');
  const rental = normalizePropertyInput({ title: 'Cobertura', location: 'Savassi · Belo Horizonte', purpose: 'Alugar', price: 18500 });
  assert.equal(rental.priceLabel, 'R$ 18.500 / mês');
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
