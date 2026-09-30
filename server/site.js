import { hasDatabase } from './config.js';
import { getSiteSettings, listTestimonials } from './db.js';

// Fallback usado quando não há banco configurado. Os campos são os que o
// painel administrativo consegue editar (a marca "name" permanece fixa).
export const defaultSiteInfo = {
  name: 'Gisley Nunes Imóveis',
  crci: '0052305',
  area: 'Belo Horizonte e região',
  address: 'Belo Horizonte, MG',
  phoneDisplay: '(31) 9155-4677',
  whatsapp: '553191554677',
  email: 'Gisleynunesimoveis@gmail.com',
  instagramDisplay: '@gisleynunesimoveis',
  instagramUrl: 'https://instagram.com/gisleynunesimoveis'
};

export const defaultTestimonials = [];

const mapping = { phone_display: 'phoneDisplay', whatsapp: 'whatsapp', email: 'email', address: 'address', crci: 'crci', area: 'area', instagram_url: 'instagramUrl', instagram_display: 'instagramDisplay' };

function mapSettings(row) {
  if (!row) return {};
  const result = {};
  for (const [dbKey, key] of Object.entries(mapping)) {
    if (row[dbKey]) result[key] = row[dbKey];
  }
  return result;
}

export async function getSiteInfo() {
  if (!hasDatabase()) return defaultSiteInfo;
  try {
    return { ...defaultSiteInfo, ...mapSettings(await getSiteSettings()) };
  } catch {
    return defaultSiteInfo;
  }
}

export async function getTestimonials() {
  if (!hasDatabase()) return defaultTestimonials;
  try {
    const rows = await listTestimonials();
    if (!rows.length) return [];
    return rows.map((row) => ({ id: row.id, author: row.author, quote: row.quote, location: row.location, year: row.year }));
  } catch {
    return [];
  }
}