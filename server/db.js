import mysql from 'mysql2/promise';
import { adminOpenIds, databaseSslConfig, hasDatabase, isProduction, maxAdminSessions, sessionIdleTimeoutMs } from './config.js';
import { demoProperties, seedRows } from './seed.js';
import { normalizeContactLead, normalizePropertyInput, normalizePropertySlug, normalizeSiteSettings, normalizeTestimonial } from './validation.js';

let pool;

export function getPool() {
  if (!hasDatabase()) throw new Error('DATABASE_NOT_CONFIGURED');
  if (!pool) {
    pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      connectionLimit: 5,
      waitForConnections: true,
      queueLimit: 100,
      connectTimeout: 10000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      multipleStatements: false,
      ssl: databaseSslConfig()
    });
  }
  return pool;
}

export async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}

export async function databaseReady() {
  if (!hasDatabase()) return { ok: false, reason: 'not_configured' };
  try {
    await getPool().query('SELECT 1');
    return { ok: true, reason: 'ready' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export async function migrate() {
  if (!hasDatabase()) return { configured: false };
  const db = getPool();

  await db.query(`CREATE TABLE IF NOT EXISTS morada_admin_users (
    open_id VARCHAR(191) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    UNIQUE KEY uq_morada_admin_email (email),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  try {
    await db.query('ALTER TABLE morada_admin_users ADD UNIQUE KEY uq_morada_admin_email (email)');
  } catch (error) {
    if (error?.code !== 'ER_DUP_KEYNAME') throw error;
  }

  await db.query(`CREATE TABLE IF NOT EXISTS morada_staff_access (
    email VARCHAR(255) PRIMARY KEY,
    open_id VARCHAR(191) NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'editor',
    active TINYINT(1) NOT NULL DEFAULT 1,
    invited_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_morada_staff_role_active (role, active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  try {
    await db.query('ALTER TABLE morada_staff_access ADD COLUMN open_id VARCHAR(191) NULL');
  } catch (error) {
    if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
  }
  try {
    await db.query('ALTER TABLE morada_staff_access ADD UNIQUE KEY uq_morada_staff_open_id (open_id)');
  } catch (error) {
    if (!['ER_DUP_KEYNAME', 'ER_MULTIPLE_PRI_KEY'].includes(error?.code)) throw error;
  }

  await db.query(`CREATE TABLE IF NOT EXISTS morada_staff_invitations (
    token_hash CHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'editor',
    invited_by VARCHAR(255) NOT NULL,
    expires_at_ms BIGINT UNSIGNED NOT NULL,
    accepted_at TIMESTAMP NULL DEFAULT NULL,
    revoked_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_morada_staff_invitation_email (email, expires_at_ms),
    INDEX idx_morada_staff_invitation_expiry (expires_at_ms)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS morada_identity_pairings (
    code_hash CHAR(64) PRIMARY KEY,
    open_id VARCHAR(191) NOT NULL,
    email VARCHAR(255) NOT NULL,
    expires_at_ms BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_morada_identity_pairing_openid (open_id),
    UNIQUE KEY uq_morada_identity_pairing_email (email),
    INDEX idx_morada_identity_pairing_expiry (expires_at_ms)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`
    DELETE p1 FROM morada_identity_pairings p1
    JOIN morada_identity_pairings p2
      ON p1.email=p2.email
     AND (
       p1.created_at < p2.created_at
       OR (p1.created_at = p2.created_at AND p1.code_hash < p2.code_hash)
     )
  `);
  try {
    await db.query('ALTER TABLE morada_identity_pairings DROP INDEX idx_morada_identity_pairing_email');
  } catch (error) {
    if (error?.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw error;
  }
  try {
    await db.query('ALTER TABLE morada_identity_pairings ADD UNIQUE KEY uq_morada_identity_pairing_email (email)');
  } catch (error) {
    if (error?.code !== 'ER_DUP_KEYNAME') throw error;
  }

  await db.query(`CREATE TABLE IF NOT EXISTS morada_auth_challenges (
    state_hash CHAR(64) PRIMARY KEY,
    redirect_uri VARCHAR(500) NOT NULL,
    invitation_hash CHAR(64) NULL,
    expires_at_ms BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_morada_auth_challenges_expiry (expires_at_ms)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  try {
    await db.query('ALTER TABLE morada_auth_challenges ADD COLUMN invitation_hash CHAR(64) NULL');
  } catch (error) {
    if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
  }

  await db.query(`CREATE TABLE IF NOT EXISTS morada_admin_sessions (
    jti CHAR(36) PRIMARY KEY,
    open_id VARCHAR(191) NOT NULL,
    email VARCHAR(255) NOT NULL,
    expires_at_ms BIGINT UNSIGNED NOT NULL,
    last_seen_at_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
    revoked_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_morada_admin_sessions_openid (open_id, expires_at_ms),
    INDEX idx_morada_admin_sessions_email (email, expires_at_ms),
    INDEX idx_morada_admin_sessions_active (revoked_at, expires_at_ms)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  try {
    await db.query('ALTER TABLE morada_admin_sessions ADD COLUMN last_seen_at_ms BIGINT UNSIGNED NOT NULL DEFAULT 0');
  } catch (error) {
    if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
  }
  await db.execute(
    'UPDATE morada_admin_sessions SET last_seen_at_ms=? WHERE last_seen_at_ms=0 AND revoked_at IS NULL',
    [Date.now()]
  );

  const bootstrapOpenIds = adminOpenIds();
  if (bootstrapOpenIds.length) {
    const placeholders = bootstrapOpenIds.map(() => '?').join(',');
    await db.execute(
      `UPDATE morada_admin_sessions s
       LEFT JOIN morada_staff_access a ON a.open_id=s.open_id
       SET s.revoked_at=COALESCE(s.revoked_at, CURRENT_TIMESTAMP)
       WHERE (
         a.invited_by='environment'
         AND (a.open_id IS NULL OR a.open_id NOT IN (${placeholders}))
       )
       AND s.revoked_at IS NULL`,
      bootstrapOpenIds
    );
    await db.execute(
      `UPDATE morada_staff_access
       SET active=0, updated_at=CURRENT_TIMESTAMP
       WHERE invited_by='environment'
         AND (open_id IS NULL OR open_id NOT IN (${placeholders}))`,
      bootstrapOpenIds
    );
  } else {
    await db.execute(
      `UPDATE morada_admin_sessions s
       JOIN morada_staff_access a ON a.open_id=s.open_id
       SET s.revoked_at=COALESCE(s.revoked_at, CURRENT_TIMESTAMP)
       WHERE a.invited_by='environment' AND s.revoked_at IS NULL`
    );
    await db.execute(
      "UPDATE morada_staff_access SET active=0, updated_at=CURRENT_TIMESTAMP WHERE invited_by='environment'"
    );
  }

  await db.query(`CREATE TABLE IF NOT EXISTS morada_properties (
    id CHAR(36) PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    slug VARCHAR(180) NOT NULL UNIQUE,
    location VARCHAR(180) NOT NULL,
    city VARCHAR(120) NOT NULL,
    purpose VARCHAR(30) NOT NULL,
    type VARCHAR(50) NOT NULL,
    price DECIMAL(14,2) NOT NULL DEFAULT 0,
    price_label VARCHAR(100) NOT NULL,
    bedrooms INT NOT NULL DEFAULT 0,
    bathrooms INT NOT NULL DEFAULT 0,
    area_m2 DECIMAL(10,2) NOT NULL DEFAULT 0,
    suites INT NOT NULL DEFAULT 0,
    parking_spots INT NOT NULL DEFAULT 0,
    condo_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
    iptu DECIMAL(12,2) NOT NULL DEFAULT 0,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    is_featured TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_morada_properties_status_updated (status, updated_at),
    INDEX idx_morada_properties_featured (is_featured, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  for (const statement of [
    'ALTER TABLE morada_properties ADD COLUMN suites INT NOT NULL DEFAULT 0',
    'ALTER TABLE morada_properties ADD COLUMN parking_spots INT NOT NULL DEFAULT 0',
    'ALTER TABLE morada_properties ADD COLUMN condo_fee DECIMAL(10,2) NOT NULL DEFAULT 0',
    'ALTER TABLE morada_properties ADD COLUMN iptu DECIMAL(12,2) NOT NULL DEFAULT 0'
  ]) {
    try {
      await db.query(statement);
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }

  await db.query(`CREATE TABLE IF NOT EXISTS morada_property_photos (
    id CHAR(36) PRIMARY KEY,
    property_id CHAR(36) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    url VARCHAR(600) NOT NULL,
    alt_text VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_cover TINYINT(1) NOT NULL DEFAULT 0,
    storage_provider VARCHAR(20) NOT NULL DEFAULT 'legacy',
    mime_type VARCHAR(80),
    file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
    width INT UNSIGNED NOT NULL DEFAULT 0,
    height INT UNSIGNED NOT NULL DEFAULT 0,
    uploaded_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_morada_property_photo FOREIGN KEY (property_id) REFERENCES morada_properties(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_morada_property_photos_storage_path (storage_path),
    INDEX idx_morada_property_photos (property_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  for (const statement of [
    "ALTER TABLE morada_property_photos ADD COLUMN storage_provider VARCHAR(20) NOT NULL DEFAULT 'legacy'",
    'ALTER TABLE morada_property_photos ADD COLUMN mime_type VARCHAR(80)',
    'ALTER TABLE morada_property_photos ADD COLUMN file_size BIGINT UNSIGNED NOT NULL DEFAULT 0',
    'ALTER TABLE morada_property_photos ADD COLUMN width INT UNSIGNED NOT NULL DEFAULT 0',
    'ALTER TABLE morada_property_photos ADD COLUMN height INT UNSIGNED NOT NULL DEFAULT 0',
    'ALTER TABLE morada_property_photos ADD COLUMN uploaded_by VARCHAR(255)'
  ]) {
    try {
      await db.query(statement);
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }

  try {
    await db.query(
      'ALTER TABLE morada_property_photos ADD UNIQUE KEY uniq_morada_property_photos_storage_path (storage_path)'
    );
  } catch (error) {
    if (error?.code !== 'ER_DUP_KEYNAME') throw error;
  }

  await db.query(`CREATE TABLE IF NOT EXISTS morada_site_settings (
    id TINYINT PRIMARY KEY DEFAULT 1,
    phone_display VARCHAR(50),
    whatsapp VARCHAR(30),
    email VARCHAR(120),
    address VARCHAR(180),
    crci VARCHAR(30),
    area VARCHAR(120),
    instagram_url VARCHAR(200),
    instagram_display VARCHAR(60),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS morada_testimonials (
    id CHAR(36) PRIMARY KEY,
    author VARCHAR(120) NOT NULL,
    quote TEXT NOT NULL,
    location VARCHAR(120),
    year VARCHAR(10),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS morada_audit_log (
    id CHAR(36) PRIMARY KEY,
    actor_email VARCHAR(255) NOT NULL,
    actor_open_id VARCHAR(191),
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id VARCHAR(191),
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_morada_audit_created (created_at),
    INDEX idx_morada_audit_actor_created (actor_email, created_at),
    INDEX idx_morada_audit_entity_created (entity_type, entity_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  try {
    await db.query('ALTER TABLE morada_audit_log ADD COLUMN actor_open_id VARCHAR(191) NULL AFTER actor_email');
  } catch (error) {
    if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
  }

  await db.query(`CREATE TABLE IF NOT EXISTS morada_contact_leads (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    interest VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    property_path VARCHAR(240),
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_morada_contact_leads_status_created (status, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  if (!isProduction) {
    await db.execute(`UPDATE morada_properties SET
      location = CASE slug
        WHEN 'apartamento-solar' THEN 'Lourdes · Belo Horizonte'
        WHEN 'casa-ipe' THEN 'Belvedere · Belo Horizonte'
        WHEN 'cobertura-horizonte' THEN 'Savassi · Belo Horizonte'
        WHEN 'loft-harmonia' THEN 'Buritis · Belo Horizonte'
        WHEN 'casa-cedro' THEN 'Lourdes · Belo Horizonte'
        WHEN 'apartamento-mirante' THEN 'Savassi · Belo Horizonte'
        ELSE location
      END,
      city = 'Belo Horizonte',
      description = REPLACE(REPLACE(description, 'Pinheiros', 'Lourdes'), 'Jardins', 'Savassi')
      WHERE slug IN ('apartamento-solar','casa-ipe','cobertura-horizonte','loft-harmonia','casa-cedro','apartamento-mirante')
        AND (city = 'São Paulo' OR location LIKE '%São Paulo%' OR description LIKE '%Pinheiros%' OR description LIKE '%Jardins%')`);
  }

  const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM morada_properties');
  const allowDemoSeed = !isProduction && process.env.SEED_DEMO_DATA !== 'false';
  if (Number(count) === 0 && allowDemoSeed) {
    const { randomUUID } = await import('node:crypto');
    for (const item of demoProperties) {
      const id = randomUUID();
      await db.execute(
        'INSERT INTO morada_properties (id,title,slug,location,city,purpose,type,price,price_label,bedrooms,bathrooms,area_m2,description,status,is_featured) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [id, item.title, item.slug, item.location, item.city, item.purpose, item.type, item.price, item.priceLabel, item.bedrooms, item.bathrooms, item.areaM2, item.description, item.status, item.featured]
      );
      await db.execute(
        'INSERT INTO morada_property_photos (id,property_id,storage_path,url,alt_text,sort_order,is_cover) VALUES (?,?,?,?,?,?,?)',
        [randomUUID(), id, `demo/${item.slug}`, item.coverUrl, item.title, 0, 1]
      );
    }
  }

  return { configured: true };
}

function propertyQuery(extra = '') {
  return `SELECT p.*, CASE WHEN p.price < 1500000 THEN 1 WHEN p.price <= 3000000 THEN 2 ELSE 3 END AS price_band, COALESCE(ph.url, '') AS cover_url FROM morada_properties p LEFT JOIN morada_property_photos ph ON ph.property_id = p.id AND ph.is_cover = 1 ${extra}`;
}

async function hydratePhotos(rows) {
  if (!rows.length) return rows;
  const db = getPool();
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(',');
  const [photos] = await db.execute(
    `SELECT id, property_id, storage_path, url, alt_text, sort_order, is_cover, storage_provider, mime_type, file_size, width, height, uploaded_by, created_at FROM morada_property_photos WHERE property_id IN (${placeholders}) ORDER BY sort_order ASC, created_at ASC`,
    ids
  );
  const grouped = new Map();
  for (const photo of photos) {
    if (!grouped.has(photo.property_id)) grouped.set(photo.property_id, []);
    grouped.get(photo.property_id).push(photo);
  }
  for (const row of rows) row.photos = grouped.get(row.id) || [];
  return rows;
}

export async function listProperties({ publicOnly = false } = {}) {
  if (!hasDatabase()) {
    if (isProduction) return [];
    return publicOnly ? seedRows().filter((item) => item.status === 'published') : seedRows();
  }
  const db = getPool();
  const [rows] = await db.query(propertyQuery(publicOnly ? "WHERE p.status = 'published' ORDER BY p.is_featured DESC, p.updated_at DESC" : "ORDER BY (p.status = 'archived') ASC, p.updated_at DESC"));
  return hydratePhotos(rows);
}

export async function getProperty(id) {
  if (!hasDatabase()) return isProduction ? null : (seedRows().find((row) => row.id === id) || null);
  const db = getPool();
  const [rows] = await db.execute(propertyQuery('WHERE p.id = ? LIMIT 1'), [id]);
  if (!rows[0]) return null;
  await hydratePhotos(rows);
  return rows[0];
}

export async function getPropertyBySlug(slug) {
  const normalizedSlug = normalizePropertySlug(slug);
  if (!hasDatabase()) return isProduction ? null : (seedRows().find((row) => row.slug === normalizedSlug && row.status === 'published') || null);
  const db = getPool();
  const [rows] = await db.execute(propertyQuery("WHERE p.slug = ? AND p.status = 'published' LIMIT 1"), [normalizedSlug]);
  if (!rows[0]) return null;
  await hydratePhotos(rows);
  return rows[0];
}

export async function listPhotos(propertyId) {
  const db = getPool();
  const [rows] = await db.execute('SELECT id, property_id, storage_path, url, alt_text, sort_order, is_cover, storage_provider, mime_type, file_size, width, height, uploaded_by, created_at FROM morada_property_photos WHERE property_id = ? ORDER BY sort_order ASC, created_at ASC', [propertyId]);
  return rows;
}

export function enforcePropertyWriteScope(data, { requireDraft = false } = {}) {
  if (requireDraft && (data.status !== 'draft' || data.featured)) {
    throw new Error('CAPABILITY_REQUIRED');
  }
  return data;
}

export async function saveProperty(input, id = null, { requireDraft = false } = {}) {
  const db = getPool();
  const { randomUUID } = await import('node:crypto');
  const data = enforcePropertyWriteScope(normalizePropertyInput(input), { requireDraft });
  const propertyId = id || randomUUID();
  const generatedSlug = data.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  if (id) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [[existing]] = await connection.execute(
        'SELECT slug,status FROM morada_properties WHERE id=? LIMIT 1 FOR UPDATE',
        [propertyId]
      );
      if (!existing) {
        await connection.rollback();
        return null;
      }
      if (requireDraft && String(existing.status) !== 'draft') {
        throw new Error('CAPABILITY_REQUIRED');
      }

      const slug = String(data.slug || existing.slug || generatedSlug).slice(0, 170) || propertyId;
      await connection.execute(
        'UPDATE morada_properties SET title=?,slug=?,location=?,city=?,purpose=?,type=?,price=?,price_label=?,bedrooms=?,bathrooms=?,area_m2=?,suites=?,parking_spots=?,condo_fee=?,iptu=?,description=?,status=?,is_featured=? WHERE id=?',
        [
          data.title, slug, data.location, data.city, data.purpose, data.type, data.price, data.priceLabel,
          data.bedrooms, data.bathrooms, data.areaM2, data.suites, data.parkingSpots, data.condoFee, data.iptu,
          data.description, data.status, data.featured ? 1 : 0, propertyId
        ]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (error?.code === 'ER_DUP_ENTRY') throw new Error('SLUG_CONFLICT');
      throw error;
    } finally {
      connection.release();
    }
    return getProperty(propertyId);
  }

  const slug = String(data.slug || generatedSlug).slice(0, 170) || propertyId;
  const values = [
    propertyId, data.title, slug, data.location, data.city, data.purpose, data.type, data.price, data.priceLabel,
    data.bedrooms, data.bathrooms, data.areaM2, data.suites, data.parkingSpots, data.condoFee, data.iptu,
    data.description, data.status, data.featured ? 1 : 0
  ];

  try {
    await db.execute(
      'INSERT INTO morada_properties (id,title,slug,location,city,purpose,type,price,price_label,bedrooms,bathrooms,area_m2,suites,parking_spots,condo_fee,iptu,description,status,is_featured) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      values
    );
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') throw new Error('SLUG_CONFLICT');
    throw error;
  }

  return getProperty(propertyId);
}

export async function softDeleteProperty(id, { allowArchive = false } = {}) {
  if (!allowArchive) throw new Error('CAPABILITY_REQUIRED');
  const db = getPool();
  const [result] = await db.execute("UPDATE morada_properties SET status='archived' WHERE id=?", [id]);
  return result.affectedRows > 0;
}

export async function addPhoto({
  id,
  propertyId,
  storagePath,
  url,
  altText,
  sortOrder,
  isCover,
  storageProvider = 'legacy',
  mimeType = '',
  fileSize = 0,
  width = 0,
  height = 0,
  uploadedBy = '',
  requireDraft = false
}) {
  const db = getPool();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[property]] = await connection.execute(
      'SELECT id,status FROM morada_properties WHERE id=? LIMIT 1 FOR UPDATE',
      [propertyId]
    );
    if (!property) throw new Error('NOT_FOUND');
    if (requireDraft && String(property.status) !== 'draft') throw new Error('CAPABILITY_REQUIRED');
    const [[{ photo_count: photoCount }]] = await connection.execute(
      'SELECT COUNT(*) AS photo_count FROM morada_property_photos WHERE property_id=?',
      [propertyId]
    );
    if (Number(photoCount) >= 40) throw new Error('PHOTO_LIMIT_REACHED');
    if (isCover) await connection.execute('UPDATE morada_property_photos SET is_cover=0 WHERE property_id=?', [propertyId]);
    try {
      await connection.execute(
        'INSERT INTO morada_property_photos (id,property_id,storage_path,url,alt_text,sort_order,is_cover,storage_provider,mime_type,file_size,width,height,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          id,
          propertyId,
          String(storagePath).slice(0, 500),
          String(url).slice(0, 600),
          String(altText || 'Foto do imóvel').trim().slice(0, 255),
          Number(sortOrder || 0),
          isCover ? 1 : 0,
          String(storageProvider || 'legacy').slice(0, 20),
          String(mimeType || '').slice(0, 80),
          Math.max(0, Number(fileSize || 0)),
          Math.max(0, Number(width || 0)),
          Math.max(0, Number(height || 0)),
          String(uploadedBy || '').slice(0, 255)
        ]
      );
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') throw new Error('ASSET_ALREADY_REGISTERED');
      throw error;
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return listPhotos(propertyId);
}

export async function findPublishedPhotoByStoragePath(storagePath) {
  if (!hasDatabase()) return null;
  const db = getPool();
  const key = String(storagePath || '').trim().slice(0, 500);
  if (!key) return null;
  const [rows] = await db.execute(
    `SELECT ph.id,ph.property_id,ph.storage_path
     FROM morada_property_photos ph
     INNER JOIN morada_properties p ON p.id=ph.property_id
     WHERE ph.storage_path=? AND p.status='published'
     LIMIT 1`,
    [key]
  );
  return rows[0] || null;
}

export async function getPhoto(photoId) {
  const db = getPool();
  const [rows] = await db.execute(
    'SELECT id,property_id,storage_path,url,alt_text,sort_order,is_cover,storage_provider,mime_type,file_size,width,height,uploaded_by,created_at FROM morada_property_photos WHERE id=? LIMIT 1',
    [String(photoId || '').slice(0, 36)]
  );
  return rows[0] || null;
}

export async function removePhoto(photoId, { requireDraft = false } = {}) {
  const db = getPool();
  const connection = await db.getConnection();
  let photo;
  try {
    await connection.beginTransaction();
    const [[lockedPhoto]] = await connection.execute(
      'SELECT property_id, is_cover, storage_path, storage_provider FROM morada_property_photos WHERE id=? LIMIT 1 FOR UPDATE',
      [photoId]
    );
    if (!lockedPhoto) {
      await connection.rollback();
      return false;
    }
    photo = lockedPhoto;
    const [[property]] = await connection.execute(
      'SELECT status FROM morada_properties WHERE id=? LIMIT 1 FOR UPDATE',
      [photo.property_id]
    );
    if (!property) throw new Error('NOT_FOUND');
    if (requireDraft && String(property.status) !== 'draft') throw new Error('CAPABILITY_REQUIRED');
    await connection.execute('DELETE FROM morada_property_photos WHERE id=?', [photoId]);
    if (photo.is_cover) {
      const [[nextPhoto]] = await connection.execute(
        'SELECT id FROM morada_property_photos WHERE property_id=? ORDER BY sort_order ASC, created_at ASC LIMIT 1 FOR UPDATE',
        [photo.property_id]
      );
      if (nextPhoto) await connection.execute('UPDATE morada_property_photos SET is_cover=1 WHERE id=?', [nextPhoto.id]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return photo;
}

export async function setPhotoCover(photoId, { requireDraft = false } = {}) {
  const db = getPool();
  const connection = await db.getConnection();
  let propertyId;
  try {
    await connection.beginTransaction();
    const [[photo]] = await connection.execute(
      'SELECT property_id FROM morada_property_photos WHERE id=? LIMIT 1 FOR UPDATE',
      [photoId]
    );
    if (!photo) {
      await connection.rollback();
      return null;
    }
    propertyId = photo.property_id;
    const [[property]] = await connection.execute(
      'SELECT status FROM morada_properties WHERE id=? LIMIT 1 FOR UPDATE',
      [propertyId]
    );
    if (!property) throw new Error('NOT_FOUND');
    if (requireDraft && String(property.status) !== 'draft') throw new Error('CAPABILITY_REQUIRED');
    await connection.execute('UPDATE morada_property_photos SET is_cover=0 WHERE property_id=?', [propertyId]);
    await connection.execute('UPDATE morada_property_photos SET is_cover=1 WHERE id=? AND property_id=?', [photoId, propertyId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return listPhotos(propertyId);
}

export async function reorderPhotos(propertyId, photoIds, { requireDraft = false } = {}) {
  const db = getPool();
  const uniqueIds = [...new Set(photoIds.map((id) => String(id || '')).filter(Boolean))].slice(0, 100);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const [[property]] = await connection.execute(
      'SELECT status FROM morada_properties WHERE id=? LIMIT 1 FOR UPDATE',
      [propertyId]
    );
    if (!property) throw new Error('NOT_FOUND');
    if (requireDraft && String(property.status) !== 'draft') throw new Error('CAPABILITY_REQUIRED');
    const [existing] = await connection.execute(
      'SELECT id FROM morada_property_photos WHERE property_id=? ORDER BY id FOR UPDATE',
      [propertyId]
    );
    const existingIds = existing.map((row) => String(row.id)).sort();
    const incomingIds = [...uniqueIds].sort();
    if (
      existingIds.length !== incomingIds.length
      || existingIds.some((id, index) => id !== incomingIds[index])
    ) {
      throw new Error('INVALID_ORDER');
    }

    for (let index = 0; index < uniqueIds.length; index += 1) {
      await connection.execute(
        'UPDATE morada_property_photos SET sort_order=? WHERE id=? AND property_id=?',
        [index, uniqueIds[index], propertyId]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return listPhotos(propertyId);
}

export async function createIdentityPairing({ codeHash, openId, email, expiresAtMs }) {
  const db = getPool();
  const now = Date.now();
  const normalizedOpenId = String(openId || '').trim().slice(0, 191);
  const normalizedEmail = String(email || '').trim().toLowerCase().slice(0, 255);
  const normalizedHash = String(codeHash || '').trim().slice(0, 64);

  if (!normalizedOpenId || !normalizedEmail || normalizedHash.length !== 64) {
    throw new Error('INVALID_PAIRING');
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM morada_identity_pairings WHERE expires_at_ms<=?', [now]);
    await connection.execute(
      'DELETE FROM morada_identity_pairings WHERE open_id=? OR email=?',
      [normalizedOpenId, normalizedEmail]
    );
    await connection.execute(
      'INSERT INTO morada_identity_pairings (code_hash,open_id,email,expires_at_ms) VALUES (?,?,?,?)',
      [normalizedHash, normalizedOpenId, normalizedEmail, Number(expiresAtMs)]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function bindStaffAccessFromPairing({
  codeHash,
  email,
  name,
  role = 'editor',
  invitedBy = null
}) {
  const db = getPool();
  const connection = await db.getConnection();
  const normalizedHash = String(codeHash || '').trim().slice(0, 64);
  const normalizedEmail = String(email || '').trim().toLowerCase().slice(0, 255);
  const normalizedName = String(name || normalizedEmail).trim().slice(0, 255);
  const normalizedRole = role === 'manager' ? 'manager' : 'editor';

  if (normalizedHash.length !== 64 || !normalizedEmail || !normalizedName) {
    throw new Error('INVALID_PAIRING');
  }

  try {
    await connection.beginTransaction();

    const [[pairing]] = await connection.execute(
      'SELECT code_hash,open_id,email,expires_at_ms FROM morada_identity_pairings WHERE code_hash=? LIMIT 1 FOR UPDATE',
      [normalizedHash]
    );

    if (!pairing) {
      await connection.rollback();
      return null;
    }

    if (Number(pairing.expires_at_ms) <= Date.now()) {
      await connection.execute('DELETE FROM morada_identity_pairings WHERE code_hash=?', [normalizedHash]);
      await connection.commit();
      return null;
    }

    const pairingEmail = String(pairing.email || '').trim().toLowerCase();
    const pairingOpenId = String(pairing.open_id || '').trim().slice(0, 191);

    if (pairingEmail !== normalizedEmail || !pairingOpenId) {
      await connection.rollback();
      return null;
    }

    const [[emailConflict]] = await connection.execute(
      'SELECT email FROM morada_staff_access WHERE email=? LIMIT 1 FOR UPDATE',
      [normalizedEmail]
    );
    if (emailConflict) throw new Error('TEAM_MEMBER_EXISTS');

    const [[openIdConflict]] = await connection.execute(
      'SELECT email FROM morada_staff_access WHERE open_id=? LIMIT 1 FOR UPDATE',
      [pairingOpenId]
    );
    if (openIdConflict) throw new Error('TEAM_MEMBER_EXISTS');

    await connection.execute(
      'INSERT INTO morada_staff_access (email,open_id,name,role,active,invited_by) VALUES (?,?,?,?,1,?)',
      [
        normalizedEmail,
        pairingOpenId,
        normalizedName,
        normalizedRole,
        invitedBy ? String(invitedBy).slice(0, 255) : null
      ]
    );

    await connection.execute(
      'DELETE FROM morada_identity_pairings WHERE code_hash=?',
      [normalizedHash]
    );

    await connection.commit();
    return findStaffAccessByOpenId(pairingOpenId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function createStaffInvitation({ tokenHash, email, name, role = 'editor', invitedBy, expiresAtMs }) {
  const db = getPool();
  const normalizedHash = String(tokenHash || '').trim().slice(0, 64);
  const normalizedEmail = String(email || '').trim().toLowerCase().slice(0, 255);
  const normalizedName = String(name || '').trim().slice(0, 255);
  const normalizedRole = role === 'manager' ? 'manager' : 'editor';
  const normalizedInvitedBy = String(invitedBy || '').trim().slice(0, 255);
  const expiry = Number(expiresAtMs);

  if (
    normalizedHash.length !== 64
    || !normalizedEmail
    || !normalizedName
    || !normalizedInvitedBy
    || !Number.isSafeInteger(expiry)
    || expiry <= Date.now()
  ) {
    throw new Error('INVALID_INVITATION');
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [[existingMember]] = await connection.execute(
      'SELECT email FROM morada_staff_access WHERE email=? LIMIT 1 FOR UPDATE',
      [normalizedEmail]
    );
    if (existingMember) throw new Error('TEAM_MEMBER_EXISTS');

    await connection.execute(
      `UPDATE morada_staff_invitations
       SET revoked_at=COALESCE(revoked_at, CURRENT_TIMESTAMP)
       WHERE email=? AND accepted_at IS NULL AND revoked_at IS NULL`,
      [normalizedEmail]
    );

    await connection.execute(
      `INSERT INTO morada_staff_invitations
       (token_hash,email,name,role,invited_by,expires_at_ms)
       VALUES (?,?,?,?,?,?)`,
      [normalizedHash, normalizedEmail, normalizedName, normalizedRole, normalizedInvitedBy, expiry]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') throw new Error('INVITATION_EXISTS');
    throw error;
  } finally {
    connection.release();
  }
}

export async function findStaffInvitationByHash(tokenHash) {
  const db = getPool();
  const normalizedHash = String(tokenHash || '').trim().slice(0, 64);
  if (normalizedHash.length !== 64) return null;
  const [rows] = await db.execute(
    `SELECT token_hash,email,name,role,invited_by,expires_at_ms,accepted_at,revoked_at,created_at
     FROM morada_staff_invitations WHERE token_hash=? LIMIT 1`,
    [normalizedHash]
  );
  return rows[0] || null;
}

export async function listStaffInvitations() {
  const db = getPool();
  const [rows] = await db.execute(
    `SELECT email,name,role,invited_by,expires_at_ms,created_at
     FROM morada_staff_invitations
     WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at_ms>?
     ORDER BY expires_at_ms ASC, created_at DESC`,
    [Date.now()]
  );
  return rows;
}

export async function revokeStaffInvitationsByEmail(email) {
  const db = getPool();
  const normalizedEmail = String(email || '').trim().toLowerCase().slice(0, 255);
  if (!normalizedEmail) return 0;
  const [result] = await db.execute(
    `UPDATE morada_staff_invitations
     SET revoked_at=COALESCE(revoked_at, CURRENT_TIMESTAMP)
     WHERE email=? AND accepted_at IS NULL AND revoked_at IS NULL`,
    [normalizedEmail]
  );
  return Number(result.affectedRows || 0);
}

export async function acceptStaffInvitation({ tokenHash, openId, email }) {
  const db = getPool();
  const normalizedHash = String(tokenHash || '').trim().slice(0, 64);
  const normalizedOpenId = String(openId || '').trim().slice(0, 191);
  const normalizedEmail = String(email || '').trim().toLowerCase().slice(0, 255);

  if (normalizedHash.length !== 64 || !normalizedOpenId || !normalizedEmail) {
    throw new Error('INVALID_INVITATION');
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[invitation]] = await connection.execute(
      `SELECT token_hash,email,name,role,invited_by,expires_at_ms,accepted_at,revoked_at
       FROM morada_staff_invitations WHERE token_hash=? LIMIT 1 FOR UPDATE`,
      [normalizedHash]
    );

    if (!invitation) {
      await connection.rollback();
      return null;
    }

    if (
      invitation.accepted_at
      || invitation.revoked_at
      || Number(invitation.expires_at_ms) <= Date.now()
    ) {
      await connection.rollback();
      return null;
    }

    const invitationEmail = String(invitation.email || '').trim().toLowerCase();
    if (invitationEmail !== normalizedEmail) throw new Error('INVITATION_EMAIL_MISMATCH');

    const [[emailConflict]] = await connection.execute(
      'SELECT email FROM morada_staff_access WHERE email=? LIMIT 1 FOR UPDATE',
      [normalizedEmail]
    );
    if (emailConflict) throw new Error('TEAM_MEMBER_EXISTS');

    const [[openIdConflict]] = await connection.execute(
      'SELECT email FROM morada_staff_access WHERE open_id=? LIMIT 1 FOR UPDATE',
      [normalizedOpenId]
    );
    if (openIdConflict) throw new Error('TEAM_MEMBER_EXISTS');

    await connection.execute(
      `INSERT INTO morada_staff_access (email,open_id,name,role,active,invited_by)
       VALUES (?,?,?,?,1,?)`,
      [
        normalizedEmail,
        normalizedOpenId,
        String(invitation.name || normalizedEmail).slice(0, 255),
        invitation.role === 'manager' ? 'manager' : 'editor',
        String(invitation.invited_by || '').slice(0, 255)
      ]
    );

    await connection.execute(
      'UPDATE morada_staff_invitations SET accepted_at=CURRENT_TIMESTAMP WHERE token_hash=?',
      [normalizedHash]
    );
    await connection.commit();
    return findStaffAccessByOpenId(normalizedOpenId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function createAuthChallenge({ stateHash, redirectUri, expiresAtMs, invitationHash = null }) {
  const db = getPool();
  const now = Date.now();
  await db.execute('DELETE FROM morada_auth_challenges WHERE expires_at_ms<=?', [now]);
  await db.execute(
    'INSERT INTO morada_auth_challenges (state_hash,redirect_uri,invitation_hash,expires_at_ms) VALUES (?,?,?,?)',
    [
      String(stateHash).slice(0, 64),
      String(redirectUri).slice(0, 500),
      invitationHash ? String(invitationHash).slice(0, 64) : null,
      Number(expiresAtMs)
    ]
  );
}

export async function consumeAuthChallenge(stateHash) {
  const db = getPool();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[challenge]] = await connection.execute(
      'SELECT state_hash,redirect_uri,invitation_hash,expires_at_ms FROM morada_auth_challenges WHERE state_hash=? LIMIT 1 FOR UPDATE',
      [String(stateHash).slice(0, 64)]
    );
    if (!challenge) {
      await connection.rollback();
      return null;
    }

    await connection.execute('DELETE FROM morada_auth_challenges WHERE state_hash=?', [challenge.state_hash]);
    await connection.commit();

    if (Number(challenge.expires_at_ms) <= Date.now()) return null;
    return {
      redirectUri: String(challenge.redirect_uri),
      invitationHash: challenge.invitation_hash ? String(challenge.invitation_hash) : null,
      expiresAtMs: Number(challenge.expires_at_ms)
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function createAdminSession({ jti, openId, email, expiresAtMs }) {
  const db = getPool();
  const now = Date.now();
  const normalizedEmail = String(email).trim().toLowerCase().slice(0, 255);

  // Keep table-wide retention sweeps outside the identity-locked transaction to avoid gap-lock cycles with session inserts.
  await db.execute(
    'DELETE FROM morada_admin_sessions WHERE expires_at_ms<=?',
    [now]
  );
  await db.execute(
    'DELETE FROM morada_admin_sessions WHERE revoked_at IS NOT NULL AND revoked_at < (CURRENT_TIMESTAMP - INTERVAL 7 DAY)'
  );

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [[boundIdentity]] = await connection.execute(
      'SELECT open_id,active FROM morada_staff_access WHERE open_id=? LIMIT 1 FOR UPDATE',
      [String(openId).slice(0, 191)]
    );
    if (!boundIdentity || !boundIdentity.active) throw new Error('SESSION_IDENTITY_NOT_BOUND');

    await connection.execute(
      'INSERT INTO morada_admin_sessions (jti,open_id,email,expires_at_ms,last_seen_at_ms) VALUES (?,?,?,?,?)',
      [
        String(jti).slice(0, 36),
        String(openId).slice(0, 191),
        normalizedEmail,
        Number(expiresAtMs),
        now
      ]
    );

    const [previousActive] = await connection.execute(
      `SELECT jti
       FROM morada_admin_sessions
       WHERE open_id=? AND jti<>? AND revoked_at IS NULL AND expires_at_ms>?
       ORDER BY expires_at_ms DESC, created_at DESC, jti DESC`,
      [String(openId).slice(0, 191), String(jti).slice(0, 36), now]
    );

    const keepPrevious = Math.max(0, maxAdminSessions() - 1);
    const stale = previousActive.slice(keepPrevious).map((row) => String(row.jti));
    for (const staleJti of stale) {
      await connection.execute(
        'UPDATE morada_admin_sessions SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE jti=?',
        [staleJti]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function adminSessionState(session, { nowMs = Date.now(), idleTimeoutMs = sessionIdleTimeoutMs() } = {}) {
  if (!session) return 'missing';
  if (session.revoked_at) return 'revoked';
  if (!Number.isFinite(Number(session.expires_at_ms)) || Number(session.expires_at_ms) <= nowMs) return 'absolute_expired';
  if (!Number.isFinite(Number(session.last_seen_at_ms)) || Number(session.last_seen_at_ms) <= nowMs - idleTimeoutMs) return 'idle_expired';
  return 'active';
}

export async function findActiveAdminSession(jti) {
  const db = getPool();
  const now = Date.now();
  const normalizedJti = String(jti || '').slice(0, 36);
  const [rows] = await db.execute(
    `SELECT jti,open_id,email,expires_at_ms,last_seen_at_ms,revoked_at
     FROM morada_admin_sessions
     WHERE jti=?
     LIMIT 1`,
    [normalizedJti]
  );
  const session = rows[0] || null;
  const state = adminSessionState(session, { nowMs: now });
  if (state === 'missing' || state === 'revoked') return null;

  if (state === 'absolute_expired' || state === 'idle_expired') {
    await db.execute(
      'UPDATE morada_admin_sessions SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE jti=?',
      [normalizedJti]
    );
    return null;
  }

  if (now - Number(session.last_seen_at_ms) >= 5 * 60 * 1000) {
    await db.execute(
      'UPDATE morada_admin_sessions SET last_seen_at_ms=? WHERE jti=? AND revoked_at IS NULL',
      [now, normalizedJti]
    );
    session.last_seen_at_ms = now;
  }

  return session;
}

export async function revokeAdminSession(jti) {
  if (!jti) return false;
  const db = getPool();
  const [result] = await db.execute(
    'UPDATE morada_admin_sessions SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE jti=?',
    [String(jti).slice(0, 36)]
  );
  return result.affectedRows > 0;
}

export async function revokeAdminSessionsByOpenId(openId) {
  const db = getPool();
  const normalized = String(openId || '').trim().slice(0, 191);
  if (!normalized) return 0;
  const [result] = await db.execute(
    'UPDATE morada_admin_sessions SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE open_id=? AND revoked_at IS NULL',
    [normalized]
  );
  return result.affectedRows;
}

export async function upsertAdmin({ openId, email, name }) {
  const db = getPool();
  const normalizedOpenId = String(openId).slice(0, 191);
  const normalizedEmail = String(email).trim().toLowerCase().slice(0, 255);
  const normalizedName = String(name).slice(0, 255);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `UPDATE morada_admin_sessions
       SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP)
       WHERE revoked_at IS NULL
         AND (
           (email=? AND open_id<>?)
           OR (open_id=? AND email<>?)
         )`,
      [normalizedEmail, normalizedOpenId, normalizedOpenId, normalizedEmail]
    );

    await connection.execute(
      'DELETE FROM morada_admin_users WHERE email=? AND open_id<>?',
      [normalizedEmail, normalizedOpenId]
    );
    await connection.execute(
      'INSERT INTO morada_admin_users (open_id,email,name) VALUES (?,?,?) ON DUPLICATE KEY UPDATE email=VALUES(email),name=VALUES(name),last_login_at=CURRENT_TIMESTAMP',
      [normalizedOpenId, normalizedEmail, normalizedName]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function findAdmin(openId) {
  const db = getPool();
  const [rows] = await db.execute('SELECT open_id,email,name FROM morada_admin_users WHERE open_id=? LIMIT 1', [openId]);
  return rows[0] || null;
}

export async function findStaffAccess(email) {
  const db = getPool();
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const [rows] = await db.execute(
    'SELECT email,open_id,name,role,active,invited_by,created_at,updated_at FROM morada_staff_access WHERE email=? LIMIT 1',
    [normalized]
  );
  return rows[0] || null;
}

export async function findStaffAccessByOpenId(openId) {
  const db = getPool();
  const normalized = String(openId || '').trim();
  if (!normalized) return null;
  const [rows] = await db.execute(
    'SELECT email,open_id,name,role,active,invited_by,created_at,updated_at FROM morada_staff_access WHERE open_id=? LIMIT 1',
    [normalized]
  );
  return rows[0] || null;
}

export async function listStaffAccess() {
  const db = getPool();
  const [rows] = await db.query(
    "SELECT email,open_id,name,role,active,invited_by,created_at,updated_at FROM morada_staff_access ORDER BY CASE role WHEN 'manager' THEN 0 ELSE 1 END, name ASC, email ASC"
  );
  return rows;
}

export async function saveStaffAccess({ email, openId = null, name, role = 'editor', active = true, invitedBy = null }) {
  const db = getPool();
  const normalizedEmail = String(email || '').trim().toLowerCase().slice(0, 255);
  const normalizedOpenId = openId ? String(openId).trim().slice(0, 191) : null;
  const normalizedName = String(name || normalizedEmail).trim().slice(0, 255);
  const normalizedRole = role === 'manager' ? 'manager' : 'editor';
  try {
    await db.execute(
      `INSERT INTO morada_staff_access (email,open_id,name,role,active,invited_by)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         open_id=COALESCE(VALUES(open_id),open_id),
         name=VALUES(name),
         role=VALUES(role),
         active=VALUES(active),
         invited_by=COALESCE(VALUES(invited_by),invited_by),
         updated_at=CURRENT_TIMESTAMP`,
      [
        normalizedEmail,
        normalizedOpenId,
        normalizedName,
        normalizedRole,
        active ? 1 : 0,
        invitedBy ? String(invitedBy).slice(0, 255) : null
      ]
    );
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') throw new Error('TEAM_MEMBER_EXISTS');
    throw error;
  }
  return normalizedOpenId
    ? (await findStaffAccessByOpenId(normalizedOpenId)) || findStaffAccess(normalizedEmail)
    : findStaffAccess(normalizedEmail);
}

export async function removeStaffAccess(email) {
  const db = getPool();
  const normalized = String(email || '').trim().toLowerCase();
  const [result] = await db.execute('DELETE FROM morada_staff_access WHERE email=?', [normalized]);
  return result.affectedRows > 0;
}

export async function getSiteSettings() {
  const db = getPool();
  const [rows] = await db.query('SELECT * FROM morada_site_settings WHERE id = 1 LIMIT 1');
  return rows[0] || null;
}

export async function saveSiteSettings(input = {}) {
  const db = getPool();
  const data = normalizeSiteSettings(input);
  const values = [data.phoneDisplay, data.whatsapp, data.email, data.address, data.crci, data.area, data.instagramUrl, data.instagramDisplay];
  await db.execute(
    'INSERT INTO morada_site_settings (id, phone_display, whatsapp, email, address, crci, area, instagram_url, instagram_display) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE phone_display=VALUES(phone_display), whatsapp=VALUES(whatsapp), email=VALUES(email), address=VALUES(address), crci=VALUES(crci), area=VALUES(area), instagram_url=VALUES(instagram_url), instagram_display=VALUES(instagram_display)',
    values
  );
  return getSiteSettings();
}

export async function listTestimonials() {
  const db = getPool();
  const [rows] = await db.query('SELECT id, author, quote, location, year, sort_order FROM morada_testimonials ORDER BY sort_order ASC, created_at DESC');
  return rows;
}

export async function addTestimonial(input = {}) {
  const db = getPool();
  const { randomUUID } = await import('node:crypto');
  const data = normalizeTestimonial(input);
  const id = randomUUID();
  await db.execute(
    'INSERT INTO morada_testimonials (id, author, quote, location, year, sort_order) VALUES (?,?,?,?,?,?)',
    [id, data.author, data.quote, data.location, data.year, data.sortOrder]
  );
  return { id, testimonials: await listTestimonials() };
}

export async function removeTestimonial(id) {
  const db = getPool();
  const [result] = await db.execute('DELETE FROM morada_testimonials WHERE id=?', [id]);
  return result.affectedRows > 0;
}

export async function createContactLead(input = {}) {
  const db = getPool();
  const { randomUUID } = await import('node:crypto');
  const data = normalizeContactLead(input);
  const id = randomUUID();
  await db.execute(
    'INSERT INTO morada_contact_leads (id, name, email, interest, message, property_path, status) VALUES (?,?,?,?,?,?,?)',
    [id, data.name, data.email, data.interest, data.message, data.propertyPath, 'new']
  );
  return { id, ...data, status: 'new' };
}

export async function listContactLeads({ limit = 100 } = {}) {
  const db = getPool();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 250));
  const [rows] = await db.execute(
    'SELECT id, name, email, interest, message, property_path, status, created_at, updated_at FROM morada_contact_leads ORDER BY created_at DESC LIMIT ?',
    [safeLimit]
  );
  return rows;
}

export async function deleteContactLead(id) {
  const db = getPool();
  const [result] = await db.execute('DELETE FROM morada_contact_leads WHERE id=?', [String(id || '').slice(0, 36)]);
  return result.affectedRows > 0;
}

export async function updateContactLeadStatus(id, status) {
  const db = getPool();
  const allowed = new Set(['new', 'contacted', 'closed']);
  if (!allowed.has(status)) throw new Error('INVALID_LEAD_STATUS');
  const [result] = await db.execute('UPDATE morada_contact_leads SET status=? WHERE id=?', [status, id]);
  return result.affectedRows > 0;
}


export async function recordAudit({ actorEmail, actorOpenId = null, action, entityType, entityId = null, details = null }) {
  const db = getPool();
  const { randomUUID } = await import('node:crypto');
  let safeDetails = null;
  if (details && typeof details === 'object') {
    const serialized = JSON.stringify(details);
    safeDetails = serialized.length <= 8000
      ? serialized
      : JSON.stringify({ truncated: true, originalLength: serialized.length });
  }
  await db.execute(
    'INSERT INTO morada_audit_log (id,actor_email,actor_open_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?,?,?)',
    [
      randomUUID(),
      String(actorEmail || 'unknown').slice(0, 255),
      actorOpenId ? String(actorOpenId).slice(0, 191) : null,
      String(action || 'unknown').slice(0, 80),
      String(entityType || 'unknown').slice(0, 60),
      entityId ? String(entityId).slice(0, 191) : null,
      safeDetails
    ]
  );
}

export async function listAuditLog({ limit = 100 } = {}) {
  const db = getPool();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 250));
  const [rows] = await db.execute(
    `SELECT id,actor_email,actor_open_id,action,entity_type,entity_id,details,created_at
     FROM morada_audit_log
     ORDER BY created_at DESC
     LIMIT ?`,
    [safeLimit]
  );
  return rows;
}
