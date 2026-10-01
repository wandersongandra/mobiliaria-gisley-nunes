import crypto from 'node:crypto';
import {
  addPhoto,
  addTestimonial,
  createContactLead,
  databaseReady,
  getProperty,
  getPropertyBySlug,
  listAuditLog,
  listContactLeads,
  listProperties,
  listStaffAccess,
  removePhoto,
  removeStaffAccess,
  removeTestimonial,
  recordAudit,
  reorderPhotos,
  saveProperty,
  saveSiteSettings,
  saveStaffAccess,
  setPhotoCover,
  softDeleteProperty,
  updateContactLeadStatus
} from './db.js';
import { hasDatabase, isAllowedEmail } from './config.js';
import { callback, currentAdmin, login, logout, requireAdmin, requireManager } from './auth.js';
import { getSiteInfo, getTestimonials } from './site.js';
import { createRateLimiter, requireAdminOrigin, requireSameOrigin } from './security.js';
import {
  safeFileName,
  storageAssetUrl,
  storageDelete,
  storageGetSignedUrl,
  storageObjectExists,
  storageObjectLooksLikeImage,
  storagePresign,
  storageProviderName
} from './storage.js';
import { normalizeContactLead, normalizeTestimonial } from './validation.js';
import { publicProperties, publicProperty } from './presenters.js';

const loginLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30, namespace: 'auth' });
const contactLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 8, namespace: 'contact' });
const adminLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 300, namespace: 'admin' });

const mimeExtensions = {
  'image/jpeg': new Set(['jpg', 'jpeg']),
  'image/png': new Set(['png']),
  'image/webp': new Set(['webp']),
  'image/avif': new Set(['avif'])
};

function extensionOf(fileName) {
  const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

function adminApiGuard(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return adminLimiter(req, res, next);
  return next();
}

async function writeAudit(req, action, entityType, entityId, details = null) {
  try {
    await recordAudit({
      actorEmail: req.admin?.email || 'system',
      action,
      entityType,
      entityId,
      details
    });
  } catch (error) {
    console.warn('[audit] write failed:', error.message);
  }
}

export function registerRoutes(app) {
  app.use(['/api/auth', '/api/admin'], requireAdminOrigin);

  app.get('/_app/health', (req, res) => res.json({ ok: true, service: 'morada' }));
  app.get('/_app/ready', async (req, res, next) => {
    try {
      const database = await databaseReady();
      return res.status(database.ok ? 200 : 503).json({ ok: database.ok, database: database.reason });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/auth/login', loginLimiter, login);
  app.get('/api/auth/callback', loginLimiter, callback);
  app.post('/api/auth/logout', requireSameOrigin, logout);
  app.get('/api/admin/session', async (req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const user = await currentAdmin(req);
      res.json({ authenticated: Boolean(user), user });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/properties', async (req, res, next) => {
    try {
      const properties = publicProperties(await listProperties({ publicOnly: true }));
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.json({ properties });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/properties/:slug', async (req, res, next) => {
    try {
      const property = await getPropertyBySlug(req.params.slug);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return res.json({ property: publicProperty(property) });
    } catch (error) {
      return next(error);
    }
  });

  app.get(/^\/media\/(.+)$/, async (req, res, next) => {
    try {
      const key = String(req.params[0] || '').replace(/^\/+/, '');
      const signedUrl = await storageGetSignedUrl(key);
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.redirect(307, signedUrl);
    } catch (error) {
      return next(error);
    }
  });

  app.get(/^\/manus-storage\/(.+)$/, async (req, res, next) => {
    try {
      const key = String(req.params[0] || '').replace(/^\/+/, '');
      if (!key.startsWith('morada/properties/') || key.includes('..') || key.includes('\\0')) {
        return res.status(400).json({ error: 'INVALID_ASSET' });
      }
      const signedUrl = await storageGetSignedUrl(key);
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.redirect(307, signedUrl);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/site', async (req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
      res.json({ site: await getSiteInfo(), testimonials: await getTestimonials() });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/contact', requireSameOrigin, contactLimiter, async (req, res, next) => {
    try {
      if (String(req.body?.website || '').trim()) return res.status(201).json({ ok: true });
      if (!hasDatabase()) return res.status(503).json({ error: 'CONTACT_UNAVAILABLE' });
      const data = normalizeContactLead(req.body || {});
      const lead = await createContactLead(data);
      return res.status(201).json({ ok: true, id: lead.id });
    } catch (error) {
      return next(error);
    }
  });

  app.use('/api/admin', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  }, requireSameOrigin, adminApiGuard, requireAdmin());

  app.get('/api/admin/properties', async (req, res, next) => {
    try { res.json({ properties: await listProperties() }); } catch (error) { next(error); }
  });

  app.post('/api/admin/properties', async (req, res, next) => {
    try {
      const property = await saveProperty(req.body);
      await writeAudit(req, 'property.create', 'property', property.id, { title: property.title, status: property.status });
      return res.status(201).json({ property });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/properties/:id', async (req, res, next) => {
    try {
      const property = await getProperty(req.params.id);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      return res.json({ property });
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/admin/properties/:id', async (req, res, next) => {
    try {
      const property = await saveProperty(req.body, req.params.id);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'property.update', 'property', property.id, { title: property.title, status: property.status });
      return res.json({ property });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/admin/properties/:id', async (req, res, next) => {
    try {
      const removed = await softDeleteProperty(req.params.id);
      if (!removed) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'property.archive', 'property', req.params.id);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/uploads/presign', async (req, res, next) => {
    try {
      const { propertyId, fileName, contentType, size } = req.body || {};
      const parsedSize = Number(size);
      const extensions = mimeExtensions[String(contentType || '').toLowerCase()];
      const extension = extensionOf(fileName);

      if (!propertyId || !fileName || !extensions || !extensions.has(extension) || !Number.isFinite(parsedSize) || parsedSize <= 0 || parsedSize > 12 * 1024 * 1024) {
        return res.status(400).json({ error: 'INVALID_FILE' });
      }

      const property = await getProperty(propertyId);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      if ((property.photos?.length || 0) >= 40) return res.status(409).json({ error: 'PHOTO_LIMIT_REACHED' });

      const storagePath = `gisley/properties/${propertyId}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
      const uploadUrl = await storagePresign(storagePath, { contentType });
      return res.json({
        uploadUrl,
        storagePath,
        assetUrl: storageAssetUrl(storagePath),
        provider: storageProviderName()
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/properties/:id/photos', async (req, res, next) => {
    try {
      const {
        storagePath,
        altText,
        sortOrder,
        isCover,
        contentType,
        size,
        width,
        height
      } = req.body || {};
      const property = await getProperty(req.params.id);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      if ((property.photos?.length || 0) >= 40) return res.status(409).json({ error: 'PHOTO_LIMIT_REACHED' });

      const expectedPrefix = `gisley/properties/${req.params.id}/`;
      const parsedSize = Number(size || 0);
      const parsedWidth = Number(width || 0);
      const parsedHeight = Number(height || 0);
      const extensions = mimeExtensions[String(contentType || '').toLowerCase()];
      const extension = extensionOf(storagePath);

      if (
        !storagePath
        || !String(storagePath).startsWith(expectedPrefix)
        || !extensions
        || !extensions.has(extension)
        || !Number.isFinite(parsedSize)
        || parsedSize <= 0
        || parsedSize > 12 * 1024 * 1024
        || !Number.isFinite(parsedWidth)
        || !Number.isFinite(parsedHeight)
        || parsedWidth <= 0
        || parsedHeight <= 0
        || parsedWidth > 20000
        || parsedHeight > 20000
      ) {
        return res.status(400).json({ error: 'INVALID_ASSET' });
      }

      if (!(await storageObjectExists(storagePath))) {
        return res.status(400).json({ error: 'ASSET_NOT_UPLOADED' });
      }

      if (!(await storageObjectLooksLikeImage(storagePath, contentType))) {
        try { await storageDelete(storagePath); } catch {}
        return res.status(400).json({ error: 'INVALID_ASSET' });
      }

      const photoId = crypto.randomUUID();
      const photos = await addPhoto({
        id: photoId,
        propertyId: req.params.id,
        storagePath,
        url: storageAssetUrl(storagePath),
        altText: altText || `Foto de ${property.title}`,
        sortOrder: Number(sortOrder || 0),
        isCover: Boolean(isCover),
        storageProvider: storageProviderName(),
        mimeType: contentType,
        fileSize: parsedSize,
        width: parsedWidth,
        height: parsedHeight,
        uploadedBy: req.admin.email
      });
      await writeAudit(req, 'photo.add', 'photo', photoId, { propertyId: req.params.id, storagePath });
      return res.status(201).json({ photos });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/admin/photos/:id', async (req, res, next) => {
    try {
      const removed = await removePhoto(req.params.id);
      if (!removed) return res.status(404).json({ error: 'NOT_FOUND' });
      try {
        await storageDelete(removed.storage_path);
      } catch (error) {
        console.warn('[storage] orphan cleanup deferred:', error.message);
      }
      await writeAudit(req, 'photo.remove', 'photo', req.params.id, { propertyId: removed.property_id });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/admin/properties/:id/photos/order', async (req, res, next) => {
    try {
      const { photoIds } = req.body || {};
      if (!Array.isArray(photoIds) || photoIds.length > 100) return res.status(400).json({ error: 'INVALID_ORDER' });
      const property = await getProperty(req.params.id);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      const photos = await reorderPhotos(req.params.id, photoIds);
      await writeAudit(req, 'photo.reorder', 'property', req.params.id, { photoCount: photos.length });
      return res.json({ photos });
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/admin/photos/:id/cover', async (req, res, next) => {
    try {
      const photos = await setPhotoCover(req.params.id);
      if (!photos) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'photo.cover', 'photo', req.params.id);
      return res.json({ photos });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/site', async (req, res, next) => {
    try { res.json({ site: await getSiteInfo(), testimonials: await getTestimonials() }); } catch (error) { next(error); }
  });

  app.put('/api/admin/site', requireManager(), async (req, res, next) => {
    try {
      await saveSiteSettings(req.body || {});
      await writeAudit(req, 'site.update', 'site', '1');
      res.json({ site: await getSiteInfo() });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/admin/testimonials', requireManager(), async (req, res, next) => {
    try {
      const data = normalizeTestimonial(req.body || {});
      const testimonials = await addTestimonial(data);
      const created = testimonials.find((item) => item.author === data.author && item.quote === data.quote);
      await writeAudit(req, 'testimonial.create', 'testimonial', created?.id || null, { author: data.author });
      res.status(201).json({ testimonials });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/admin/testimonials/:id', requireManager(), async (req, res, next) => {
    try {
      const removed = await removeTestimonial(req.params.id);
      if (!removed) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'testimonial.remove', 'testimonial', req.params.id);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/leads', async (req, res, next) => {
    try { res.json({ leads: await listContactLeads({ limit: 100 }) }); } catch (error) { next(error); }
  });

  app.patch('/api/admin/leads/:id', async (req, res, next) => {
    try {
      const status = String(req.body?.status || '');
      const updated = await updateContactLeadStatus(req.params.id, status);
      if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'lead.status', 'lead', req.params.id, { status });
      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/audit', requireManager(), async (req, res, next) => {
    try {
      return res.json({ audit: await listAuditLog({ limit: req.query?.limit }) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/team', requireManager(), async (req, res, next) => {
    try {
      const team = await listStaffAccess();
      res.json({ team });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/admin/team', requireManager(), async (req, res, next) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const name = String(req.body?.name || '').trim();
      const role = req.body?.role === 'manager' ? 'manager' : 'editor';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 255) {
        return res.status(400).json({ error: 'INVALID_TEAM_MEMBER' });
      }
      const member = await saveStaffAccess({ email, name, role, active: true, invitedBy: req.admin.email });
      await writeAudit(req, 'team.upsert', 'staff', email, { role: member.role, active: Boolean(member.active) });
      return res.status(201).json({ member });
    } catch (error) {
      return next(error);
    }
  });

  app.patch('/api/admin/team/:email', requireManager(), async (req, res, next) => {
    try {
      const email = String(req.params.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'INVALID_EMAIL' });
      if (email === req.admin.email && ((req.body?.role && req.body.role !== req.admin.role) || req.body?.active === false)) {
        return res.status(400).json({ error: 'CANNOT_CHANGE_SELF_ACCESS' });
      }
      if (isAllowedEmail(email) && req.body?.role && req.body.role !== 'manager') {
        return res.status(400).json({ error: 'BOOTSTRAP_MANAGER_PROTECTED' });
      }
      const current = (await listStaffAccess()).find((item) => item.email === email);
      if (!current) return res.status(404).json({ error: 'NOT_FOUND' });
      const member = await saveStaffAccess({
        email,
        name: String(req.body?.name ?? current.name).trim(),
        role: isAllowedEmail(email) ? 'manager' : (req.body?.role === 'manager' ? 'manager' : (req.body?.role === 'editor' ? 'editor' : current.role)),
        active: typeof req.body?.active === 'boolean' ? req.body.active : Boolean(current.active),
        invitedBy: current.invited_by || req.admin.email
      });
      await writeAudit(req, 'team.update', 'staff', email, { role: member.role, active: Boolean(member.active) });
      return res.json({ member });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/admin/team/:email', requireManager(), async (req, res, next) => {
    try {
      const email = String(req.params.email || '').trim().toLowerCase();
      if (email === req.admin.email) return res.status(400).json({ error: 'CANNOT_REMOVE_SELF' });
      if (isAllowedEmail(email)) return res.status(400).json({ error: 'BOOTSTRAP_MANAGER_PROTECTED' });
      const removed = await removeStaffAccess(email);
      if (!removed) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'team.remove', 'staff', email);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
}
