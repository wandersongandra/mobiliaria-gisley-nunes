import crypto from 'node:crypto';
import {
  addPhoto,
  addTestimonial,
  createContactLead,
  consumeIdentityPairing,
  databaseReady,
  deleteContactLead,
  findStaffAccess,
  findStaffAccessByOpenId,
  getPhoto,
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
  revokeAdminSessionsByOpenId,
  saveProperty,
  saveSiteSettings,
  saveStaffAccess,
  setPhotoCover,
  softDeleteProperty,
  updateContactLeadStatus
} from './db.js';
import { hasDatabase, isAllowedOpenId, legacyStorageRouteEnabled } from './config.js';
import { callback, currentAdmin, hashPairingCode, login, logout, logoutAll, requireAdmin } from './auth.js';
import {
  auditView,
  canCreateProperty,
  canManagePropertyMedia,
  canMutateProperty,
  canRequestPublication,
  hasCapability,
  requireCapability,
  staffMutationError,
  staffRemovalError,
  staffView
} from './authorization.js';
import { getSiteInfo, getTestimonials } from './site.js';
import { createRateLimiter, requireAdminOrigin, requireSameOrigin } from './security.js';
import {
  safeFileName,
  storageAssetUrl,
  storageDelete,
  storageGetSignedUrl,
  storageObjectExists,
  storageObjectLooksLikeImage,
  storagePathBelongsToProperty,
  storagePresign,
  storageProviderName
} from './storage.js';
import {
  normalizeAuditLimit,
  normalizeContactLead,
  normalizeLeadStatus,
  normalizePhotoInput,
  normalizePhotoOrder,
  normalizeTeamCreate,
  normalizeTeamPatch,
  normalizeTestimonial,
  normalizeUploadRequest
} from './validation.js';
import { adminProperties, adminProperty, publicProperties, publicProperty } from './presenters.js';

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
      actorOpenId: req.admin?.openId || null,
      action,
      entityType,
      entityId,
      details
    });
  } catch (error) {
    console.warn('[audit] write failed:', error.message);
  }
}

export function registerRoutes(app, { adminMiddleware = requireAdmin() } = {}) {
  app.use(['/api/auth', '/api/admin'], requireAdminOrigin);

  app.get('/_app/health', (req, res) => res.json({ ok: true, service: 'morada' }));
  app.get('/_app/ready', async (req, res, next) => {
    try {
      const database = await databaseReady();
      return res.status(database.ok ? 200 : 503).json({ ok: database.ok });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/auth/login', loginLimiter, login);
  app.get('/api/auth/callback', loginLimiter, callback);
  app.post('/api/auth/logout', requireSameOrigin, logout);
  app.post('/api/auth/logout-all', requireSameOrigin, logoutAll);
  app.get('/api/admin/session', async (req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const user = await currentAdmin(req);
      res.json({
        authenticated: Boolean(user),
        user: user ? { email: user.email, name: user.name, role: user.role } : null
      });
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

  if (legacyStorageRouteEnabled()) {
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
  }

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
  }, requireSameOrigin, adminApiGuard, adminMiddleware);

  app.get('/api/admin/properties', requireCapability('property.read'), async (req, res, next) => {
    try { res.json({ properties: adminProperties(await listProperties()) }); } catch (error) { next(error); }
  });

  app.post('/api/admin/properties', requireCapability('property.write'), async (req, res, next) => {
    try {
      if (!canCreateProperty(req.admin, req.body || {})) {
        return res.status(403).json({ error: 'CAPABILITY_REQUIRED' });
      }
      const property = await saveProperty(req.body, null, {
        requireDraft: !hasCapability(req.admin, 'property.publish')
      });
      await writeAudit(req, 'property.create', 'property', property.id, { title: property.title, status: property.status });
      return res.status(201).json({ property: adminProperty(property) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/properties/:id', requireCapability('property.read'), async (req, res, next) => {
    try {
      const property = await getProperty(req.params.id);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      return res.json({ property: adminProperty(property) });
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/admin/properties/:id', requireCapability('property.write'), async (req, res, next) => {
    try {
      const current = await getProperty(req.params.id);
      if (!current) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!canMutateProperty(req.admin, current) || !canRequestPublication(req.admin, req.body || {})) {
        return res.status(403).json({ error: 'CAPABILITY_REQUIRED' });
      }
      const property = await saveProperty(req.body, req.params.id, {
        requireDraft: !hasCapability(req.admin, 'property.publish')
      });
      await writeAudit(req, 'property.update', 'property', property.id, { title: property.title, status: property.status });
      return res.json({ property: adminProperty(property) });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/admin/properties/:id', requireCapability('property.archive'), async (req, res, next) => {
    try {
      const removed = await softDeleteProperty(req.params.id);
      if (!removed) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'property.archive', 'property', req.params.id);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/uploads/presign', requireCapability('media.manage'), async (req, res, next) => {
    try {
      const { propertyId, fileName, contentType, size } = normalizeUploadRequest(req.body || {});
      const extensions = mimeExtensions[contentType];
      const extension = extensionOf(fileName);
      if (!extensions?.has(extension)) return res.status(400).json({ error: 'INVALID_FILE' });

      const property = await getProperty(propertyId);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!canManagePropertyMedia(req.admin, property)) return res.status(403).json({ error: 'CAPABILITY_REQUIRED' });
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

  app.post('/api/admin/properties/:id/photos', requireCapability('media.manage'), async (req, res, next) => {
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
      } = normalizePhotoInput(req.body || {});
      const property = await getProperty(req.params.id);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!canManagePropertyMedia(req.admin, property)) return res.status(403).json({ error: 'CAPABILITY_REQUIRED' });
      if ((property.photos?.length || 0) >= 40) return res.status(409).json({ error: 'PHOTO_LIMIT_REACHED' });

      const extensions = mimeExtensions[contentType];
      const extension = extensionOf(storagePath);
      if (!storagePathBelongsToProperty(storagePath, req.params.id) || !extensions?.has(extension)) {
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
      let photos;
      try {
        photos = await addPhoto({
          id: photoId,
          propertyId: req.params.id,
          storagePath,
          url: storageAssetUrl(storagePath),
          altText: altText || `Foto de ${property.title}`,
          sortOrder: Number(sortOrder || 0),
          isCover: Boolean(isCover),
          storageProvider: storageProviderName(),
          mimeType: contentType,
          fileSize: size,
          width,
          height,
          uploadedBy: req.admin.email,
          requireDraft: !hasCapability(req.admin, 'property.publish')
        });
      } catch (error) {
        if (error?.message !== 'ASSET_ALREADY_REGISTERED') {
          try { await storageDelete(storagePath); } catch (cleanupError) {
            console.warn('[storage] failed to clean unpersisted upload:', cleanupError.message);
          }
        }
        throw error;
      }
      await writeAudit(req, 'photo.add', 'photo', photoId, { propertyId: req.params.id, storagePath });
      return res.status(201).json({ photos });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/admin/photos/:id', requireCapability('media.manage'), async (req, res, next) => {
    try {
      const photo = await getPhoto(req.params.id);
      if (!photo) return res.status(404).json({ error: 'NOT_FOUND' });
      const property = await getProperty(photo.property_id);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!canManagePropertyMedia(req.admin, property)) return res.status(403).json({ error: 'CAPABILITY_REQUIRED' });
      const removed = await removePhoto(req.params.id, {
        requireDraft: !hasCapability(req.admin, 'property.publish')
      });
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

  app.put('/api/admin/properties/:id/photos/order', requireCapability('media.manage'), async (req, res, next) => {
    try {
      const photoIds = normalizePhotoOrder(req.body || {});
      const property = await getProperty(req.params.id);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!canManagePropertyMedia(req.admin, property)) return res.status(403).json({ error: 'CAPABILITY_REQUIRED' });
      const photos = await reorderPhotos(req.params.id, photoIds, {
        requireDraft: !hasCapability(req.admin, 'property.publish')
      });
      await writeAudit(req, 'photo.reorder', 'property', req.params.id, { photoCount: photos.length });
      return res.json({ photos });
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/admin/photos/:id/cover', requireCapability('media.manage'), async (req, res, next) => {
    try {
      const photo = await getPhoto(req.params.id);
      if (!photo) return res.status(404).json({ error: 'NOT_FOUND' });
      const property = await getProperty(photo.property_id);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!canManagePropertyMedia(req.admin, property)) return res.status(403).json({ error: 'CAPABILITY_REQUIRED' });
      const photos = await setPhotoCover(req.params.id, {
        requireDraft: !hasCapability(req.admin, 'property.publish')
      });
      if (!photos) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'photo.cover', 'photo', req.params.id);
      return res.json({ photos });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/site', requireCapability('site.read'), async (req, res, next) => {
    try { res.json({ site: await getSiteInfo(), testimonials: await getTestimonials() }); } catch (error) { next(error); }
  });

  app.put('/api/admin/site', requireCapability('site.manage'), async (req, res, next) => {
    try {
      await saveSiteSettings(req.body || {});
      await writeAudit(req, 'site.update', 'site', '1');
      res.json({ site: await getSiteInfo() });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/admin/testimonials', requireCapability('testimonial.manage'), async (req, res, next) => {
    try {
      const data = normalizeTestimonial(req.body || {});
      const created = await addTestimonial(data);
      await writeAudit(req, 'testimonial.create', 'testimonial', created.id, { author: data.author });
      res.status(201).json({ testimonials: created.testimonials });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/admin/testimonials/:id', requireCapability('testimonial.manage'), async (req, res, next) => {
    try {
      const removed = await removeTestimonial(req.params.id);
      if (!removed) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'testimonial.remove', 'testimonial', req.params.id);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/leads', requireCapability('lead.read'), async (req, res, next) => {
    try { res.json({ leads: await listContactLeads({ limit: 100 }) }); } catch (error) { next(error); }
  });

  app.patch('/api/admin/leads/:id', requireCapability('lead.status'), async (req, res, next) => {
    try {
      const status = normalizeLeadStatus(req.body?.status);
      const updated = await updateContactLeadStatus(req.params.id, status);
      if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'lead.status', 'lead', req.params.id, { status });
      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/admin/leads/:id', requireCapability('lead.erase'), async (req, res, next) => {
    try {
      const removed = await deleteContactLead(req.params.id);
      if (!removed) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'lead.delete', 'lead', req.params.id, { reason: 'privacy_or_admin_request' });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/audit', requireCapability('audit.read'), async (req, res, next) => {
    try {
      const audit = (await listAuditLog({ limit: normalizeAuditLimit(req.query?.limit) })).map(auditView);
      return res.json({ audit });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/team', requireCapability('team.manage'), async (req, res, next) => {
    try {
      const team = (await listStaffAccess()).map((member) => staffView({
        ...member,
        is_bootstrap: Boolean(member.open_id && isAllowedOpenId(member.open_id))
      }, req.admin));
      res.json({ team });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/admin/team', requireCapability('team.manage'), async (req, res, next) => {
    try {
      const { email, pairingCode, name, role } = normalizeTeamCreate(req.body || {});

      if (await findStaffAccess(email)) {
        return res.status(409).json({ error: 'TEAM_MEMBER_EXISTS' });
      }

      const pairing = await consumeIdentityPairing(hashPairingCode(pairingCode), email);
      if (!pairing) return res.status(400).json({ error: 'INVALID_PAIRING_CODE' });

      if (await findStaffAccessByOpenId(pairing.openId)) {
        return res.status(409).json({ error: 'TEAM_MEMBER_EXISTS' });
      }

      const member = await saveStaffAccess({
        email,
        openId: pairing.openId,
        name,
        role,
        active: true,
        invitedBy: req.admin.email
      });
      await writeAudit(req, 'team.create', 'staff', email, {
        role: member.role,
        active: Boolean(member.active),
        openIdBound: true
      });
      return res.status(201).json({
        member: staffView({
          ...member,
          is_bootstrap: Boolean(member.open_id && isAllowedOpenId(member.open_id))
        }, req.admin)
      });
    } catch (error) {
      return next(error);
    }
  });

  app.patch('/api/admin/team/:email', requireCapability('team.manage'), async (req, res, next) => {
    try {
      const email = String(req.params.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'INVALID_EMAIL' });

      const current = await findStaffAccess(email);
      if (!current) return res.status(404).json({ error: 'NOT_FOUND' });
      const patch = normalizeTeamPatch(req.body || {});

      const protectedTarget = {
        ...current,
        is_bootstrap: Boolean(current.open_id && isAllowedOpenId(current.open_id))
      };
      const mutationError = staffMutationError(req.admin, protectedTarget, patch);
      if (mutationError) return res.status(400).json({ error: mutationError });
      const member = await saveStaffAccess({
        email,
        name: patch.name ?? current.name,
        openId: current.open_id,
        role: current.open_id && isAllowedOpenId(current.open_id)
          ? 'manager'
          : (patch.role ?? current.role),
        active: patch.active ?? Boolean(current.active),
        invitedBy: current.invited_by || req.admin.email
      });
      if (current.open_id) await revokeAdminSessionsByOpenId(current.open_id);
      await writeAudit(req, 'team.update', 'staff', email, { role: member.role, active: Boolean(member.active), sessionsRevoked: true });
      return res.json({
        member: staffView({
          ...member,
          is_bootstrap: Boolean(member.open_id && isAllowedOpenId(member.open_id))
        }, req.admin)
      });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/admin/team/:email', requireCapability('team.manage'), async (req, res, next) => {
    try {
      const email = String(req.params.email || '').trim().toLowerCase();
      const current = await findStaffAccess(email);
      if (!current) return res.status(404).json({ error: 'NOT_FOUND' });

      const protectedTarget = {
        ...current,
        is_bootstrap: Boolean(current.open_id && isAllowedOpenId(current.open_id))
      };
      const removalError = staffRemovalError(req.admin, protectedTarget);
      if (removalError) return res.status(400).json({ error: removalError });

      const removed = await removeStaffAccess(email);
      if (!removed) return res.status(404).json({ error: 'NOT_FOUND' });
      if (current.open_id) await revokeAdminSessionsByOpenId(current.open_id);
      await writeAudit(req, 'team.remove', 'staff', email, { sessionsRevoked: true });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
}
