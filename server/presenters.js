function safeMediaUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/media/') || raw.startsWith('/manus-storage/')) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function publicProperty(row = {}) {
  return {
    slug: String(row.slug || ''),
    title: String(row.title || ''),
    location: String(row.location || ''),
    city: String(row.city || ''),
    purpose: String(row.purpose || ''),
    type: String(row.type || ''),
    price: Number(row.price || 0),
    price_label: String(row.price_label || ''),
    bedrooms: Number(row.bedrooms || 0),
    bathrooms: Number(row.bathrooms || 0),
    area_m2: Number(row.area_m2 || 0),
    suites: Number(row.suites || 0),
    parking_spots: Number(row.parking_spots || 0),
    condo_fee: Number(row.condo_fee || 0),
    iptu: Number(row.iptu || 0),
    description: String(row.description || ''),
    is_featured: Boolean(row.is_featured),
    cover_url: safeMediaUrl(row.cover_url),
    updated_at: row.updated_at || null,
    photos: Array.isArray(row.photos) ? row.photos.map((photo) => ({
      url: safeMediaUrl(photo.url),
      alt_text: String(photo.alt_text || ''),
      sort_order: Number(photo.sort_order || 0),
      is_cover: Boolean(photo.is_cover)
    })) : []
  };
}

export function publicProperties(rows = []) {
  return rows.map(publicProperty);
}


export function adminProperty(row = {}) {
  return {
    id: String(row.id || ''),
    slug: String(row.slug || ''),
    title: String(row.title || ''),
    location: String(row.location || ''),
    city: String(row.city || ''),
    purpose: String(row.purpose || ''),
    type: String(row.type || ''),
    price: Number(row.price || 0),
    price_label: String(row.price_label || ''),
    bedrooms: Number(row.bedrooms || 0),
    bathrooms: Number(row.bathrooms || 0),
    area_m2: Number(row.area_m2 || 0),
    suites: Number(row.suites || 0),
    parking_spots: Number(row.parking_spots || 0),
    condo_fee: Number(row.condo_fee || 0),
    iptu: Number(row.iptu || 0),
    description: String(row.description || ''),
    status: String(row.status || 'draft'),
    is_featured: Boolean(row.is_featured),
    cover_url: String(row.cover_url || ''),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    photos: Array.isArray(row.photos) ? row.photos.map((photo) => ({
      id: String(photo.id || ''),
      url: safeMediaUrl(photo.url),
      alt_text: String(photo.alt_text || ''),
      sort_order: Number(photo.sort_order || 0),
      is_cover: Boolean(photo.is_cover),
      created_at: photo.created_at || null
    })) : []
  };
}

export function adminProperties(rows = []) {
  return rows.map(adminProperty);
}
