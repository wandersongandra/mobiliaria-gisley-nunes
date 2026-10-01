import { createHash, createHmac } from 'node:crypto';
import {
  configuredMediaOrigin,
  hasLegacyStorage,
  hasR2Storage,
  hasStorage,
  r2Storage,
  storage
} from './config.js';

const assetPrefixes = ['gisley/properties/', 'morada/properties/'];

export function safeFileName(value) {
  return String(value || 'imagem')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100) || 'imagem';
}

function assertStorageKey(filePath) {
  const key = String(filePath || '').replace(/^\/+/, '').slice(0, 500);
  if (!assetPrefixes.some((prefix) => key.startsWith(prefix)) || key.includes('..') || key.includes('\0')) throw new Error('INVALID_ASSET');
  return key;
}

export function storagePathBelongsToProperty(filePath, propertyId) {
  try {
    const key = assertStorageKey(filePath);
    const id = String(propertyId || '').trim();
    if (!id || id.includes('/') || id.includes('\\') || id.includes('..')) return false;
    return key.startsWith(`gisley/properties/${id}/`);
  } catch {
    return false;
  }
}

function encodeRfc3986(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodePath(value) {
  return String(value).split('/').map(encodeRfc3986).join('/');
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest();
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function amzTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function canonicalQuery(params) {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
}

function r2PresignedUrl(filePath, { method = 'GET', expiresSeconds = 600, contentType = '' } = {}) {
  if (!hasR2Storage()) throw new Error('R2_NOT_CONFIGURED');
  const key = assertStorageKey(filePath);
  const verb = String(method || 'GET').toUpperCase();
  if (!['GET', 'PUT', 'HEAD', 'DELETE'].includes(verb)) throw new Error('INVALID_STORAGE_METHOD');

  const host = `${r2Storage.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeRfc3986(r2Storage.bucket)}/${encodePath(key)}`;
  const timestamp = amzTimestamp();
  const date = timestamp.slice(0, 8);
  const scope = `${date}/auto/s3/aws4_request`;
  const expires = Math.min(Math.max(Number(expiresSeconds || 600), 1), 604800);
  const normalizedContentType = String(contentType || '').trim().toLowerCase();
  const signedHeaders = normalizedContentType ? 'content-type;host' : 'host';
  const canonicalHeaders = normalizedContentType
    ? `content-type:${normalizedContentType}\nhost:${host}\n`
    : `host:${host}\n`;
  const params = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${r2Storage.accessKeyId}/${scope}`,
    'X-Amz-Date': timestamp,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': signedHeaders
  };
  const query = canonicalQuery(params);
  const canonicalRequest = [
    verb,
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD'
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    scope,
    hash(canonicalRequest)
  ].join('\n');
  const dateKey = hmac(`AWS4${r2Storage.secretAccessKey}`, date);
  const regionKey = hmac(dateKey, 'auto');
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return `https://${host}${canonicalUri}?${query}&X-Amz-Signature=${signature}`;
}

export function storageProviderName() {
  if (hasR2Storage()) return 'r2';
  if (hasLegacyStorage()) return 'legacy';
  return 'none';
}

export function storageAssetUrl(filePath) {
  const key = assertStorageKey(filePath);
  if (hasR2Storage()) {
    const mediaOrigin = configuredMediaOrigin();
    if (mediaOrigin) return `${mediaOrigin}/${encodePath(key)}`;
    return `/media/${encodePath(key)}`;
  }
  if (hasLegacyStorage()) return `/manus-storage/${encodePath(key)}`;
  throw new Error('STORAGE_NOT_CONFIGURED');
}

export async function storagePresign(filePath, { contentType = '' } = {}) {
  if (!hasStorage()) throw new Error('STORAGE_NOT_CONFIGURED');
  const key = assertStorageKey(filePath);

  if (hasR2Storage()) {
    return r2PresignedUrl(key, {
      method: 'PUT',
      expiresSeconds: r2Storage.uploadExpiresSeconds,
      contentType
    });
  }

  const base = storage.apiUrl.replace(/\/$/, '');
  const url = `${base}/v1/storage/presign/put?path=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${storage.apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.url) throw new Error(body.error || `STORAGE_PRESIGN_${response.status}`);
  return body.url;
}

export async function storageGetSignedUrl(filePath) {
  if (!hasStorage()) throw new Error('STORAGE_NOT_CONFIGURED');
  const key = assertStorageKey(filePath);

  if (hasR2Storage()) return r2PresignedUrl(key, { method: 'GET', expiresSeconds: 300 });

  const base = storage.apiUrl.replace(/\/$/, '');
  const url = `${base}/v1/storage/presign/get?path=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${storage.apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.url) throw new Error(body.error || `STORAGE_GET_${response.status}`);
  return body.url;
}

export async function storageObjectMetadata(filePath) {
  const key = assertStorageKey(filePath);
  if (!hasR2Storage()) return { exists: true, size: null, contentType: null };

  const url = r2PresignedUrl(key, { method: 'HEAD', expiresSeconds: 120 });
  const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
  if (!response.ok) return { exists: false, size: null, contentType: null };

  const rawLength = response.headers.get('content-length');
  const parsedLength = rawLength === null ? null : Number(rawLength);
  const rawType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

  return {
    exists: true,
    size: Number.isFinite(parsedLength) && parsedLength >= 0 ? parsedLength : null,
    contentType: rawType || null
  };
}

export async function storageObjectExists(filePath) {
  return (await storageObjectMetadata(filePath)).exists;
}

export async function storageDelete(filePath) {
  const key = assertStorageKey(filePath);
  if (!hasR2Storage()) return false;
  const url = r2PresignedUrl(key, { method: 'DELETE', expiresSeconds: 120 });
  const response = await fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(10000) });
  if (!response.ok && response.status !== 404) throw new Error(`STORAGE_DELETE_${response.status}`);
  return true;
}


export function matchesImageSignature(bytes, contentType) {
  const type = String(contentType || '').toLowerCase();
  if (type === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === 'image/png') {
    const signature = [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  if (type === 'image/webp') {
    return bytes.length >= 12
      && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF'
      && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP';
  }
  if (type === 'image/avif') {
    if (bytes.length < 16 || Buffer.from(bytes.subarray(4, 8)).toString('ascii') !== 'ftyp') return false;
    const brands = Buffer.from(bytes.subarray(8, Math.min(bytes.length, 32))).toString('ascii');
    return brands.includes('avif') || brands.includes('avis');
  }
  return false;
}

export async function storageObjectLooksLikeImage(filePath, contentType) {
  const key = assertStorageKey(filePath);
  const url = await storageGetSignedUrl(key);
  const response = await fetch(url, {
    headers: { Range: 'bytes=0-31' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok && response.status !== 206) return false;
  const bytes = new Uint8Array(await response.arrayBuffer());
  return matchesImageSignature(bytes, contentType);
}
