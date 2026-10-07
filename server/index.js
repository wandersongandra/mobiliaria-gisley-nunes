import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { assertDatabaseConfiguration, assertStorageConfiguration, configuredAdminOrigin, isProduction, port } from './config.js';
import { closePool, getPropertyBySlug, listProperties, migrate } from './db.js';
import { registerRoutes } from './routes.js';
import { assertAuthConfiguration } from './auth.js';
import { assertAssetsReady, assets } from './assets.js';
import { getSiteInfo, getTestimonials } from './site.js';
import { escapeJsonForHtml, escapeLd, escapeXml, breadcrumbLd, collectionPageLd, organizationLd, propertyLd, sitemapDate, websiteLd } from './seo.js';
import {
  assertSecurityConfiguration,
  requestHostOrigin,
  requestOrigin,
  requireKnownHost,
  securityHeaders
} from './security.js';
import { publicProperty } from './presenters.js';
import { catalogNeighborhood, catalogNeighborhoods, slugifyCatalogName } from './catalog.js';
import { apiErrorHandler } from './errors.js';
import { logOperationalError } from './operational-logging.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const app = express();

app.disable('x-powered-by');
app.set('query parser', 'simple');
app.set('view engine', 'ejs');
app.set('views', path.join(root, 'views'));
app.use(securityHeaders);
app.use(requireKnownHost);
app.use(express.json({ limit: '256kb', type: 'application/json' }));
app.use(cookieParser());

app.use('/admin', (req, res, next) => {
  const adminOrigin = configuredAdminOrigin();
  if (!adminOrigin) return next();
  if (requestHostOrigin(req) === adminOrigin) return next();
  return res.redirect(308, `${adminOrigin}${req.originalUrl}`);
});

app.use((req, res, next) => {
  const adminOrigin = configuredAdminOrigin();
  if (!adminOrigin || requestHostOrigin(req) !== adminOrigin) return next();

  const allowed = req.path.startsWith('/admin')
    || req.path.startsWith('/api/admin')
    || req.path.startsWith('/api/auth')
    || req.path.startsWith('/_app/')
    || req.path.startsWith('/media/');

  if (allowed) return next();
  if (req.method === 'GET' && req.accepts('html')) return res.redirect(302, `${adminOrigin}/admin`);
  return res.status(404).json({ error: 'NOT_FOUND' });
});

function originFrom(req) {
  return requestOrigin(req) || `http://localhost:${port}`;
}


app.use(async (req, res, next) => {
  const skipPageLocals = req.path.startsWith('/api/')
    || req.path.startsWith('/_app/')
    || req.path.startsWith('/admin')
    || req.path === '/sitemap.xml'
    || req.path === '/robots.txt'
    || req.path === '/llms.txt';
  if (skipPageLocals) return next();

  try {
    res.locals.assets = assets();
    res.locals.site = await getSiteInfo();
    res.locals.testimonials = await getTestimonials();
    res.locals.siteLd = escapeLd(organizationLd(res.locals.site, originFrom(req)));
    res.locals.websiteLd = escapeLd(websiteLd(res.locals.site, originFrom(req)));
    return next();
  } catch (error) { return next(error); }
});

registerRoutes(app);

function pageMeta(req, { title, description, path: pathname, ogImage, ogImageAlt, ogType = 'website', robots = 'index,follow,max-image-preview:large' }) {
  const origin = originFrom(req);
  return {
    title,
    description,
    canonical: `${origin}${pathname}`,
    ogImage: ogImage ? (ogImage.startsWith('http') ? ogImage : `${origin}${ogImage}`) : `${origin}/images/gisley-nunes-imoveis-logo.jpeg`,
    ogImageAlt: ogImageAlt || title,
    ogType,
    robots
  };
}

app.get('/', (req, res) => res.render('home', {
  page: pageMeta(req, {
    title: 'Imóveis em Belo Horizonte e região | Gisley Nunes',
    description: 'Encontre imóveis para comprar ou alugar em Belo Horizonte e região. Veja a seleção e fale com a Gisley Nunes.',
    path: '/'
  })
}));

app.get(['/imoveis', '/imoveis/'], (req, res) => res.render('imoveis', {
  page: pageMeta(req, {
    title: 'Imóveis para comprar ou alugar em Belo Horizonte | Gisley Nunes',
    description: 'Explore imóveis para comprar ou alugar em Belo Horizonte e região. Filtre por bairro, tipo, quartos e faixa de preço.',
    path: '/imoveis'
  })
}));

app.get('/servicos', (req, res) => res.render('servicos', {
  page: pageMeta(req, {
    title: 'Comprar, alugar ou anunciar imóveis | Gisley Nunes',
    description: 'Veja como a Gisley Nunes pode ajudar você a comprar, alugar ou anunciar um imóvel em Belo Horizonte e região.',
    path: '/servicos'
  }),
  pageLd: escapeLd(breadcrumbLd([
    { name: 'Início', url: `${originFrom(req)}/` },
    { name: 'Serviços' }
  ]))
}));

app.get('/bairros', async (req, res, next) => {
  try {
    const properties = (await listProperties({ publicOnly: true })).map(publicProperty);
    const neighborhoods = catalogNeighborhoods(properties);
    const origin = originFrom(req);
    res.render('bairros', {
      neighborhoods,
      page: pageMeta(req, {
        title: 'Bairros com imóveis em Belo Horizonte | Gisley Nunes',
        description: 'Explore bairros com imóveis publicados em Belo Horizonte e região. Encontre opções por localização e fale com a equipe.',
        path: '/bairros'
      }),
      pageLd: escapeLd(collectionPageLd({
        name: 'Bairros com imóveis em Belo Horizonte',
        description: 'Bairros com imóveis publicados pela Gisley Nunes.',
        url: `${origin}/bairros`,
        items: neighborhoods.map((item) => ({ title: item.name, url: `${origin}/bairros/${item.slug}` }))
      }))
    });
  } catch (error) { next(error); }
});

app.get('/bairros/:slug', async (req, res, next) => {
  try {
    const properties = (await listProperties({ publicOnly: true })).map(publicProperty);
    const requestedSlug = slugifyCatalogName(req.params.slug);
    const neighborhood = catalogNeighborhood(properties, requestedSlug);
    if (!neighborhood) return res.status(404).render('404', {
      page: pageMeta(req, {
        title: 'Bairro não encontrado | Gisley Nunes Imóveis',
        description: 'O bairro procurado não está disponível. Veja outros bairros e imóveis publicados.',
        path: req.path,
        robots: 'noindex,nofollow'
      })
    });

    const origin = originFrom(req);
    const neighborhoodUrl = `${origin}/bairros/${neighborhood.slug}`;
    res.render('bairro', {
      neighborhood,
      page: pageMeta(req, {
        title: `Imóveis em ${neighborhood.name}, Belo Horizonte | Gisley Nunes`,
        description: `Veja imóveis publicados em ${neighborhood.name}, Belo Horizonte, para comprar ou alugar com a Gisley Nunes.`,
        path: `/bairros/${neighborhood.slug}`
      }),
      pageLd: escapeLd([
        breadcrumbLd([
          { name: 'Início', url: `${origin}/` },
          { name: 'Bairros', url: `${origin}/bairros` },
          { name: neighborhood.name, url: neighborhoodUrl }
        ]),
        collectionPageLd({
          name: `Imóveis em ${neighborhood.name}`,
          description: `Imóveis para comprar ou alugar em ${neighborhood.name}, Belo Horizonte.`,
          url: neighborhoodUrl,
          items: neighborhood.properties.map((property) => ({ title: property.title, url: `${origin}/imoveis/${property.slug}` }))
        })
      ])
    });
  } catch (error) { next(error); }
});

app.get('/sobre', (req, res) => res.render('sobre', {
  page: pageMeta(req, {
    title: 'Sobre | Gisley Nunes Imóveis',
    description: 'Conheça a Gisley Nunes e sua forma de trabalhar com imóveis em Belo Horizonte e região.',
    path: '/sobre'
  })
}));

app.get('/contato', (req, res) => res.render('contato', {
  page: pageMeta(req, {
    title: 'Contato | Gisley Nunes Imóveis',
    description: 'Fale com a Gisley Nunes por WhatsApp, e-mail ou formulário sobre comprar, alugar ou anunciar um imóvel.',
    path: '/contato'
  })
}));

app.get('/termos', (req, res) => res.render('termos', {
  page: pageMeta(req, {
    title: 'Termos de uso — Gisley Nunes Imóveis',
    description: 'Termos de uso do site Gisley Nunes Imóveis.',
    path: '/termos'
  })
}));

app.get('/privacidade', (req, res) => res.render('privacidade', {
  page: pageMeta(req, {
    title: 'Política de privacidade — Gisley Nunes Imóveis',
    description: 'Política de privacidade do site Gisley Nunes Imóveis e do atendimento realizado por seus canais.',
    path: '/privacidade'
  })
}));

app.get('/imoveis/:slug', async (req, res, next) => {
  try {
    const property = await getPropertyBySlug(req.params.slug);
    if (!property) return res.status(404).render('404', {
      page: pageMeta(req, { title: 'Imóvel não encontrado | Gisley Nunes Imóveis', description: 'O imóvel procurado não está disponível. Veja outros imóveis publicados pela Gisley Nunes.', path: req.path, robots: 'noindex,nofollow' })
    });
    const visibleProperty = publicProperty(property);
    const description = visibleProperty.description || `Conheça ${visibleProperty.title} em ${visibleProperty.location}.`;
    res.render('imovel', {
      page: pageMeta(req, { title: `${visibleProperty.title} | Gisley Nunes Imóveis`, description, path: `/imoveis/${visibleProperty.slug}`, ogImage: visibleProperty.cover_url }),
      property: visibleProperty,
      propertyJson: escapeJsonForHtml(visibleProperty),
      pageLd: escapeLd(propertyLd(visibleProperty, originFrom(req)))
    });
  } catch (error) { next(error); }
});

app.get('/robots.txt', (req, res) => {
  const origin = originFrom(req);
  res.type('text/plain; charset=utf-8').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /admin',
    'Disallow: /_app/',
    `Sitemap: ${origin}/sitemap.xml`
  ].join('\n'));
});

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const origin = originFrom(req);
    const properties = (await listProperties({ publicOnly: true })).map(publicProperty);
    const neighborhoods = catalogNeighborhoods(properties);
    const entries = [
      { path: '/', priority: '1.0', changefreq: 'weekly' },
      { path: '/imoveis', priority: '0.9', changefreq: 'daily' },
      { path: '/sobre', priority: '0.5', changefreq: 'monthly' },
      { path: '/contato', priority: '0.5', changefreq: 'monthly' },
      { path: '/termos', priority: '0.1', changefreq: 'yearly' },
      { path: '/privacidade', priority: '0.1', changefreq: 'yearly' },
      ...neighborhoods.map((neighborhood) => ({ path: `/bairros/${neighborhood.slug}`, priority: '0.7', changefreq: 'weekly' })),
      ...properties.map((property) => ({ path: `/imoveis/${property.slug}`, priority: '0.8', changefreq: 'weekly', lastmod: sitemapDate(property.updated_at) }))
    ];
    const urls = entries.map((entry) => `  <url><loc>${escapeXml(`${origin}${entry.path}`)}</loc>${entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : ''}<changefreq>${escapeXml(entry.changefreq)}</changefreq><priority>${escapeXml(entry.priority)}</priority></url>`).join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
  } catch (error) { next(error); }
});

app.get('/llms.txt', async (req, res, next) => {
  try {
    const origin = originFrom(req);
    const properties = (await listProperties({ publicOnly: true })).map(publicProperty);
    const neighborhoods = catalogNeighborhoods(properties);
    const lines = [
      '# Gisley Nunes Imóveis',
      '',
      '> Imóveis para comprar e alugar em Belo Horizonte e região. Consulte o catálogo e entre em contato.',
      '',
      '## Páginas',
      `- [Início](${origin}/): apresentação e imóveis em destaque.`,
      `- [Imóveis](${origin}/imoveis): catálogo completo com filtros.`,
      `- [Sobre](${origin}/sobre): história e valores.`,
      `- [Contato](${origin}/contato): canais de atendimento.`,
      `- [Termos de uso](${origin}/termos): regras de utilização do site.`,
      `- [Privacidade](${origin}/privacidade): política de privacidade.`,
      '',
      '## Imóveis',
      ...neighborhoods.map((neighborhood) => `- Bairro ${neighborhood.name}: ${neighborhood.count} imóveis. ${origin}/bairros/${neighborhood.slug}`),
      ...properties.map((property) => `- ${property.title}: ${property.location}, ${property.price_label || 'consulte'}. ${origin}/imoveis/${property.slug}`)
    ];
    res.type('text/plain; charset=utf-8').send(lines.join('\n'));
  } catch (error) { next(error); }
});

app.use(apiErrorHandler);

async function start() {
  if (isProduction) {
    assertAssetsReady();
    assertSecurityConfiguration();
    assertAuthConfiguration();
    assertDatabaseConfiguration();
    assertStorageConfiguration();
  }
  let migration;
  try {
    migration = await migrate();
    if (isProduction && !migration.configured) throw new Error('DATABASE_NOT_CONFIGURED');
  } catch (error) {
    if (isProduction) throw error;
    logOperationalError(console.warn, 'db.migration_deferred', error);
    migration = { configured: false };
  }
  if (isProduction) {
    const publicHeaders = (res, filePath) => {
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (/\.(?:png|jpe?g|webp|avif|svg|ico)$/i.test(normalized)) {
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      } else if (normalized.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    };
    app.use(express.static(path.join(root, 'dist'), { etag: true, maxAge: '7d', index: false, setHeaders: publicHeaders }));
    app.use('/admin', express.static(path.join(root, 'admin'), { etag: true, maxAge: 0, index: 'index.html', setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate') }));
  } else {
    app.use('/admin', express.static(path.join(root, 'admin'), { etag: true, maxAge: 0, index: 'index.html' }));
    const vite = await createViteServer({ root, server: { middlewareMode: true, host: '127.0.0.1' }, appType: 'custom' });
    app.use(vite.middlewares);
  }
  app.use((req, res) => {
    if (req.accepts('html')) {
      return res.status(404).render('404', {
        page: pageMeta(req, {
          title: 'Página não encontrada | Gisley Nunes Imóveis',
          description: 'A página procurada não foi encontrada. Volte ao catálogo e continue a busca por um imóvel.',
          path: req.path,
          robots: 'noindex,nofollow'
        })
      });
    }
    return res.status(404).json({ error: 'NOT_FOUND' });
  });

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`[morada] listening on 0.0.0.0:${port} · database:${migration.configured ? 'ready' : 'fallback'}`);
  });

  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[morada] ${signal} received, shutting down`);

    const forceExit = setTimeout(() => {
      console.error('[morada] graceful shutdown timed out');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async (error) => {
      try {
        await closePool();
      } catch (dbError) {
        logOperationalError(console.error, 'db.shutdown_failed', dbError);
      }
      clearTimeout(forceExit);
      process.exit(error ? 1 : 0);
    });

    server.closeIdleConnections?.();
  };

  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
}

start().catch((error) => {
  logOperationalError(console.error, 'startup.failed', error);
  process.exit(1);
});
