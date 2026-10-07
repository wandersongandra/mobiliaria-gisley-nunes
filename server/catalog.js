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
