import crypto from 'node:crypto';
import { addPhoto, addTestimonial, getProperty, getPropertyBySlug, listProperties, removePhoto, removeTestimonial, reorderPhotos, saveProperty, saveSiteSettings, setPhotoCover, softDeleteProperty } from './db.js';
import { hasDatabase } from './config.js';
import { callback, currentAdmin, login, logout, requireAdmin } from './auth.js';
import { getSiteInfo, getTestimonials } from './site.js';
import { safeFileName, storagePresign } from './storage.js';

export function registerRoutes(app) {
  app.get('/_app/health', (req, res) => res.json({ ok: true, service: 'morada', database: hasDatabase() ? 'configured' : 'fallback' }));

  app.get('/api/auth/login', login);
  app.get('/api/auth/callback', callback);
  app.post('/api/auth/logout', logout);
  app.get('/api/admin/session', async (req, res, next) => { try { res.setHeader('Cache-Control', 'no-store'); const user = await currentAdmin(req); res.json({ authenticated: Boolean(user), user }); } catch (error) { next(error); } });

  app.get('/api/properties', async (req, res, next) => {
    try {
      const properties = await listProperties({ publicOnly: true });
      res.json({ properties, source: hasDatabase() ? 'database' : 'fallback' });
    } catch (error) { next(error); }
  });

  app.get('/api/properties/:slug', async (req, res, next) => {
    try {
      const property = await getPropertyBySlug(req.params.slug);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json({ property, source: hasDatabase() ? 'database' : 'fallback' });
    } catch (error) { next(error); }
  });

  app.get('/api/site', async (req, res, next) => {
    try {
      res.json({ site: await getSiteInfo(), testimonials: await getTestimonials() });
    } catch (error) { next(error); }
  });

  app.use('/api/admin', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); }, requireAdmin());
  app.get('/api/admin/properties', async (req, res, next) => { try { res.json({ properties: await listProperties() }); } catch (error) { next(error); } });
  app.post('/api/admin/properties', async (req, res, next) => { try { res.status(201).json({ property: await saveProperty(req.body) }); } catch (error) { next(error); } });
  app.get('/api/admin/properties/:id', async (req, res, next) => { try { const property = await getProperty(req.params.id); if (!property) return res.status(404).json({ error: 'NOT_FOUND' }); res.json({ property }); } catch (error) { next(error); } });
  app.put('/api/admin/properties/:id', async (req, res, next) => { try { const property = await saveProperty(req.body, req.params.id); if (!property) return res.status(404).json({ error: 'NOT_FOUND' }); res.json({ property }); } catch (error) { next(error); } });
  app.delete('/api/admin/properties/:id', async (req, res, next) => { try { await softDeleteProperty(req.params.id); res.status(204).end(); } catch (error) { next(error); } });
  app.post('/api/admin/uploads/presign', async (req, res, next) => {
    try {
      const { propertyId, fileName, contentType, size } = req.body || {};
      if (!propertyId || !fileName || !contentType || !Number.isFinite(Number(size)) || Number(size) > 15 * 1024 * 1024) return res.status(400).json({ error: 'INVALID_FILE' });
      const property = await getProperty(propertyId);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!/^image\/(jpeg|png|webp|avif)$/i.test(contentType)) return res.status(400).json({ error: 'UNSUPPORTED_IMAGE' });
      const storagePath = `morada/properties/${propertyId}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
      const uploadUrl = await storagePresign(storagePath);
      res.json({ uploadUrl, storagePath, assetUrl: `/manus-storage/${storagePath}` });
    } catch (error) { next(error); }
  });
  app.post('/api/admin/properties/:id/photos', async (req, res, next) => {
    try {
      const { storagePath, assetUrl, altText, sortOrder, isCover } = req.body || {};
      const property = await getProperty(req.params.id);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!storagePath || assetUrl !== `/manus-storage/${storagePath}` || !storagePath.startsWith(`morada/properties/${req.params.id}/`)) return res.status(400).json({ error: 'INVALID_ASSET' });
      res.status(201).json({ photos: await addPhoto({ id: crypto.randomUUID(), propertyId: req.params.id, storagePath, url: assetUrl, altText: altText || 'Foto do imóvel', sortOrder: Number(sortOrder || 0), isCover: Boolean(isCover) }) });
    } catch (error) { next(error); }
  });
  app.delete('/api/admin/photos/:id', async (req, res, next) => { try { await removePhoto(req.params.id); res.status(204).end(); } catch (error) { next(error); } });
  app.put('/api/admin/properties/:id/photos/order', async (req, res, next) => { try { const { photoIds } = req.body || {}; if (!Array.isArray(photoIds)) return res.status(400).json({ error: 'INVALID_ORDER' }); const property = await getProperty(req.params.id); if (!property) return res.status(404).json({ error: 'NOT_FOUND' }); res.json({ photos: await reorderPhotos(req.params.id, photoIds) }); } catch (error) { next(error); } });
  app.put('/api/admin/photos/:id/cover', async (req, res, next) => { try { const photos = await setPhotoCover(req.params.id); if (!photos) return res.status(404).json({ error: 'NOT_FOUND' }); res.json({ photos }); } catch (error) { next(error); } });

  app.get('/api/admin/site', async (req, res, next) => { try { res.json({ site: await getSiteInfo(), testimonials: await getTestimonials() }); } catch (error) { next(error); } });
  app.put('/api/admin/site', async (req, res, next) => { try { await saveSiteSettings(req.body || {}); res.json({ site: await getSiteInfo() }); } catch (error) { next(error); } });
  app.post('/api/admin/testimonials', async (req, res, next) => { try { const { author, quote } = req.body || {}; if (!author || !quote) return res.status(400).json({ error: 'INVALID_TESTIMONIAL' }); res.status(201).json({ testimonials: await addTestimonial({ author, quote, location: req.body.location, year: req.body.year, sortOrder: req.body.sortOrder }) }); } catch (error) { next(error); } });
  app.delete('/api/admin/testimonials/:id', async (req, res, next) => { try { await removeTestimonial(req.params.id); res.status(204).end(); } catch (error) { next(error); } });

  app.use('/api', (req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
}