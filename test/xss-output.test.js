import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import { escapeJsonForHtml, escapeXml } from '../server/seo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('JSON embutido neutraliza fechamento de script e separadores perigosos', () => {
  const payload = {
    title: '</script><img src=x onerror=alert(1)>',
    description: 'A&B > C < D\u2028next\u2029line'
  };
  const encoded = escapeJsonForHtml(payload);

  assert.equal(encoded.includes('</script>'), false);
  assert.equal(encoded.includes('<img'), false);
  assert.equal(encoded.includes('&'), false);
  assert.equal(encoded.includes('>'), false);
  assert.match(encoded, /\\u003c\/script\\u003e/);
  assert.match(encoded, /\\u0026/);
  assert.match(encoded, /\\u2028/);
  assert.match(encoded, /\\u2029/);

  const decoded = JSON.parse(encoded);
  assert.equal(decoded.title, payload.title);
  assert.equal(decoded.description, payload.description);
});

test('escapeXml neutraliza metacaracteres de sitemap', () => {
  assert.equal(
    escapeXml(`https://example.com/<x>?a=1&b="2"'`),
    'https://example.com/&lt;x&gt;?a=1&amp;b=&quot;2&quot;&apos;'
  );
});

test('EJS escapa dados institucionais hostis em atributos e texto', async () => {
  const malicious = '"><img src=x onerror=alert(1)>';
  const html = await ejs.renderFile(path.join(root, 'views', 'contato.ejs'), {
    page: {
      title: malicious,
      description: malicious,
      canonical: 'https://www.gisley.test/contato',
      ogImage: 'https://www.gisley.test/logo.jpg',
      ogType: 'website',
      robots: 'noindex'
    },
    site: {
      name: malicious,
      whatsapp: '553191554677',
      phoneDisplay: malicious,
      email: 'contato@example.com',
      address: malicious,
      crci: '',
      area: malicious,
      instagramUrl: '',
      instagramDisplay: ''
    },
    testimonials: [],
    assets: { js: '/assets/main.js', css: '/assets/main.css' },
    siteLd: escapeJsonForHtml({ name: malicious }),
    pageLd: '',
    cspNonce: 'nonce-test'
  }, { root: path.join(root, 'views') });

  assert.equal(html.includes('<img src=x onerror=alert(1)>'), false);
  assert.equal(html.includes('"><img src=x'), false);
  assert.match(html, /(?:&quot;|&#34;)&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('templates não possuem slot genérico de HTML bruto no head', async () => {
  const head = await import('node:fs/promises').then((fs) => fs.readFile(path.join(root, 'views', 'partials', 'head.ejs'), 'utf8'));
  assert.equal(head.includes('extraHead'), false);
  assert.equal(head.includes('<%- pageLd %>'), true);
  assert.equal(head.includes('<%- siteLd %>'), true);
});
