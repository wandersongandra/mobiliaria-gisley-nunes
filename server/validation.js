const PURPOSES = new Set(['Comprar', 'Alugar']);
const PROPERTY_TYPES = new Set(['Casa', 'Apartamento', 'Cobertura', 'Terreno', 'Comercial', 'Lote']);
const LEAD_INTERESTS = new Set([
  'Quero comprar um imóvel',
  'Quero alugar um imóvel',
  'Quero anunciar meu imóvel',
  'Tenho outra dúvida'
]);

function text(value, max) {
  return String(value ?? '').trim().replace(/\u0000/g, '').slice(0, max);
}

function nonNegativeNumber(value, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(number, max);
}

function integer(value, max) {
  return Math.round(nonNegativeNumber(value, max));
}

export function normalizePropertyInput(input = {}) {
  const title = text(input.title, 160);
  if (!title) throw new Error('TITLE_REQUIRED');

  const purpose = PURPOSES.has(input.purpose) ? input.purpose : 'Comprar';
  const type = PROPERTY_TYPES.has(input.type) ? input.type : 'Apartamento';
  const location = text(input.location, 180);
  const city = text(input.city || 'Belo Horizonte', 120);
  if (!location) throw new Error('LOCATION_REQUIRED');
  const price = nonNegativeNumber(input.price, 999999999999.99);
  const priceLabel = text(input.priceLabel, 100) || (price > 0 ? `R$ ${price.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : 'Sob consulta');

  return {
    title,
    slug: text(input.slug, 180),
    location,
    city,
    purpose,
    type,
    price,
    priceLabel,
    bedrooms: integer(input.bedrooms, 50),
    bathrooms: integer(input.bathrooms, 50),
    areaM2: nonNegativeNumber(input.areaM2, 9999999.99),
    suites: integer(input.suites, 50),
    parkingSpots: integer(input.parkingSpots, 50),
    condoFee: nonNegativeNumber(input.condoFee, 99999999.99),
    iptu: nonNegativeNumber(input.iptu, 9999999999.99),
    description: text(input.description, 6000),
    status: input.status === 'published' ? 'published' : 'draft',
    featured: Boolean(input.featured)
  };
}

export function normalizeSiteSettings(input = {}) {
  const email = text(input.email, 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('INVALID_EMAIL');

  const instagramUrl = text(input.instagramUrl, 200);
  if (instagramUrl) {
    let parsed;
    try { parsed = new URL(instagramUrl); } catch { throw new Error('INVALID_INSTAGRAM_URL'); }
    if (parsed.protocol !== 'https:' || !/(^|\.)instagram\.com$/i.test(parsed.hostname)) throw new Error('INVALID_INSTAGRAM_URL');
  }

  return {
    phoneDisplay: text(input.phoneDisplay, 50),
    whatsapp: text(input.whatsapp, 30).replace(/\D/g, '').slice(0, 20),
    email,
    address: text(input.address, 180),
    crci: text(input.crci, 30),
    area: text(input.area, 120),
    instagramUrl,
    instagramDisplay: text(input.instagramDisplay, 60)
  };
}

export function normalizeTestimonial(input = {}) {
  const author = text(input.author, 120);
  const quote = text(input.quote, 1200);
  if (!author || !quote) throw new Error('INVALID_TESTIMONIAL');
  return {
    author,
    quote,
    location: text(input.location, 120),
    year: text(input.year, 10),
    sortOrder: integer(input.sortOrder, 10000)
  };
}

export function normalizeContactLead(input = {}) {
  const name = text(input.name, 120);
  const email = text(input.email, 255).toLowerCase();
  const message = text(input.message, 3000);
  const interest = LEAD_INTERESTS.has(input.interest) ? input.interest : 'Tenho outra dúvida';
  const propertyPath = text(input.propertyPath, 240);

  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('INVALID_CONTACT');

  return { name, email, interest, message, propertyPath };
}
