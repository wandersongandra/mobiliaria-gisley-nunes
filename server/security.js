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
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/.test(host)) return '';

  try {
    const parsed = new URL(`http://${host}`);
    const port = parsed.port ? Number(parsed.port) : 0;
    if (port && (port < 1 || port > 65535)) return '';
    if (!parsed.hostname || parsed.hostname.includes('..') || parsed.hostname.startsWith('.') || parsed.hostname.endsWith('.')) return '';
    return parsed.host.toLowerCase();
  } catch {
    return '';
  }
}

function configuredHost(origin) {
  if (!origin) return '';
  try { return new URL(origin).host.toLowerCase(); } catch { return ''; }
}

function isLoopbackAddress(value) {
  const address = String(value || '').replace(/^::ffff:/, '');
  return address === '127.0.0.1' || address === '::1';
}

export function hostIsKnown(req) {
  const host = safeHost(req.get('host'));
  if (!host) return false;

  const allowed = new Set([
    configuredHost(configuredPublicOrigin()),
    configuredHost(configuredAdminOrigin())
  ].filter(Boolean));

  if (!allowed.size) return true;
  return allowed.has(host);
}

export function requireKnownHost(req, res, next) {
  if (!isProduction) return next();

  if (req.path.startsWith('/_app/') && isLoopbackAddress(req.socket?.remoteAddress)) {
    return next();
  }

  if (hostIsKnown(req)) return next();
  return res.status(421).json({ error: 'MISDIRECTED_REQUEST' });
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

export function assertSecurityConfiguration() {
  if (!isProduction) return true;

  const publicOrigin = configuredPublicOrigin();
  const adminOrigin = configuredAdminOrigin();
  if (!publicOrigin || !publicOrigin.startsWith('https://')) throw new Error('PUBLIC_ORIGIN_NOT_CONFIGURED');
  if (!adminOrigin || !adminOrigin.startsWith('https://')) throw new Error('ADMIN_ORIGIN_NOT_CONFIGURED');

  const publicHost = configuredHost(publicOrigin);
  const adminHost = configuredHost(adminOrigin);
  if (!publicHost || !adminHost || publicHost === adminHost) throw new Error('ORIGIN_SEPARATION_REQUIRED');

  const proxyMode = String(process.env.TRUST_PROXY_MODE || '').trim();
  if (proxyMode && proxyMode !== 'cloudflare') throw new Error('INVALID_TRUST_PROXY_MODE');
  return true;
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
    imageSources.push('https://images.unsplash.com');
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

function expectedMutationOrigin(req) {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  const administrative = path.startsWith('/api/admin') || path.startsWith('/api/auth');
  if (administrative) return configuredAdminOrigin() || requestHostOrigin(req);
  return configuredPublicOrigin() || requestHostOrigin(req);
}

export function requireSameOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const expected = expectedMutationOrigin(req);
  const origin = String(req.get('origin') || '').trim();
  const fetchSite = String(req.get('sec-fetch-site') || '').trim().toLowerCase();
  const canonicalConfigured = Boolean(
    String(req.originalUrl || '').startsWith('/api/admin')
      || String(req.originalUrl || '').startsWith('/api/auth')
      ? configuredAdminOrigin()
      : configuredPublicOrigin()
  );

  if (origin && expected && origin === expected) {
    if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
      return res.status(403).json({ error: 'CROSS_SITE_REQUEST_BLOCKED' });
    }
    return next();
  }

  if (!canonicalConfigured && !origin && fetchSite === 'same-origin' && expected) return next();

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
