import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { isProduction, port } from './config.js';
import { getPropertyBySlug, listProperties, migrate } from './db.js';
import { registerRoutes } from './routes.js';
import { assets } from './assets.js';
import { getSiteInfo, getTestimonials } from './site.js';
import { escapeLd, organizationLd, propertyLd } from './seo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(root, 'views'));
app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());

function originFrom(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

app.use(async (req, res, next) => {
  try {
    res.locals.assets = assets();
    res.locals.site = await getSiteInfo();
    res.locals.testimonials = await getTestimonials();
    res.locals.siteLd = escapeLd(organizationLd(res.locals.site, originFrom(req)));
    next();
  } catch (error) { next(error); }
});

registerRoutes(app);

function pageMeta(req, { title, description, path: pathname, ogImage }) {
  const origin = originFrom(req);
  return {
    title,
    description,
    canonical: `${origin}${pathname}`,
    ogImage: ogImage ? (ogImage.startsWith('http') ? ogImage : `${origin}${ogImage}`) : `${origin}/images/gisley-nunes-imoveis-logo.jpeg`,
    ogType: 'website'
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
    if (!property) return res.status(404).send('Imóvel não encontrado.');
    const description = property.description || `Conheça ${property.title} em ${property.location}.`;
    res.render('imovel', {
      page: pageMeta(req, { title: `${property.title} — Gisley Nunes Imóveis`, description, path: `/imoveis/${property.slug}`, ogImage: property.cover_url }),
      property,
      propertyJson: JSON.stringify(property).replace(/</g, '\\u003c'),
      extraHead: `<script type="application/ld+json">${escapeLd(propertyLd(property, originFrom(req)))}</script>`
    });
  } catch (error) { next(error); }
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
  console.error('[api]', error.stack || error.message);
  if (res.headersSent) return next(error);
  const known = { TITLE_REQUIRED: ['TITLE_REQUIRED', 400], DATABASE_NOT_CONFIGURED: ['DATABASE_NOT_CONFIGURED', 503], STORAGE_NOT_CONFIGURED: ['STORAGE_NOT_CONFIGURED', 503] }[error.message];
  res.status(known?.[1] || 500).json({ error: known?.[0] || 'INTERNAL_ERROR' });
});

async function start() {
  const migration = await migrate().catch((error) => { console.warn('[db] migration deferred:', error.message); return { configured: false }; });
  if (isProduction) {
    const publicHeaders = (res, filePath) => { if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); };
    app.use(express.static(path.join(root, 'dist'), { etag: true, maxAge: '1y', index: false, setHeaders: publicHeaders }));
    app.use('/admin', express.static(path.join(root, 'admin'), { etag: true, maxAge: 0, index: 'index.html', setHeaders: publicHeaders }));
  } else {
    app.use('/admin', express.static(path.join(root, 'admin'), { etag: true, maxAge: 0, index: 'index.html' }));
    const vite = await createViteServer({ root, server: { middlewareMode: true, host: '0.0.0.0' }, appType: 'custom' });
    app.use(vite.middlewares);
  }
  app.listen(port, '0.0.0.0', () => console.log(`[morada] listening on 0.0.0.0:${port} · database:${migration.configured ? 'ready' : 'fallback'}`));
}

start().catch((error) => { console.error(error); process.exit(1); });