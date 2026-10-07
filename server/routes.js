import crypto from 'node:crypto';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import {
  addPhoto,
  addTestimonial,
  createContactLead,
  createStaffInvitation,
  bindStaffAccessFromPairing,
  databaseReady,
  deleteContactLead,
  findStaffAccess,
  findStaffAccessByOpenId,
  findPublishedPhotoByStoragePath,
  getPhoto,
  getProperty,
  getPropertyBySlug,
  listAuditLog,
  listContactLeads,
  listProperties,
  listStaffInvitations,
  listStaffAccess,
  removePhoto,
  removeStaffAccess,
  revokeStaffInvitationsByEmail,
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
import { configuredAdminOrigin, hasDatabase, isAllowedOpenId, legacyStorageRouteEnabled } from './config.js';
import { STAFF_INVITATION_TTL_MS, authCookieNames, callback, clearSessionCookie, currentAdmin, hashInvitationToken, hashPairingCode, login, logout, logoutAll, requireAdmin } from './auth.js';
import {
  auditView,
  canArchiveProperty,
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
import { clientAddress, createRateLimiter, ensureCsrfToken, requestHostOrigin, requireAdminOrigin, requireAdminRequestContext, requireCsrfToken, requireSameOrigin } from './security.js';
import {
  safeFileName,
  storageAssetUrl,
  storageDelete,
  storageGetSignedUrl,
  storageObjectMetadata,
  storageObjectLooksLikeImage,
  storagePathBelongsToProperty,
  storagePresign,
  storageProviderName
} from './storage.js';
import {
  normalizeAuditQuery,
  normalizeContactLead,
  normalizeEmailAddress,
  normalizeLeadStatusRequest,
  normalizePhotoInput,
  normalizePhotoOrder,
  normalizeResourceId,
  normalizeTeamCreate,
  normalizeTeamInvitation,
  normalizeTeamPatch,
  normalizeTestimonial,
  normalizeUploadRequest
} from './validation.js';
import { adminProperties, adminProperty, publicProperties, publicProperty, staffInvitationView } from './presenters.js';
import { logOperationalError } from './operational-logging.js';

const apiSafetyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 5000,
  standardHeaders: 'draft-6',
  legacyHeaders: false,
  identifier: 'api-safety',
  keyGenerator: (req) => ipKeyGenerator(clientAddress(req), 56),
  handler: (req, res, _next, options) => {
    const resetTime = req.rateLimit?.resetTime;
    const retryAfter = resetTime instanceof Date
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : Math.max(1, Math.ceil(options.windowMs / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(options.statusCode).json({ error: 'RATE_LIMITED', retryAfter });
  }
});

const loginLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30, namespace: 'auth-login' });
const callbackLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30, namespace: 'auth-callback' });
const logoutLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 60, namespace: 'auth-logout' });
const sessionProbeLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 120, namespace: 'auth-session' });
const contactLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 8, namespace: 'contact' });
const adminLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 300, namespace: 'admin' });
const uploadLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 120, namespace: 'upload' });
const destructiveLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 60, namespace: 'destructive' });

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

function requireJsonApiBody(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const length = Number(req.get('content-length') || 0);
  const transferEncoding = String(req.get('transfer-encoding') || '').trim();
  const hasBody = (Number.isFinite(length) && length > 0) || Boolean(transferEncoding);

  if (hasBody && !req.is('application/json')) {
    return res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE' });
  }

  return next();
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
    logOperationalError(console.warn, 'audit.write_failed', error);
  }
}

export function registerRoutes(app, { adminMiddleware = requireAdmin() } = {}) {
  app.use('/api', apiSafetyLimiter, requireJsonApiBody);
  app.use(['/api/auth', '/api/admin'], requireAdminOrigin);
  app.use('/api/admin', requireAdminRequestContext);
  app.use('/api/auth', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

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
  app.get('/api/auth/callback', callbackLimiter, callback);
  app.post('/api/auth/logout', requireSameOrigin, requireCsrfToken, logoutLimiter, logout);
  app.post('/api/auth/logout-all', requireSameOrigin, logoutLimiter, requireAdmin(), requireCsrfToken, logoutAll);
  app.get('/api/admin/session', sessionProbeLimiter, async (req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const user = await currentAdmin(req);
      if (!user && req.cookies?.[authCookieNames().sessionCookie]) clearSessionCookie(req, res);
      const csrfToken = ensureCsrfToken(req, res);
      res.json({
        authenticated: Boolean(user),
        user: user ? { email: user.email, name: user.name, role: user.role } : null,
        csrfToken
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
      const publishedPhoto = await findPublishedPhotoByStoragePath(key);
      if (!publishedPhoto) return res.status(404).json({ error: 'NOT_FOUND' });
      const signedUrl = await storageGetSignedUrl(key);
      res.setHeader('Cache-Control', 'no-store');
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
        const publishedPhoto = await findPublishedPhotoByStoragePath(key);
        if (!publishedPhoto) return res.status(404).json({ error: 'NOT_FOUND' });
        const signedUrl = await storageGetSignedUrl(key);
        res.setHeader('Cache-Control', 'no-store');
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
  }, requireSameOrigin, adminApiGuard, adminMiddleware, requireCsrfToken);

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
      const id = normalizeResourceId(req.params.id, { max: 36 });
      const property = await getProperty(id);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      return res.json({ property: adminProperty(property) });
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/admin/properties/:id', requireCapability('property.write'), async (req, res, next) => {
    try {
      const id = normalizeResourceId(req.params.id, { max: 36 });
      const current = await getProperty(id);
      if (!current) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!canMutateProperty(req.admin, current) || !canRequestPublication(req.admin, req.body || {})) {
        return res.status(403).json({ error: 'CAPABILITY_REQUIRED' });
      }
      const property = await saveProperty(req.body, id, {
        requireDraft: !hasCapability(req.admin, 'property.publish')
      });
      await writeAudit(req, 'property.update', 'property', property.id, { title: property.title, status: property.status });
      return res.json({ property: adminProperty(property) });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/admin/properties/:id', requireCapability('property.archive'), destructiveLimiter, async (req, res, next) => {
    try {
      const id = normalizeResourceId(req.params.id, { max: 36 });
      const removed = await softDeleteProperty(id, {
        allowArchive: canArchiveProperty(req.admin)
      });
      if (!removed) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'property.archive', 'property', id);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/uploads/presign', uploadLimiter, requireCapability('media.manage'), async (req, res, next) => {
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
        provider: storageProviderName(),
        uploadHeaders: storageProviderName() === 'r2'
          ? { 'Content-Type': contentType, 'If-None-Match': '*' }
          : { 'Content-Type': contentType }
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/properties/:id/photos', uploadLimiter, requireCapability('media.manage'), async (req, res, next) => {
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
      const propertyId = normalizeResourceId(req.params.id, { max: 36 });
      const property = await getProperty(propertyId);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!canManagePropertyMedia(req.admin, property)) return res.status(403).json({ error: 'CAPABILITY_REQUIRED' });
      if ((property.photos?.length || 0) >= 40) return res.status(409).json({ error: 'PHOTO_LIMIT_REACHED' });

      const extensions = mimeExtensions[contentType];
      const extension = extensionOf(storagePath);
      if (!storagePathBelongsToProperty(storagePath, propertyId) || !extensions?.has(extension)) {
        return res.status(400).json({ error: 'INVALID_ASSET' });
      }

      const objectMetadata = await storageObjectMetadata(storagePath);
      if (!objectMetadata.exists) {
        return res.status(400).json({ error: 'ASSET_NOT_UPLOADED' });
      }

      if (
        objectMetadata.size !== null
        && (objectMetadata.size !== size || objectMetadata.size > 12 * 1024 * 1024)
      ) {
        try { await storageDelete(storagePath); } catch {}
        return res.status(400).json({ error: 'INVALID_ASSET' });
      }

      if (
        objectMetadata.contentType
        && objectMetadata.contentType !== contentType.toLowerCase()
      ) {
        try { await storageDelete(storagePath); } catch {}
        return res.status(400).json({ error: 'INVALID_ASSET' });
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
          propertyId,
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
            logOperationalError(console.warn, 'storage.upload_cleanup_failed', cleanupError);
          }
        }
        throw error;
      }
      await writeAudit(req, 'photo.add', 'photo', photoId, { propertyId, storagePath });
      return res.status(201).json({ photos });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/photos/:id/media', requireCapability('property.read'), async (req, res, next) => {
    try {
      const photoId = normalizeResourceId(req.params.id, { max: 36 });
      const photo = await getPhoto(photoId);
      if (!photo) return res.status(404).json({ error: 'NOT_FOUND' });
      const property = await getProperty(photo.property_id);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      const signedUrl = await storageGetSignedUrl(photo.storage_path);
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(307, signedUrl);
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/admin/photos/:id', destructiveLimiter, requireCapability('media.manage'), async (req, res, next) => {
    try {
      const photoId = normalizeResourceId(req.params.id, { max: 36 });
      const photo = await getPhoto(photoId);
      if (!photo) return res.status(404).json({ error: 'NOT_FOUND' });
      const property = await getProperty(photo.property_id);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!canManagePropertyMedia(req.admin, property)) return res.status(403).json({ error: 'CAPABILITY_REQUIRED' });
      const removed = await removePhoto(photoId, {
        requireDraft: !hasCapability(req.admin, 'property.publish')
      });
      if (!removed) return res.status(404).json({ error: 'NOT_FOUND' });
      try {
        await storageDelete(removed.storage_path);
      } catch (error) {
        logOperationalError(console.warn, 'storage.orphan_cleanup_deferred', error);
      }
      await writeAudit(req, 'photo.remove', 'photo', photoId, { propertyId: removed.property_id });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/admin/properties/:id/photos/order', requireCapability('media.manage'), async (req, res, next) => {
    try {
      const photoIds = normalizePhotoOrder(req.body || {});
      const propertyId = normalizeResourceId(req.params.id, { max: 36 });
      const property = await getProperty(propertyId);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!canManagePropertyMedia(req.admin, property)) return res.status(403).json({ error: 'CAPABILITY_REQUIRED' });
      const photos = await reorderPhotos(propertyId, photoIds, {
        requireDraft: !hasCapability(req.admin, 'property.publish')
      });
      await writeAudit(req, 'photo.reorder', 'property', propertyId, { photoCount: photos.length });
      return res.json({ photos });
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/admin/photos/:id/cover', requireCapability('media.manage'), async (req, res, next) => {
    try {
      const photoId = normalizeResourceId(req.params.id, { max: 36 });
      const photo = await getPhoto(photoId);
      if (!photo) return res.status(404).json({ error: 'NOT_FOUND' });
      const property = await getProperty(photo.property_id);
      if (!property) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!canManagePropertyMedia(req.admin, property)) return res.status(403).json({ error: 'CAPABILITY_REQUIRED' });
      const photos = await setPhotoCover(photoId, {
        requireDraft: !hasCapability(req.admin, 'property.publish')
      });
      if (!photos) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'photo.cover', 'photo', photoId);
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

  app.delete('/api/admin/testimonials/:id', requireCapability('testimonial.manage'), destructiveLimiter, async (req, res, next) => {
    try {
      const id = normalizeResourceId(req.params.id, { max: 36 });
      const removed = await removeTestimonial(id);
      if (!removed) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'testimonial.remove', 'testimonial', id);
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
      const id = normalizeResourceId(req.params.id, { max: 36 });
      const status = normalizeLeadStatusRequest(req.body || {});
      const updated = await updateContactLeadStatus(id, status);
      if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'lead.status', 'lead', id, { status });
      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/admin/leads/:id', requireCapability('lead.erase'), destructiveLimiter, async (req, res, next) => {
    try {
      const id = normalizeResourceId(req.params.id, { max: 36 });
      const removed = await deleteContactLead(id);
      if (!removed) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'lead.delete', 'lead', id, { reason: 'privacy_or_admin_request' });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/audit', requireCapability('audit.read'), async (req, res, next) => {
    try {
      const { limit } = normalizeAuditQuery(req.query || {});
      const audit = (await listAuditLog({ limit })).map(auditView);
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

  app.get('/api/admin/team/invitations', requireCapability('team.manage'), async (req, res, next) => {
    try {
      const invitations = (await listStaffInvitations()).map(staffInvitationView);
      return res.json({ invitations });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/team/invitations', requireCapability('team.manage'), async (req, res, next) => {
    try {
      const { email, name, role } = normalizeTeamInvitation(req.body || {});
      const origin = configuredAdminOrigin() || requestHostOrigin(req);
      if (!origin) return res.status(400).json({ error: 'ADMIN_ORIGIN_NOT_CONFIGURED' });

      const token = crypto.randomBytes(32).toString('base64url');
      const expiresAtMs = Date.now() + STAFF_INVITATION_TTL_MS;
      await createStaffInvitation({
        tokenHash: hashInvitationToken(token),
        email,
        name,
        role,
        invitedBy: req.admin.email,
        expiresAtMs
      });

      await writeAudit(req, 'team.invite', 'staff', email, {
        role,
        expiresAtMs,
        tokenStoredAsHash: true
      });

      return res.status(201).json({
        invitation: {
          email,
          name,
          role,
          expiresAtMs,
          url: `${origin}/admin?invite=${encodeURIComponent(token)}`
        }
      });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/admin/team/invitations/:email', requireCapability('team.manage'), destructiveLimiter, async (req, res, next) => {
    try {
      const email = normalizeEmailAddress(req.params.email, { error: 'INVALID_EMAIL' });
      const revoked = await revokeStaffInvitationsByEmail(email);
      if (!revoked) return res.status(404).json({ error: 'NOT_FOUND' });
      await writeAudit(req, 'team.invite.revoke', 'staff', email, { invitationsRevoked: revoked });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/team', requireCapability('team.manage'), async (req, res, next) => {
    try {
      const { email, pairingCode, name, role } = normalizeTeamCreate(req.body || {});

      const member = await bindStaffAccessFromPairing({
        codeHash: hashPairingCode(pairingCode),
        email,
        name,
        role,
        invitedBy: req.admin.email
      });
      if (!member) return res.status(400).json({ error: 'INVALID_PAIRING_CODE' });
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
      const email = normalizeEmailAddress(req.params.email, { error: 'INVALID_EMAIL' });

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

  app.delete('/api/admin/team/:email', requireCapability('team.manage'), destructiveLimiter, async (req, res, next) => {
    try {
      const email = normalizeEmailAddress(req.params.email, { error: 'INVALID_EMAIL' });
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
