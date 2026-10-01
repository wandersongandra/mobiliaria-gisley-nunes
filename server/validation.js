const PURPOSES = new Set(['Comprar', 'Alugar']);
const PROPERTY_TYPES = new Set(['Casa', 'Apartamento', 'Cobertura', 'Terreno', 'Comercial', 'Lote']);
const PROPERTY_STATUSES = new Set(['draft', 'published']);
const LEAD_INTERESTS = new Set([
  'Quero comprar um imóvel',
  'Quero alugar um imóvel',
  'Quero anunciar meu imóvel',
  'Tenho outra dúvida'
]);
const LEAD_STATUSES = new Set(['new', 'contacted', 'closed']);
const TEAM_ROLES = new Set(['editor', 'manager']);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

function ensureObject(value, error = 'INVALID_INPUT') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(error);
  return value;
}

function ensureKeys(value, allowed, error = 'INVALID_INPUT') {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(error);
  }
  return value;
}

function contract(value, allowedKeys, error) {
  return ensureKeys(ensureObject(value, error), new Set(allowedKeys), error);
}

function text(
  value,
  max,
  { required = false, defaultValue = '', error = 'INVALID_INPUT', multiline = false } = {}
) {
  if (value === undefined || value === null) value = defaultValue;
  if (typeof value !== 'string') throw new Error(error);

  const normalized = value.normalize('NFC').trim();
  if (
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)
    || (!multiline && /[\r\n\t]/.test(normalized))
    || normalized.length > max
  ) throw new Error(error);

  if (required && !normalized) throw new Error(error);
  return normalized;
}

function numberField(value, max, { integer = false, error = 'INVALID_NUMBER' } = {}) {
  if (value === undefined || value === null || value === '') return 0;
  if (!['string', 'number'].includes(typeof value)) throw new Error(error);
  if (typeof value === 'string' && !value.trim()) return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max) throw new Error(error);
  if (integer && !Number.isInteger(number)) throw new Error(error);
  return number;
}

function booleanField(value, { defaultValue = false, error = 'INVALID_BOOLEAN' } = {}) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  throw new Error(error);
}

function enumField(value, allowed, { defaultValue, error = 'INVALID_ENUM' } = {}) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value !== 'string' || !allowed.has(value)) throw new Error(error);
  return value;
}

export function normalizeResourceId(value, { max = 191 } = {}) {
  const id = text(value, max, { required: true, error: 'INVALID_ID' });
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw new Error('INVALID_ID');
  return id;
}

export function normalizePropertySlug(value) {
  const slug = text(value, 170, { required: true, error: 'INVALID_SLUG' });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('INVALID_SLUG');
  return slug;
}

export function normalizePropertyInput(input = {}) {
  input = contract(input, [
    'title', 'slug', 'location', 'city', 'purpose', 'type', 'price', 'priceLabel',
    'bedrooms', 'bathrooms', 'areaM2', 'suites', 'parkingSpots', 'condoFee', 'iptu',
    'description', 'status', 'featured'
  ], 'INVALID_PROPERTY');

  const title = text(input.title, 160, { required: true, error: 'TITLE_REQUIRED' });
  const location = text(input.location, 180, { required: true, error: 'LOCATION_REQUIRED' });
  const city = text(input.city ?? 'Belo Horizonte', 120, { required: true, error: 'INVALID_PROPERTY' });
  const purpose = enumField(input.purpose, PURPOSES, { defaultValue: 'Comprar', error: 'INVALID_PROPERTY' });
  const type = enumField(input.type, PROPERTY_TYPES, { defaultValue: 'Apartamento', error: 'INVALID_PROPERTY' });
  const price = numberField(input.price, 999999999999.99, { error: 'INVALID_PROPERTY_NUMBER' });
  const status = enumField(input.status, PROPERTY_STATUSES, { defaultValue: 'draft', error: 'INVALID_PROPERTY' });
  const featured = booleanField(input.featured, { error: 'INVALID_PROPERTY' });

  let slug = text(input.slug, 170, { error: 'INVALID_PROPERTY' });
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('INVALID_PROPERTY');

  const automaticPrice = price > 0
    ? `R$ ${price.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}${purpose === 'Alugar' ? ' / mês' : ''}`
    : 'Sob consulta';

  return {
    title,
    slug,
    location,
    city,
    purpose,
    type,
    price,
    priceLabel: text(input.priceLabel, 100, { error: 'INVALID_PROPERTY' }) || automaticPrice,
    bedrooms: numberField(input.bedrooms, 50, { integer: true, error: 'INVALID_PROPERTY_NUMBER' }),
    bathrooms: numberField(input.bathrooms, 50, { integer: true, error: 'INVALID_PROPERTY_NUMBER' }),
    areaM2: numberField(input.areaM2, 9999999.99, { error: 'INVALID_PROPERTY_NUMBER' }),
    suites: numberField(input.suites, 50, { integer: true, error: 'INVALID_PROPERTY_NUMBER' }),
    parkingSpots: numberField(input.parkingSpots, 50, { integer: true, error: 'INVALID_PROPERTY_NUMBER' }),
    condoFee: numberField(input.condoFee, 99999999.99, { error: 'INVALID_PROPERTY_NUMBER' }),
    iptu: numberField(input.iptu, 9999999999.99, { error: 'INVALID_PROPERTY_NUMBER' }),
    description: text(input.description, 6000, { error: 'INVALID_PROPERTY', multiline: true }),
    status,
    featured
  };
}

export function normalizeSiteSettings(input = {}) {
  input = contract(input, [
    'phoneDisplay', 'whatsapp', 'email', 'address', 'crci', 'area',
    'instagramUrl', 'instagramDisplay'
  ], 'INVALID_SITE_SETTINGS');

  const email = text(input.email, 120, { required: true, error: 'INVALID_EMAIL' }).toLowerCase();
  const rawWhatsapp = text(input.whatsapp, 40, { required: true, error: 'INVALID_WHATSAPP' });
  if (!/^[0-9\s()+.\-]+$/.test(rawWhatsapp)) throw new Error('INVALID_WHATSAPP');
  const whatsapp = rawWhatsapp.replace(/\D/g, '');
  const area = text(input.area, 120, { required: true, error: 'INVALID_SITE_SETTINGS' });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('INVALID_EMAIL');
  if (whatsapp.length < 10 || whatsapp.length > 15) throw new Error('INVALID_WHATSAPP');

  const instagramUrl = text(input.instagramUrl, 200, { error: 'INVALID_INSTAGRAM_URL' });
  if (instagramUrl) {
    let parsed;
    try { parsed = new URL(instagramUrl); } catch { throw new Error('INVALID_INSTAGRAM_URL'); }
    if (
      parsed.protocol !== 'https:'
      || !/(^|\.)instagram\.com$/i.test(parsed.hostname)
      || parsed.username
      || parsed.password
      || (parsed.port && parsed.port !== '443')
    ) throw new Error('INVALID_INSTAGRAM_URL');
  }

  return {
    phoneDisplay: text(input.phoneDisplay, 50, { error: 'INVALID_SITE_SETTINGS' }),
    whatsapp,
    email,
    address: text(input.address, 180, { error: 'INVALID_SITE_SETTINGS' }),
    crci: text(input.crci, 30, { error: 'INVALID_SITE_SETTINGS' }),
    area,
    instagramUrl,
    instagramDisplay: text(input.instagramDisplay, 60, { error: 'INVALID_SITE_SETTINGS' })
  };
}

export function normalizeTestimonial(input = {}) {
  input = contract(input, ['author', 'quote', 'location', 'year', 'sortOrder'], 'INVALID_TESTIMONIAL');
  const author = text(input.author, 120, { required: true, error: 'INVALID_TESTIMONIAL' });
  const quote = text(input.quote, 1200, { required: true, error: 'INVALID_TESTIMONIAL', multiline: true });
  const year = text(input.year, 10, { error: 'INVALID_TESTIMONIAL' });
  if (year && !/^(19|20|21)\d{2}$/.test(year)) throw new Error('INVALID_TESTIMONIAL');

  return {
    author,
    quote,
    location: text(input.location, 120, { error: 'INVALID_TESTIMONIAL' }),
    year,
    sortOrder: numberField(input.sortOrder, 10000, { integer: true, error: 'INVALID_TESTIMONIAL' })
  };
}

export function normalizeContactLead(input = {}) {
  input = contract(input, ['name', 'email', 'message', 'interest', 'propertyPath', 'website'], 'INVALID_CONTACT');

  const name = text(input.name, 120, { required: true, error: 'INVALID_CONTACT' });
  const email = text(input.email, 255, { required: true, error: 'INVALID_CONTACT' }).toLowerCase();
  const message = text(input.message, 3000, { required: true, error: 'INVALID_CONTACT', multiline: true });
  const interest = enumField(input.interest, LEAD_INTERESTS, { defaultValue: 'Tenho outra dúvida', error: 'INVALID_CONTACT' });
  const propertyPath = text(input.propertyPath, 240, { error: 'INVALID_CONTACT' });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('INVALID_CONTACT');
  if (
    propertyPath
    && (
      !propertyPath.startsWith('/')
      || propertyPath.startsWith('//')
      || propertyPath.includes('\\')
      || propertyPath.includes('..')
      || /[\r\n?#]/.test(propertyPath)
    )
  ) throw new Error('INVALID_CONTACT');

  return { name, email, interest, message, propertyPath };
}

export function normalizeUploadRequest(input = {}) {
  input = contract(input, ['propertyId', 'fileName', 'contentType', 'size'], 'INVALID_FILE');
  const propertyId = normalizeResourceId(input.propertyId);
  const fileName = text(input.fileName, 180, { required: true, error: 'INVALID_FILE' });
  const contentType = enumField(input.contentType, IMAGE_MIME_TYPES, { error: 'INVALID_FILE' });
  const size = numberField(input.size, 12 * 1024 * 1024, { integer: true, error: 'INVALID_FILE' });
  if (size <= 0 || !/\.(?:jpe?g|png|webp|avif)$/i.test(fileName)) throw new Error('INVALID_FILE');
  return { propertyId, fileName, contentType, size };
}

export function normalizePhotoInput(input = {}) {
  input = contract(input, [
    'storagePath', 'altText', 'contentType', 'size', 'width', 'height', 'sortOrder', 'isCover'
  ], 'INVALID_ASSET');
  const storagePath = text(input.storagePath, 500, { required: true, error: 'INVALID_ASSET' });
  const altText = text(input.altText, 255, { error: 'INVALID_ASSET' });
  const contentType = enumField(input.contentType, IMAGE_MIME_TYPES, { error: 'INVALID_ASSET' });
  const size = numberField(input.size, 12 * 1024 * 1024, { integer: true, error: 'INVALID_ASSET' });
  const width = numberField(input.width, 20000, { integer: true, error: 'INVALID_ASSET' });
  const height = numberField(input.height, 20000, { integer: true, error: 'INVALID_ASSET' });
  const sortOrder = numberField(input.sortOrder, 39, { integer: true, error: 'INVALID_ASSET' });
  const isCover = booleanField(input.isCover, { error: 'INVALID_ASSET' });
  if (size <= 0 || width <= 0 || height <= 0) throw new Error('INVALID_ASSET');
  return { storagePath, altText, contentType, size, width, height, sortOrder, isCover };
}

export function normalizePhotoOrder(input = {}) {
  input = contract(input, ['photoIds'], 'INVALID_ORDER');
  if (!Array.isArray(input.photoIds) || input.photoIds.length > 40) throw new Error('INVALID_ORDER');
  const photoIds = input.photoIds.map((id) => normalizeResourceId(id, { max: 36 }));
  if (new Set(photoIds).size !== photoIds.length) throw new Error('INVALID_ORDER');
  return photoIds;
}

export function normalizeLeadStatus(value) {
  if (typeof value !== 'string' || !LEAD_STATUSES.has(value)) throw new Error('INVALID_LEAD_STATUS');
  return value;
}

export function normalizeLeadStatusRequest(input = {}) {
  input = contract(input, ['status'], 'INVALID_LEAD_STATUS');
  return normalizeLeadStatus(input.status);
}

export function normalizeAuditLimit(value) {
  if (value === undefined || value === null || value === '') return 100;
  return numberField(value, 250, { integer: true, error: 'INVALID_LIMIT' }) || 100;
}

export function normalizeTeamCreate(input = {}) {
  input = contract(input, ['email', 'pairingCode', 'name', 'role'], 'INVALID_TEAM_MEMBER');
  const email = text(input.email, 255, { required: true, error: 'INVALID_TEAM_MEMBER' }).toLowerCase();
  const pairingCode = text(input.pairingCode, 64, { required: true, error: 'INVALID_TEAM_MEMBER' });
  const name = text(input.name, 255, { required: true, error: 'INVALID_TEAM_MEMBER' });
  const role = enumField(input.role, TEAM_ROLES, { defaultValue: 'editor', error: 'INVALID_TEAM_MEMBER' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[A-Za-z0-9_-]{12,64}$/.test(pairingCode)) {
    throw new Error('INVALID_TEAM_MEMBER');
  }
  return { email, pairingCode, name, role };
}

export function normalizeTeamPatch(input = {}) {
  input = contract(input, ['name', 'role', 'active'], 'INVALID_TEAM_MEMBER');
  const result = {};
  if (Object.hasOwn(input, 'name')) result.name = text(input.name, 255, { required: true, error: 'INVALID_TEAM_MEMBER' });
  if (Object.hasOwn(input, 'role')) result.role = enumField(input.role, TEAM_ROLES, { error: 'INVALID_TEAM_MEMBER' });
  if (Object.hasOwn(input, 'active')) result.active = booleanField(input.active, { error: 'INVALID_TEAM_MEMBER' });
  if (!Object.keys(result).length) throw new Error('INVALID_TEAM_MEMBER');
  return result;
}
