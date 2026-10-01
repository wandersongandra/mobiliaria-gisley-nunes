import mysql from 'mysql2/promise';
import { adminEmails, hasDatabase, isProduction } from './config.js';
import { demoProperties, seedRows } from './seed.js';
import { normalizeContactLead, normalizePropertyInput, normalizeSiteSettings, normalizeTestimonial } from './validation.js';

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
      keepAliveInitialDelay: 0
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS morada_staff_access (
    email VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'editor',
    active TINYINT(1) NOT NULL DEFAULT 1,
    invited_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_morada_staff_role_active (role, active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const bootstrapManagers = adminEmails();
  if (bootstrapManagers.length) {
    const placeholders = bootstrapManagers.map(() => '?').join(',');
    await db.execute(
      `UPDATE morada_staff_access
       SET active=0, updated_at=CURRENT_TIMESTAMP
       WHERE invited_by='environment' AND email NOT IN (${placeholders})`,
      bootstrapManagers
    );
  } else {
    await db.execute(
      "UPDATE morada_staff_access SET active=0, updated_at=CURRENT_TIMESTAMP WHERE invited_by='environment'"
    );
  }

  for (const email of bootstrapManagers) {
    await db.execute(
      `INSERT INTO morada_staff_access (email,name,role,active,invited_by)
       VALUES (?,?, 'manager', 1, 'environment')
       ON DUPLICATE KEY UPDATE role='manager', active=1, invited_by='environment', updated_at=CURRENT_TIMESTAMP`,
      [email, email]
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
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id VARCHAR(191),
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_morada_audit_created (created_at),
    INDEX idx_morada_audit_actor_created (actor_email, created_at),
    INDEX idx_morada_audit_entity_created (entity_type, entity_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

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
  if (!hasDatabase()) return isProduction ? null : (seedRows().find((row) => row.slug === slug && row.status === 'published') || null);
  const db = getPool();
  const [rows] = await db.execute(propertyQuery("WHERE p.slug = ? AND p.status = 'published' LIMIT 1"), [String(slug || '').slice(0, 180)]);
  if (!rows[0]) return null;
  await hydratePhotos(rows);
  return rows[0];
}

export async function listPhotos(propertyId) {
  const db = getPool();
  const [rows] = await db.execute('SELECT id, property_id, storage_path, url, alt_text, sort_order, is_cover, storage_provider, mime_type, file_size, width, height, uploaded_by, created_at FROM morada_property_photos WHERE property_id = ? ORDER BY sort_order ASC, created_at ASC', [propertyId]);
  return rows;
}

export async function saveProperty(input, id = null) {
  const db = getPool();
  const { randomUUID } = await import('node:crypto');
  const data = normalizePropertyInput(input);
  const propertyId = id || randomUUID();
  let existingSlug = '';
  if (id) {
    const [[existing]] = await db.execute('SELECT slug FROM morada_properties WHERE id=? LIMIT 1', [id]);
    if (!existing) return null;
    existingSlug = String(existing.slug || '');
  }
  const generatedSlug = data.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const slug = String(data.slug || existingSlug || generatedSlug).slice(0, 170) || propertyId;
  const values = [
    propertyId, data.title, slug, data.location, data.city, data.purpose, data.type, data.price, data.priceLabel,
    data.bedrooms, data.bathrooms, data.areaM2, data.suites, data.parkingSpots, data.condoFee, data.iptu,
    data.description, data.status, data.featured ? 1 : 0
  ];

  try {
    if (id) {
      await db.execute(
        'UPDATE morada_properties SET title=?,slug=?,location=?,city=?,purpose=?,type=?,price=?,price_label=?,bedrooms=?,bathrooms=?,area_m2=?,suites=?,parking_spots=?,condo_fee=?,iptu=?,description=?,status=?,is_featured=? WHERE id=?',
        [...values.slice(1), propertyId]
      );
    } else {
      await db.execute(
        'INSERT INTO morada_properties (id,title,slug,location,city,purpose,type,price,price_label,bedrooms,bathrooms,area_m2,suites,parking_spots,condo_fee,iptu,description,status,is_featured) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        values
      );
    }
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') throw new Error('SLUG_CONFLICT');
    throw error;
  }

  return getProperty(propertyId);
}

export async function softDeleteProperty(id) {
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
  uploadedBy = ''
}) {
  const db = getPool();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM morada_properties WHERE id=? FOR UPDATE', [propertyId]);
    const [[{ photo_count: photoCount }]] = await connection.execute(
      'SELECT COUNT(*) AS photo_count FROM morada_property_photos WHERE property_id=?',
      [propertyId]
    );
    if (Number(photoCount) >= 40) throw new Error('PHOTO_LIMIT_REACHED');
    if (isCover) await connection.execute('UPDATE morada_property_photos SET is_cover=0 WHERE property_id=?', [propertyId]);
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
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return listPhotos(propertyId);
}

export async function removePhoto(photoId) {
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

export async function setPhotoCover(photoId) {
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

export async function reorderPhotos(propertyId, photoIds) {
  const db = getPool();
  const uniqueIds = [...new Set(photoIds.map((id) => String(id || '')).filter(Boolean))].slice(0, 100);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
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

export async function upsertAdmin({ openId, email, name }) {
  const db = getPool();
  await db.execute(
    'INSERT INTO morada_admin_users (open_id,email,name) VALUES (?,?,?) ON DUPLICATE KEY UPDATE email=VALUES(email),name=VALUES(name),last_login_at=CURRENT_TIMESTAMP',
    [String(openId).slice(0, 191), String(email).slice(0, 255), String(name).slice(0, 255)]
  );
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
    'SELECT email,name,role,active,invited_by,created_at,updated_at FROM morada_staff_access WHERE email=? LIMIT 1',
    [normalized]
  );
  return rows[0] || null;
}

export async function listStaffAccess() {
  const db = getPool();
  const [rows] = await db.query(
    "SELECT email,name,role,active,invited_by,created_at,updated_at FROM morada_staff_access ORDER BY CASE role WHEN 'manager' THEN 0 ELSE 1 END, name ASC, email ASC"
  );
  return rows;
}

export async function saveStaffAccess({ email, name, role = 'editor', active = true, invitedBy = null }) {
  const db = getPool();
  const normalizedEmail = String(email || '').trim().toLowerCase().slice(0, 255);
  const normalizedName = String(name || normalizedEmail).trim().slice(0, 255);
  const normalizedRole = role === 'manager' ? 'manager' : 'editor';
  await db.execute(
    `INSERT INTO morada_staff_access (email,name,role,active,invited_by)
     VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE name=VALUES(name),role=VALUES(role),active=VALUES(active),invited_by=COALESCE(VALUES(invited_by),invited_by),updated_at=CURRENT_TIMESTAMP`,
    [normalizedEmail, normalizedName, normalizedRole, active ? 1 : 0, invitedBy ? String(invitedBy).slice(0, 255) : null]
  );
  return findStaffAccess(normalizedEmail);
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
  const [rows] = await db.query(`SELECT id, name, email, interest, message, property_path, status, created_at, updated_at FROM morada_contact_leads ORDER BY created_at DESC LIMIT ${safeLimit}`);
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


export async function recordAudit({ actorEmail, action, entityType, entityId = null, details = null }) {
  const db = getPool();
  const { randomUUID } = await import('node:crypto');
  const safeDetails = details && typeof details === 'object' ? JSON.stringify(details).slice(0, 8000) : null;
  await db.execute(
    'INSERT INTO morada_audit_log (id,actor_email,action,entity_type,entity_id,details) VALUES (?,?,?,?,?,?)',
    [
      randomUUID(),
      String(actorEmail || 'unknown').slice(0, 255),
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
  const [rows] = await db.query(
    `SELECT id,actor_email,action,entity_type,entity_id,details,created_at
     FROM morada_audit_log
     ORDER BY created_at DESC
     LIMIT ${safeLimit}`
  );
  return rows;
}
