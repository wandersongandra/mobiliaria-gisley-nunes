import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import { build } from 'vite';
import { seedRows } from '../server/seed.js';
import { catalogNeighborhoods } from '../server/catalog.js';
import { breadcrumbLd, collectionPageLd, escapeJsonForHtml, escapeLd, escapeXml, organizationLd, propertyLd, sitemapDate, websiteLd } from '../server/seo.js';
import { publicProperty } from '../server/presenters.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist-preview');
const previewOrigin = process.env.PREVIEW_ORIGIN || 'https://mobiliaria-gisley-nunes.gandratecnologia.workers.dev';

const site = {
  name: 'Gisley Nunes Imóveis',
  crci: '',
  area: 'Belo Horizonte e região',
  address: 'Belo Horizonte, MG',
  phoneDisplay: '(31) 9155-4677',
  whatsapp: '553191554677',
  email: 'Gisleynunesimoveis@gmail.com',
  instagramDisplay: '',
  instagramUrl: ''
};

const testimonials = [];

function page({ title, description, pathname, ogImage }) {
  return {
    title,
    description,
    canonical: `${previewOrigin}${pathname}`,
    ogImage: ogImage || `${previewOrigin}/images/gisley-nunes-imoveis-logo.jpeg`,
    ogType: 'website',
    robots: 'noindex,nofollow,noarchive'
  };
}

async function render(template, destination, locals) {
  const html = await ejs.renderFile(path.join(root, 'views', template), {
    ...locals,
    site,
    testimonials,
    cspNonce: 'preview',
    siteLd: escapeLd(organizationLd(site, previewOrigin)),
    websiteLd: escapeLd(websiteLd(site, previewOrigin))
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

const previewGallery = {
  'apartamento-solar': [
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=1600&q=88'
  ],
  'casa-ipe': [
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=88'
  ],
  'cobertura-horizonte': [
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1600&q=88'
  ],
  'loft-harmonia': [
    'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=1600&q=88'
  ],
  'casa-cedro': [
    'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=88'
  ],
  'apartamento-mirante': [
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=88',
    'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=1600&q=88'
  ]
};

const properties = seedRows()
  .filter((item) => item.status === 'published')
  .map((item) => {
    const urls = previewGallery[item.slug] || [item.cover_url];
    return publicProperty({
      ...item,
      photos: urls.map((url, index) => ({
        id: `preview-${item.slug}-${index + 1}`,
        property_id: item.id,
        storage_path: `preview/${item.slug}/${index + 1}`,
        url,
        alt_text: `${item.title} — foto ${index + 1}`,
        sort_order: index,
        is_cover: index === 0 ? 1 : 0,
        created_at: null
      }))
    });
  });

const neighborhoods = catalogNeighborhoods(properties);

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

await render('servicos.ejs', 'servicos/index.html', {
  assets,
  page: page({
    title: 'Serviços imobiliários — Gisley Nunes Imóveis',
    description: 'Compre, alugue ou anuncie um imóvel com a Gisley Nunes Imóveis.',
    pathname: '/servicos'
  }),
  pageLd: escapeLd(breadcrumbLd([
    { name: 'Início', url: `${previewOrigin}/` },
    { name: 'Serviços' }
  ]))
});

await render('bairros.ejs', 'bairros/index.html', {
  assets,
  neighborhoods,
  page: page({
    title: 'Bairros em Belo Horizonte — Gisley Nunes Imóveis',
    description: 'Explore imóveis disponíveis por bairro em Belo Horizonte e região.',
    pathname: '/bairros'
  }),
  pageLd: escapeLd(collectionPageLd({
    name: 'Bairros em Belo Horizonte',
    description: 'Bairros com imóveis publicados na curadoria Gisley Nunes.',
    url: `${previewOrigin}/bairros`,
    items: neighborhoods.map((item) => ({ title: item.name, url: `${previewOrigin}/bairros/${item.slug}` }))
  }))
});

for (const neighborhood of neighborhoods) {
  const neighborhoodUrl = `${previewOrigin}/bairros/${neighborhood.slug}`;
  await render('bairro.ejs', `bairros/${neighborhood.slug}/index.html`, {
    assets,
    neighborhood,
    page: page({
      title: `Imóveis em ${neighborhood.name}, Belo Horizonte — Gisley Nunes`,
      description: `Veja imóveis disponíveis em ${neighborhood.name}, Belo Horizonte.`,
      pathname: `/bairros/${neighborhood.slug}`
    }),
    pageLd: escapeLd([
      breadcrumbLd([
        { name: 'Início', url: `${previewOrigin}/` },
        { name: 'Bairros', url: `${previewOrigin}/bairros` },
        { name: neighborhood.name, url: neighborhoodUrl }
      ]),
      collectionPageLd({
        name: `Imóveis em ${neighborhood.name}`,
        description: `Imóveis publicados em ${neighborhood.name}, Belo Horizonte.`,
        url: neighborhoodUrl,
        items: neighborhood.properties.map((property) => ({ title: property.title, url: `${previewOrigin}/imoveis/${property.slug}` }))
      })
    ])
  });
}

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
  const propertyJson = escapeJsonForHtml(property);
  await render('imovel.ejs', `imoveis/${property.slug}/index.html`, {
    assets,
    property,
    propertyJson,
    pageLd: escapeLd(propertyLd(property, previewOrigin)),
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

const sitemapEntries = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/imoveis', priority: '0.9', changefreq: 'daily' },
  { path: '/sobre', priority: '0.5', changefreq: 'monthly' },
  { path: '/contato', priority: '0.5', changefreq: 'monthly' },
  { path: '/servicos', priority: '0.7', changefreq: 'monthly' },
  { path: '/bairros', priority: '0.7', changefreq: 'weekly' },
  { path: '/privacidade', priority: '0.1', changefreq: 'yearly' },
  ...neighborhoods.map((neighborhood) => ({ path: `/bairros/${neighborhood.slug}`, priority: '0.7', changefreq: 'weekly' })),
  ...properties.map((property) => ({
    path: `/imoveis/${property.slug}`,
    priority: '0.8',
    changefreq: 'weekly',
    lastmod: sitemapDate(property.updated_at)
  }))
];
const sitemapUrls = sitemapEntries.map((entry) => [
  `  <url><loc>${escapeXml(`${previewOrigin}${entry.path}`)}</loc>`,
  entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : '',
  `<changefreq>${escapeXml(entry.changefreq)}</changefreq><priority>${escapeXml(entry.priority)}</priority></url>`
].join('')).join('\n');
await writeFile(path.join(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}\n</urlset>\n`, 'utf8');

const llmsLines = [
  '# Gisley Nunes Imóveis',
  '',
  '> Imobiliária em Belo Horizonte e região. Curadoria de imóveis para comprar e alugar, com atendimento próximo e especializado.',
  '',
  '## Páginas',
  `- [Início](${previewOrigin}/): apresentação e imóveis em destaque.`,
  `- [Imóveis](${previewOrigin}/imoveis): catálogo completo com filtros.`,
  `- [Sobre](${previewOrigin}/sobre): história e valores.`,
  `- [Contato](${previewOrigin}/contato): canais de atendimento.`,
  `- [Serviços](${previewOrigin}/servicos): comprar, alugar ou anunciar um imóvel.`,
  `- [Bairros](${previewOrigin}/bairros): imóveis agrupados por localização.`,
  `- [Privacidade](${previewOrigin}/privacidade): política de privacidade.`,
  '',
  '## Imóveis',
  ...neighborhoods.map((neighborhood) => `- Bairro ${neighborhood.name} — ${neighborhood.count} imóveis — ${previewOrigin}/bairros/${neighborhood.slug}`),
  ...properties.map((property) => `- ${property.title} — ${property.location} — ${property.price_label || ''} — ${previewOrigin}/imoveis/${property.slug}`)
];
await writeFile(path.join(outDir, 'llms.txt'), `${llmsLines.join('\n')}\n`, 'utf8');

await writeFile(path.join(outDir, 'robots.txt'), `User-agent: *
Disallow: /
Sitemap: ${previewOrigin}/sitemap.xml
`, 'utf8');

await writeFile(path.join(outDir, '_headers'), `/*
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`, 'utf8');

console.log(`[preview] generated ${properties.length + neighborhoods.length + 9} pages in dist-preview`);
