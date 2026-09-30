import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import { build } from 'vite';
import { seedRows } from '../server/seed.js';
import { escapeLd, organizationLd, propertyLd } from '../server/seo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist-preview');
const previewOrigin = process.env.PREVIEW_ORIGIN || 'https://preview.gisleynunes.invalid';

const site = {
  name: 'Gisley Nunes Imóveis',
  crci: '0052305',
  area: 'Belo Horizonte e região',
  address: 'Belo Horizonte, MG',
  phoneDisplay: '(31) 9155-4677',
  whatsapp: '553191554677',
  email: 'Gisleynunesimoveis@gmail.com',
  instagramDisplay: '@gisleynunesimoveis',
  instagramUrl: 'https://instagram.com/gisleynunesimoveis'
};

const testimonials = [
  {
    id: 'preview-testimonial-1',
    author: 'Marina & André',
    quote: 'O cuidado da Gisley Nunes foi muito além da negociação. Eles entenderam o que a gente procurava antes mesmo de a gente conseguir colocar em palavras.',
    location: 'Casa em Belvedere',
    year: '2024'
  }
];

function page({ title, description, pathname, ogImage }) {
  return {
    title,
    description,
    canonical: `${previewOrigin}${pathname}`,
    ogImage: ogImage || `${previewOrigin}/images/gisley-nunes-imoveis-logo.jpeg`,
    ogType: 'website'
  };
}

async function render(template, destination, locals) {
  const html = await ejs.renderFile(path.join(root, 'views', template), {
    ...locals,
    site,
    testimonials,
    cspNonce: 'preview',
    siteLd: escapeLd(organizationLd(site, previewOrigin))
  }, { async: false });
  const target = path.join(outDir, destination);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html, 'utf8');
}

await rm(outDir, { recursive: true, force: true });
await build({
  configFile: path.join(root, 'vite.config.js'),
  build: { outDir, emptyOutDir: true }
});

const manifest = JSON.parse(await readFile(path.join(outDir, '.vite', 'manifest.json'), 'utf8'));
const entry = manifest['src/main.js'];
if (!entry?.file) throw new Error('PREVIEW_MANIFEST_ENTRY_NOT_FOUND');
const assets = {
  js: '/' + entry.file,
  css: entry.css?.[0] ? '/' + entry.css[0] : ''
};

const properties = seedRows().filter((item) => item.status === 'published');

await render('home.ejs', 'index.html', {
  assets,
  page: page({
    title: 'Gisley Nunes Imóveis — preview de design',
    description: 'Preview visual do site Gisley Nunes Imóveis.',
    pathname: '/'
  })
});

await render('imoveis.ejs', 'imoveis/index.html', {
  assets,
  page: page({
    title: 'Imóveis — Gisley Nunes Imóveis',
    description: 'Catálogo de imóveis selecionados em Belo Horizonte e região.',
    pathname: '/imoveis'
  })
});

await render('sobre.ejs', 'sobre/index.html', {
  assets,
  page: page({
    title: 'Sobre — Gisley Nunes Imóveis',
    description: 'Conheça a proposta de atendimento e curadoria da Gisley Nunes.',
    pathname: '/sobre'
  })
});

await render('contato.ejs', 'contato/index.html', {
  assets,
  page: page({
    title: 'Contato — Gisley Nunes Imóveis',
    description: 'Fale com a Gisley Nunes Imóveis.',
    pathname: '/contato'
  })
});

await render('privacidade.ejs', 'privacidade/index.html', {
  assets,
  page: page({
    title: 'Política de privacidade — Gisley Nunes Imóveis',
    description: 'Política de privacidade da Gisley Nunes Imóveis.',
    pathname: '/privacidade'
  })
});

for (const property of properties) {
  const propertyJson = JSON.stringify(property).replace(/</g, '\\u003c');
  await render('imovel.ejs', `imoveis/${property.slug}/index.html`, {
    assets,
    property,
    propertyJson,
    extraHead: `<script nonce="preview" type="application/ld+json">${escapeLd(propertyLd(property, previewOrigin))}</script>`,
    page: page({
      title: `${property.title} — Gisley Nunes Imóveis`,
      description: property.description || `Conheça ${property.title} em ${property.location}.`,
      pathname: `/imoveis/${property.slug}`,
      ogImage: property.cover_url
    })
  });
}

await render('404.ejs', '404.html', {
  assets,
  page: page({
    title: 'Página não encontrada — Gisley Nunes Imóveis',
    description: 'A página procurada não foi encontrada.',
    pathname: '/404'
  })
});

await mkdir(path.join(outDir, 'api', 'properties'), { recursive: true });
await writeFile(path.join(outDir, 'api', 'properties', 'index.html'), JSON.stringify({ properties }), 'utf8');
await mkdir(path.join(outDir, 'api', 'site'), { recursive: true });
await writeFile(path.join(outDir, 'api', 'site', 'index.html'), JSON.stringify({ site }), 'utf8');

await writeFile(path.join(outDir, '_headers'), `/*
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`, 'utf8');

console.log(`[preview] generated ${properties.length + 6} pages in dist-preview`);
