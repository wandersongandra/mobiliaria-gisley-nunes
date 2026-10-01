import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import {
  configuredAdminOrigin,
  configuredMediaOrigin,
  configuredPublicOrigin,
  hasLegacyStorage,
  hasR2Storage,
  isProduction,
  r2Storage,
  storage
} from './config.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const rateBuckets = new Map();

function firstHeader(value) {
  return String(value || '').split(',')[0].trim();
}

function safeHost(value) {
  const host = firstHeader(value).toLowerCase();
  return /^[a-z0-9.-]+(?::\d{1,5})?$/.test(host) ? host : '';
}

export function requestHostOrigin(req) {
  const host = safeHost(req.get('host'));
  if (!host) return '';

  const trustCloudflare = process.env.TRUST_PROXY_MODE === 'cloudflare';
  const forwardedProto = trustCloudflare ? firstHeader(req.headers['x-forwarded-proto']) : '';
  const proto = forwardedProto === 'https' || req.secure ? 'https' : 'http';
  return `${proto}://${host}`;
}

export function requestOrigin(req) {
  return configuredPublicOrigin() || requestHostOrigin(req);
}

export function securityHeaders(req, res, next) {
  const nonce = randomBytes(18).toString('base64url');
  res.locals.cspNonce = nonce;

  const mediaOrigin = configuredMediaOrigin();
  const imageSources = ["'self'", 'data:', 'blob:'];
  const connectSources = ["'self'"];
  const mediaSources = ["'self'"];

  if (!isProduction) {
    imageSources.push('https:');
    connectSources.push('https:');
    mediaSources.push('https:');
  } else {
    if (mediaOrigin) {
      imageSources.push(mediaOrigin);
      mediaSources.push(mediaOrigin);
    }
    if (hasR2Storage()) {
      const r2Origin = `https://${r2Storage.accountId}.r2.cloudflarestorage.com`;
      imageSources.push(r2Origin);
      connectSources.push(r2Origin);
      mediaSources.push(r2Origin);
    }
    if (hasLegacyStorage()) {
      try {
        const legacyOrigin = new URL(storage.apiUrl).origin;
        connectSources.push(legacyOrigin);
        imageSources.push(legacyOrigin);
      } catch {}
    }
  }

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src ${[...new Set(imageSources)].join(' ')}`,
    `connect-src ${[...new Set(connectSources)].join(' ')}`,
    `media-src ${[...new Set(mediaSources)].join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ];

  if (isProduction) directives.push('upgrade-insecure-requests');

  res.setHeader('Content-Security-Policy', directives.join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

export function requireSameOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const expected = requestHostOrigin(req);
  const origin = String(req.get('origin') || '').trim();
  const fetchSite = String(req.get('sec-fetch-site') || '').trim().toLowerCase();

  if (origin && expected && origin === expected) return next();
  if (!origin && fetchSite === 'same-origin') return next();

  return res.status(403).json({ error: 'CROSS_SITE_REQUEST_BLOCKED' });
}

function clientAddress(req) {
  if (process.env.TRUST_PROXY_MODE === 'cloudflare') {
    const candidate = firstHeader(req.headers['cf-connecting-ip']);
    if (isIP(candidate)) return candidate;
  }
  return String(req.socket?.remoteAddress || 'unknown');
}

export function createRateLimiter({ windowMs, max, namespace = 'default' }) {
  return (req, res, next) => {
    const now = Date.now();
    const remote = clientAddress(req);
    const key = `${namespace}:${remote}`;
    const current = rateBuckets.get(key);

    if (!current || now >= current.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'RATE_LIMITED', retryAfter });
    }

    current.count += 1;

    if (rateBuckets.size > 5000) {
      for (const [bucketKey, bucket] of rateBuckets.entries()) {
        if (now >= bucket.resetAt) rateBuckets.delete(bucketKey);
      }
    }

    return next();
  };
}


export function requireAdminOrigin(req, res, next) {
  const adminOrigin = configuredAdminOrigin();
  if (!adminOrigin) return next();

  const currentOrigin = requestHostOrigin(req);
  if (currentOrigin === adminOrigin) return next();

  const originalPath = String(req.originalUrl || '').split('?')[0];
  if (req.method === 'GET' && originalPath === '/api/auth/login') {
    return res.redirect(307, `${adminOrigin}${req.originalUrl}`);
  }

  return res.status(404).json({ error: 'NOT_FOUND' });
}
