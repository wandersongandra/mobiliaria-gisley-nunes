export function escapeLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function organizationLd(site, origin) {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: site.name,
    url: `${origin}/`,
    email: site.email,
    telephone: site.phoneDisplay,
    areaServed: site.area,
    address: { '@type': 'PostalAddress', addressLocality: 'Belo Horizonte', addressRegion: 'MG', addressCountry: 'BR' }
  };
}

export function propertyLd(property, origin) {
  const price = Number(property.price || 0);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: property.title,
    url: `${origin}/imoveis/${property.slug}`,
    address: { '@type': 'PostalAddress', addressLocality: property.city || 'Belo Horizonte', addressRegion: 'MG', addressCountry: 'BR' }
  };
  if (price > 0) {
    ld.offers = {
      '@type': 'Offer',
      price,
      priceCurrency: 'BRL',
      ...(property.purpose === 'Alugar'
        ? { priceSpecification: { '@type': 'UnitPriceSpecification', price, priceCurrency: 'BRL', unitText: 'MONTH' } }
        : {})
    };
  }
  if (property.description) ld.description = property.description;
  if (property.cover_url) ld.image = property.cover_url;
  if (Number(property.bedrooms || 0)) ld.numberOfBedrooms = Number(property.bedrooms);
  if (Number(property.bathrooms || 0)) ld.numberOfBathroomsTotal = Number(property.bathrooms);
  if (Number(property.area_m2 || 0)) ld.floorSize = { '@type': 'QuantitativeValue', value: Number(property.area_m2), unitCode: 'MTK' };
  return ld;
}

export function sitemapDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
