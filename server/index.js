import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { configuredAdminOrigin, isProduction, port } from './config.js';
import { closePool, getPropertyBySlug, listProperties, migrate } from './db.js';
import { registerRoutes } from './routes.js';
import { assets } from './assets.js';
import { getSiteInfo, getTestimonials } from './site.js';
import { escapeLd, organizationLd, propertyLd } from './seo.js';
import { requestHostOrigin, requestOrigin, securityHeaders } from './security.js';
import { publicProperty } from './presenters.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const app = express();

app.disable('x-powered-by');
app.set('query parser', 'simple');
app.set('view engine', 'ejs');
app.set('views', path.join(root, 'views'));
app.use(securityHeaders);
app.use(express.json({ limit: '256kb', type: 'application/json' }));
app.use(cookieParser());

app.use('/admin', (req, res, next) => {
  const adminOrigin = configuredAdminOrigin();
  if (!adminOrigin) return next();
  if (requestHostOrigin(req) === adminOrigin) return next();
  return res.redirect(308, `${adminOrigin}${req.originalUrl}`);
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
    return next();
  } catch (error) { return next(error); }
});

registerRoutes(app);

function pageMeta(req, { title, description, path: pathname, ogImage, robots = 'index,follow,max-image-preview:large' }) {
  const origin = originFrom(req);
  return {
    title,
    description,
    canonical: `${origin}${pathname}`,
    ogImage: ogImage ? (ogImage.startsWith('http') ? ogImage : `${origin}${ogImage}`) : `${origin}/images/gisley-nunes-imoveis-logo.jpeg`,
    ogType: 'website',
    robots
  };
}

app.get('/', (req, res) => res.render('home', {
  page: pageMeta(req, {
    title: 'Gisley Nunes Imóveis — encontre seu próximo lugar',
    description: 'Imóveis selecionados em Belo Horizonte e região, com atendimento próximo, transparente e especializado.',
    path: '/'
  })
}));

app.get(['/imoveis', '/imoveis/'], (req, res) => res.render('imoveis', {
  page: pageMeta(req, {
    title: 'Imóveis — Gisley Nunes Imóveis',
    description: 'Catálogo completo de imóveis selecionados em Belo Horizonte e região, para comprar ou alugar.',
    path: '/imoveis'
  })
}));

app.get('/sobre', (req, res) => res.render('sobre', {
  page: pageMeta(req, {
    title: 'Sobre — Gisley Nunes Imóveis',
    description: 'Conheça a Gisley Nunes: atendimento próximo e curadoria de imóveis em Belo Horizonte e região.',
    path: '/sobre'
  })
}));

app.get('/contato', (req, res) => res.render('contato', {
  page: pageMeta(req, {
    title: 'Contato — Gisley Nunes Imóveis',
    description: 'Fale com a Gisley Nunes: WhatsApp, e-mail e atendimento em Belo Horizonte e região.',
    path: '/contato'
  })
}));

app.get('/privacidade', (req, res) => res.render('privacidade', {
  page: pageMeta(req, {
    title: 'Política de privacidade — Gisley Nunes Imóveis',
    description: 'Política de privacidade da Gisley Nunes Imóveis, em conformidade com a LGPD.',
    path: '/privacidade'
  })
}));

app.get('/imoveis/:slug', async (req, res, next) => {
  try {
    const property = await getPropertyBySlug(req.params.slug);
    if (!property) return res.status(404).render('404', {
      page: pageMeta(req, { title: 'Imóvel não encontrado — Gisley Nunes Imóveis', description: 'O imóvel procurado não está disponível. Veja outros imóveis selecionados pela Gisley Nunes.', path: req.path, robots: 'noindex,nofollow' })
    });
    const visibleProperty = publicProperty(property);
    const description = visibleProperty.description || `Conheça ${visibleProperty.title} em ${visibleProperty.location}.`;
    res.render('imovel', {
      page: pageMeta(req, { title: `${visibleProperty.title} — Gisley Nunes Imóveis`, description, path: `/imoveis/${visibleProperty.slug}`, ogImage: visibleProperty.cover_url }),
      property: visibleProperty,
      propertyJson: JSON.stringify(visibleProperty).replace(/</g, '\\u003c'),
      extraHead: `<script nonce="${res.locals.cspNonce}" type="application/ld+json">${escapeLd(propertyLd(visibleProperty, originFrom(req)))}</script>`
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
    const properties = await listProperties({ publicOnly: true });
    const entries = [
      { path: '/', priority: '1.0', changefreq: 'weekly' },
      { path: '/imoveis', priority: '0.9', changefreq: 'daily' },
      { path: '/sobre', priority: '0.5', changefreq: 'monthly' },
      { path: '/contato', priority: '0.5', changefreq: 'monthly' },
      { path: '/privacidade', priority: '0.1', changefreq: 'yearly' },
      ...properties.map((property) => ({ path: `/imoveis/${property.slug}`, priority: '0.8', changefreq: 'weekly', lastmod: property.updated_at ? String(property.updated_at).slice(0, 10) : null }))
    ];
    const urls = entries.map((entry) => `  <url><loc>${origin}${entry.path}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}<changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`).join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
  } catch (error) { next(error); }
});

app.get('/llms.txt', async (req, res, next) => {
  try {
    const origin = originFrom(req);
    const properties = await listProperties({ publicOnly: true });
    const lines = [
      '# Gisley Nunes Imóveis',
      '',
      '> Imobiliária em Belo Horizonte e região. Curadoria de imóveis para comprar e alugar, com atendimento próximo e especializado.',
      '',
      '## Páginas',
      `- [Início](${origin}/): apresentação e imóveis em destaque.`,
      `- [Imóveis](${origin}/imoveis): catálogo completo com filtros.`,
      `- [Sobre](${origin}/sobre): história e valores.`,
      `- [Contato](${origin}/contato): canais de atendimento.`,
      `- [Privacidade](${origin}/privacidade): política de privacidade.`,
      '',
      '## Imóveis',
      ...properties.map((property) => `- ${property.title} — ${property.location} — ${property.price_label || ''} — ${origin}/imoveis/${property.slug}`)
    ];
    res.type('text/plain; charset=utf-8').send(lines.join('\n'));
  } catch (error) { next(error); }
});

app.use((error, req, res, next) => {
  console.error('[api]', isProduction ? error.message : (error.stack || error.message));
  if (res.headersSent) return next(error);
  const known = { TITLE_REQUIRED: ['TITLE_REQUIRED', 400], LOCATION_REQUIRED: ['LOCATION_REQUIRED', 400], INVALID_ASSET: ['INVALID_ASSET', 400], INVALID_CONTACT: ['INVALID_CONTACT', 400], INVALID_EMAIL: ['INVALID_EMAIL', 400], INVALID_INSTAGRAM_URL: ['INVALID_INSTAGRAM_URL', 400], INVALID_TESTIMONIAL: ['INVALID_TESTIMONIAL', 400], INVALID_LEAD_STATUS: ['INVALID_LEAD_STATUS', 400], INVALID_ORDER: ['INVALID_ORDER', 400], SLUG_CONFLICT: ['SLUG_CONFLICT', 409], DATABASE_NOT_CONFIGURED: ['DATABASE_NOT_CONFIGURED', 503], STORAGE_NOT_CONFIGURED: ['STORAGE_NOT_CONFIGURED', 503], OAUTH_NOT_CONFIGURED: ['OAUTH_NOT_CONFIGURED', 503], SESSION_SECRET_NOT_CONFIGURED: ['SESSION_SECRET_NOT_CONFIGURED', 503] }[error.message];
  res.status(known?.[1] || 500).json({ error: known?.[0] || 'INTERNAL_ERROR' });
});

async function start() {
  let migration;
  try {
    migration = await migrate();
    if (isProduction && !migration.configured) throw new Error('DATABASE_NOT_CONFIGURED');
  } catch (error) {
    if (isProduction) throw error;
    console.warn('[db] migration deferred:', error.message);
    migration = { configured: false };
  }
  if (isProduction) {
    const publicHeaders = (res, filePath) => { if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); else if (/\.(?:js|css|woff2?|png|jpe?g|webp|avif|svg)$/i.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); };
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
          title: 'Página não encontrada — Gisley Nunes Imóveis',
          description: 'A página procurada não foi encontrada. Continue navegando pelos imóveis da Gisley Nunes.',
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
        console.error('[db] shutdown:', dbError.message);
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
  console.error('[startup]', isProduction ? error.message : (error.stack || error.message));
  process.exit(1);
});