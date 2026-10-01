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
    cover_url: String(row.cover_url || ''),
    updated_at: row.updated_at || null,
    photos: Array.isArray(row.photos) ? row.photos.map((photo) => ({
      url: String(photo.url || ''),
      alt_text: String(photo.alt_text || ''),
      sort_order: Number(photo.sort_order || 0),
      is_cover: Boolean(photo.is_cover)
    })) : []
  };
}

export function publicProperties(rows = []) {
  return rows.map(publicProperty);
}
