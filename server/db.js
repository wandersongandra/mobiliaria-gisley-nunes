import mysql from 'mysql2/promise';
import { hasDatabase } from './config.js';
import { demoProperties, seedRows } from './seed.js';

let pool;

export function getPool() {
  if (!hasDatabase()) throw new Error('DATABASE_NOT_CONFIGURED');
  if (!pool) {
    pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 5, waitForConnections: true, connectTimeout: 10000 });
  }
  return pool;
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  try { await db.query('ALTER TABLE morada_properties ADD COLUMN suites INT NOT NULL DEFAULT 0'); } catch {}
  try { await db.query('ALTER TABLE morada_properties ADD COLUMN parking_spots INT NOT NULL DEFAULT 0'); } catch {}
  try { await db.query('ALTER TABLE morada_properties ADD COLUMN condo_fee DECIMAL(10,2) NOT NULL DEFAULT 0'); } catch {}
  try { await db.query('ALTER TABLE morada_properties ADD COLUMN iptu DECIMAL(12,2) NOT NULL DEFAULT 0'); } catch {}
  await db.query(`CREATE TABLE IF NOT EXISTS morada_property_photos (
    id CHAR(36) PRIMARY KEY,
    property_id CHAR(36) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    url VARCHAR(600) NOT NULL,
    alt_text VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_cover TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_morada_property_photo FOREIGN KEY (property_id) REFERENCES morada_properties(id) ON DELETE CASCADE,
    INDEX idx_morada_property_photos (property_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
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
  const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM morada_properties');
  if (Number(count) === 0) {
    const { randomUUID } = await import('node:crypto');
    for (const item of demoProperties) {
      const id = randomUUID();
      await db.execute('INSERT INTO morada_properties (id,title,slug,location,city,purpose,type,price,price_label,bedrooms,bathrooms,area_m2,description,status,is_featured) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id, item.title, item.slug, item.location, item.city, item.purpose, item.type, item.price, item.priceLabel, item.bedrooms, item.bathrooms, item.areaM2, item.description, item.status, item.featured]);
      await db.execute('INSERT INTO morada_property_photos (id,property_id,storage_path,url,alt_text,sort_order,is_cover) VALUES (?,?,?,?,?,?,?)', [randomUUID(), id, `demo/${item.slug}`, item.coverUrl, item.title, 0, 1]);
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
  return { configured: true };
}

function propertyQuery(extra = '') {
  return `SELECT p.*, CASE WHEN p.price < 1500000 THEN 1 WHEN p.price <= 3000000 THEN 2 ELSE 3 END AS price_band, COALESCE(ph.url, '') AS cover_url FROM morada_properties p LEFT JOIN morada_property_photos ph ON ph.property_id = p.id AND ph.is_cover = 1 ${extra}`;
}

export async function listProperties({ publicOnly = false } = {}) {
  if (!hasDatabase()) return publicOnly ? seedRows().filter((item) => item.status === 'published') : seedRows();
  const db = getPool();
  const [rows] = await db.query(propertyQuery(publicOnly ? "WHERE p.status = 'published' ORDER BY p.is_featured DESC, p.updated_at DESC" : 'ORDER BY p.updated_at DESC'));
  for (const row of rows) row.photos = await listPhotos(row.id);
  return rows;
}

export async function getProperty(id) {
  if (!hasDatabase()) return seedRows().find((row) => row.id === id) || null;
  const db = getPool();
  const [rows] = await db.execute(propertyQuery('WHERE p.id = ? LIMIT 1'), [id]);
  if (!rows[0]) return null;
  rows[0].photos = await listPhotos(id);
  return rows[0];
}

export async function getPropertyBySlug(slug) {
  if (!hasDatabase()) return seedRows().find((row) => row.slug === slug) || null;
  const db = getPool();
  const [rows] = await db.execute(propertyQuery('WHERE p.slug = ? LIMIT 1'), [slug]);
  if (!rows[0]) return null;
  rows[0].photos = await listPhotos(rows[0].id);
  return rows[0];
}

export async function listPhotos(propertyId) {
  const db = getPool();
  const [rows] = await db.execute('SELECT id, property_id, storage_path, url, alt_text, sort_order, is_cover, created_at FROM morada_property_photos WHERE property_id = ? ORDER BY sort_order ASC, created_at ASC', [propertyId]);
  return rows;
}

export async function saveProperty(input, id = null) {
  const db = getPool();
  const { randomUUID } = await import('node:crypto');
  const propertyId = id || randomUUID();
  const title = String(input.title || '').trim();
  if (!title) throw new Error('TITLE_REQUIRED');
  const slug = String(input.slug || title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')).slice(0, 170) || propertyId;
  const values = [propertyId, title, slug, String(input.location || '').trim(), String(input.city || 'Belo Horizonte').trim(), String(input.purpose || 'Comprar'), String(input.type || 'Apartamento'), Number(input.price || 0), String(input.priceLabel || '').trim(), Number(input.bedrooms || 0), Number(input.bathrooms || 0), Number(input.areaM2 || 0), Number(input.suites || 0), Number(input.parkingSpots || 0), Number(input.condoFee || 0), Number(input.iptu || 0), String(input.description || '').trim(), input.status === 'published' ? 'published' : 'draft', input.featured ? 1 : 0];
  if (id) {
    await db.execute('UPDATE morada_properties SET title=?,slug=?,location=?,city=?,purpose=?,type=?,price=?,price_label=?,bedrooms=?,bathrooms=?,area_m2=?,suites=?,parking_spots=?,condo_fee=?,iptu=?,description=?,status=?,is_featured=? WHERE id=?', [...values.slice(1), propertyId]);
  } else {
    await db.execute('INSERT INTO morada_properties (id,title,slug,location,city,purpose,type,price,price_label,bedrooms,bathrooms,area_m2,suites,parking_spots,condo_fee,iptu,description,status,is_featured) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', values);
  }
  return getProperty(propertyId);
}

export async function softDeleteProperty(id) {
  const db = getPool();
  await db.execute("UPDATE morada_properties SET status='archived' WHERE id=?", [id]);
}

export async function addPhoto({ id, propertyId, storagePath, url, altText, sortOrder, isCover }) {
  const db = getPool();
  if (isCover) await db.execute('UPDATE morada_property_photos SET is_cover=0 WHERE property_id=?', [propertyId]);
  await db.execute('INSERT INTO morada_property_photos (id,property_id,storage_path,url,alt_text,sort_order,is_cover) VALUES (?,?,?,?,?,?,?)', [id, propertyId, storagePath, url, altText, sortOrder, isCover ? 1 : 0]);
  return listPhotos(propertyId);
}

export async function removePhoto(photoId) {
  const db = getPool();
  const [[photo]] = await db.execute('SELECT property_id, is_cover FROM morada_property_photos WHERE id=? LIMIT 1', [photoId]);
  if (!photo) return;
  await db.execute('DELETE FROM morada_property_photos WHERE id=?', [photoId]);
  if (photo.is_cover) {
    const [[nextPhoto]] = await db.execute('SELECT id FROM morada_property_photos WHERE property_id=? ORDER BY sort_order ASC, created_at ASC LIMIT 1', [photo.property_id]);
    if (nextPhoto) await db.execute('UPDATE morada_property_photos SET is_cover=1 WHERE id=?', [nextPhoto.id]);
  }
}

export async function setPhotoCover(photoId) {
  const db = getPool();
  const [[photo]] = await db.execute('SELECT property_id FROM morada_property_photos WHERE id=? LIMIT 1', [photoId]);
  if (!photo) return null;
  await db.execute('UPDATE morada_property_photos SET is_cover=0 WHERE property_id=?', [photo.property_id]);
  await db.execute('UPDATE morada_property_photos SET is_cover=1 WHERE id=?', [photoId]);
  return listPhotos(photo.property_id);
}

export async function reorderPhotos(propertyId, photoIds) {
  const db = getPool();
  for (let index = 0; index < photoIds.length; index += 1) {
    await db.execute('UPDATE morada_property_photos SET sort_order=? WHERE id=? AND property_id=?', [index, photoIds[index], propertyId]);
  }
  return listPhotos(propertyId);
}

export async function upsertAdmin({ openId, email, name }) {
  const db = getPool();
  await db.execute('INSERT INTO morada_admin_users (open_id,email,name) VALUES (?,?,?) ON DUPLICATE KEY UPDATE email=VALUES(email),name=VALUES(name),last_login_at=CURRENT_TIMESTAMP', [openId, email, name]);
}

export async function findAdmin(openId) {
  const db = getPool();
  const [rows] = await db.execute('SELECT open_id,email,name FROM morada_admin_users WHERE open_id=? LIMIT 1', [openId]);
  return rows[0] || null;
}

export async function getSiteSettings() {
  const db = getPool();
  const [rows] = await db.query('SELECT * FROM morada_site_settings WHERE id = 1 LIMIT 1');
  return rows[0] || null;
}

export async function saveSiteSettings(input = {}) {
  const db = getPool();
  const values = [
    String(input.phoneDisplay ?? '').trim(),
    String(input.whatsapp ?? '').trim(),
    String(input.email ?? '').trim(),
    String(input.address ?? '').trim(),
    String(input.crci ?? '').trim(),
    String(input.area ?? '').trim(),
    String(input.instagramUrl ?? '').trim(),
    String(input.instagramDisplay ?? '').trim()
  ];
  await db.execute('INSERT INTO morada_site_settings (id, phone_display, whatsapp, email, address, crci, area, instagram_url, instagram_display) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE phone_display=VALUES(phone_display), whatsapp=VALUES(whatsapp), email=VALUES(email), address=VALUES(address), crci=VALUES(crci), area=VALUES(area), instagram_url=VALUES(instagram_url), instagram_display=VALUES(instagram_display)', values);
  return getSiteSettings();
}

export async function listTestimonials() {
  const db = getPool();
  const [rows] = await db.query('SELECT id, author, quote, location, year, sort_order FROM morada_testimonials ORDER BY sort_order ASC, created_at DESC');
  return rows;
}

export async function addTestimonial({ author, quote, location = '', year = '', sortOrder = 0 }) {
  const db = getPool();
  const { randomUUID } = await import('node:crypto');
  await db.execute('INSERT INTO morada_testimonials (id, author, quote, location, year, sort_order) VALUES (?,?,?,?,?,?)', [randomUUID(), String(author || '').trim(), String(quote || '').trim(), String(location || '').trim(), String(year || '').trim(), Number(sortOrder || 0)]);
  return listTestimonials();
}

export async function removeTestimonial(id) {
  const db = getPool();
  await db.execute('DELETE FROM morada_testimonials WHERE id=?', [id]);
}