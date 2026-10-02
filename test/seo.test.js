import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breadcrumbLd, collectionPageLd, escapeJsonForHtml, propertyLd, sitemapDate, websiteLd } from '../server/seo.js';

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

test('schemas de navegação e catálogo têm URLs e posições estáveis', () => {
  const breadcrumbs = breadcrumbLd([
    { name: 'Início', url: 'https://www.gisley.test/' },
    { name: 'Bairros', url: 'https://www.gisley.test/bairros' },
    { name: 'Lourdes', url: 'https://www.gisley.test/bairros/lourdes' }
  ]);
  assert.equal(breadcrumbs.itemListElement[2].position, 3);
  assert.equal(breadcrumbs.itemListElement[2].item, 'https://www.gisley.test/bairros/lourdes');

  const collection = collectionPageLd({
    name: 'Imóveis em Lourdes',
    description: 'Catálogo de imóveis.',
    url: 'https://www.gisley.test/bairros/lourdes',
    items: [{ title: 'Apartamento Solar', url: 'https://www.gisley.test/imoveis/apartamento-solar' }]
  });
  assert.equal(collection.mainEntity.numberOfItems, 1);
  assert.equal(collection.mainEntity.itemListElement[0].position, 1);
});

test('WebSite schema mantém a imobiliária como publisher', () => {
  const schema = websiteLd({ name: 'Gisley Nunes Imóveis' }, 'https://www.gisley.test');
  assert.equal(schema['@type'], 'WebSite');
  assert.equal(schema.publisher.name, 'Gisley Nunes Imóveis');
});


test('sitemapDate gera datas ISO válidas', () => {
  assert.equal(sitemapDate(new Date('2026-10-01T12:30:00Z')), '2026-10-01');
  assert.equal(sitemapDate('2026-09-30T23:59:00Z'), '2026-09-30');
  assert.equal(sitemapDate('inválido'), null);
  assert.equal(sitemapDate(null), null);
});


test('escapeJsonForHtml neutraliza fechamento de script e separadores JS', () => {
  const malicious = {
    title: '</script><script>alert("xss")</script>',
    amp: '&',
    line: '  '
  };
  const escaped = escapeJsonForHtml(malicious);

  assert.equal(escaped.includes('</script>'), false);
  assert.equal(escaped.includes('<'), false);
  assert.equal(escaped.includes('>'), false);
  assert.equal(escaped.includes('&'), false);
  assert.equal(escaped.includes(' '), false);
  assert.equal(escaped.includes(' '), false);

  const restored = JSON.parse(escaped);
  assert.equal(restored.title, malicious.title);
  assert.equal(restored.amp, '&');
  assert.equal(restored.line, malicious.line);
});
