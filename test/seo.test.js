import { test } from 'node:test';
import assert from 'node:assert/strict';
import { propertyLd, sitemapDate } from '../server/seo.js';

test('propertyLd omite oferta quando preço é desconhecido', () => {
  const ld = propertyLd({
    slug: 'casa-sem-preco',
    title: 'Casa sem preço',
    city: 'Belo Horizonte',
    price: 0,
    purpose: 'Comprar'
  }, 'https://www.gisley.test');
  assert.equal(Object.hasOwn(ld, 'offers'), false);
});

test('propertyLd representa aluguel com preço mensal', () => {
  const ld = propertyLd({
    slug: 'cobertura',
    title: 'Cobertura',
    city: 'Belo Horizonte',
    price: 18500,
    purpose: 'Alugar'
  }, 'https://www.gisley.test');

  assert.equal(ld.offers.price, 18500);
  assert.equal(ld.offers.priceCurrency, 'BRL');
  assert.equal(ld.offers.priceSpecification.unitText, 'MONTH');
  assert.equal(ld.offers.priceSpecification.price, 18500);
});


test('sitemapDate gera datas ISO válidas', () => {
  assert.equal(sitemapDate(new Date('2026-10-01T12:30:00Z')), '2026-10-01');
  assert.equal(sitemapDate('2026-09-30T23:59:00Z'), '2026-09-30');
  assert.equal(sitemapDate('inválido'), null);
  assert.equal(sitemapDate(null), null);
});
