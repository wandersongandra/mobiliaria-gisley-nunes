function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function neighborhoodFromLocation(location) {
  const value = normalizeName(location);
  return value.split('·')[0].trim() || value;
}

export function slugifyCatalogName(value) {
  return normalizeName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function catalogNeighborhoods(properties = []) {
  const groups = new Map();
  for (const property of properties) {
    const name = neighborhoodFromLocation(property.location || property.city);
    const slug = slugifyCatalogName(name);
    if (!name || !slug) continue;
    if (!groups.has(slug)) groups.set(slug, { name, slug, properties: [] });
    groups.get(slug).properties.push(property);
  }

  return [...groups.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((group) => ({ ...group, count: group.properties.length }));
}

export function catalogNeighborhood(properties, slug) {
  return catalogNeighborhoods(properties).find((group) => group.slug === slug) || null;
}

export function filterCatalogProperties(properties = [], filters = {}) {
  return properties.filter((property) => {
    if (filters.purpose && property.purpose !== filters.purpose) return false;
    if (filters.location && property.location !== filters.location) return false;
    if (filters.type && property.type !== filters.type) return false;
    if (filters.priceBand && Number(property.price_band) !== filters.priceBand) return false;
    if (filters.bedrooms === '4+' && Number(property.bedrooms) < 4) return false;
    if (filters.bedrooms && filters.bedrooms !== '4+' && Number(property.bedrooms) !== Number(filters.bedrooms)) return false;
    return true;
  });
}

export function catalogFacets(properties = []) {
  return {
    locations: [...new Set(properties.map((property) => property.location).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    types: [...new Set(properties.map((property) => property.type).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  };
}

export function paginateCatalog(properties = [], { page = 1, perPage = 20 } = {}) {
  const total = properties.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, lastPage);
  const start = (currentPage - 1) * perPage;
  const items = properties.slice(start, start + perPage);

  return {
    items,
    pagination: {
      current_page: currentPage,
      per_page: perPage,
      last_page: lastPage,
      total,
      from: items.length ? start + 1 : null,
      to: items.length ? start + items.length : null
    }
  };
}
