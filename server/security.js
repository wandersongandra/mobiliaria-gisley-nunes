import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import {
  configuredAdminOrigin,
  configuredPublicOrigin,
  hasLegacyStorage,
  hasR2Storage,
  isProduction,
  r2Storage,
  storage
} from './config.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MAX_RATE_BUCKETS = 10000;
const rateBuckets = new Map();

function firstHeader(value) {
  return String(value || '').split(',')[0].trim();
}

function safeHost(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.includes(',')) return '';
  const host = raw.toLowerCase();
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

function hostMatchesOrigin(host, origin) {
  if (!host || !origin) return false;
  try {
    const parsedOrigin = new URL(origin);
    const expectedHost = parsedOrigin.hostname.toLowerCase();
    const candidate = new URL(`http://${host}`);
    const candidateHost = candidate.hostname.toLowerCase();
    if (candidateHost !== expectedHost) return false;

    const candidatePort = candidate.port ? Number(candidate.port) : 0;
    const defaultPort = parsedOrigin.protocol === 'https:' ? 443 : 80;
    if (parsedOrigin.port) {
      return candidatePort === Number(parsedOrigin.port);
    }
    return candidatePort === 0 || candidatePort === defaultPort;
  } catch {
    return false;
  }
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
  return [configuredPublicOrigin(), configuredAdminOrigin()]
    .filter(Boolean)
    .some((origin) => hostMatchesOrigin(host, origin));
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

  const publicOrigin = configuredPublicOrigin();
  const adminOrigin = configuredAdminOrigin();
  if (publicOrigin && hostMatchesOrigin(host, publicOrigin)) return publicOrigin;
  if (adminOrigin && hostMatchesOrigin(host, adminOrigin)) return adminOrigin;

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

  const trustClientIp = String(process.env.TRUST_CLIENT_IP_HEADER || '').trim().toLowerCase() === 'true';
  if (trustClientIp && proxyMode !== 'cloudflare') throw new Error('UNSAFE_CLIENT_IP_TRUST');
  return true;
}

export function securityHeaders(req, res, next) {
  const nonce = randomBytes(18).toString('base64url');
  res.locals.cspNonce = nonce;

  const imageSources = ["'self'", 'data:', 'blob:'];
  const connectSources = ["'self'"];
  const mediaSources = ["'self'"];

  if (!isProduction) {
    imageSources.push('https:');
    connectSources.push('https:');
    mediaSources.push('https:');
  } else {
    imageSources.push('https://images.unsplash.com');
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
    "script-src-attr 'none'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src ${[...new Set(imageSources)].join(' ')}`,
    `connect-src ${[...new Set(connectSources)].join(' ')}`,
    `media-src ${[...new Set(mediaSources)].join(' ')}`,
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
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
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
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

export function clientAddress(req) {
  const trustCloudflare = process.env.TRUST_PROXY_MODE === 'cloudflare';
  const trustClientIp = String(process.env.TRUST_CLIENT_IP_HEADER || '').trim().toLowerCase() === 'true';

  if (trustCloudflare && trustClientIp) {
    const candidate = firstHeader(req.headers['cf-connecting-ip']);
    if (isIP(candidate)) return candidate;
  }

  return String(req.socket?.remoteAddress || 'unknown');
}

function compactRateBuckets(now) {
  for (const [bucketKey, bucket] of rateBuckets.entries()) {
    if (now >= bucket.resetAt) rateBuckets.delete(bucketKey);
  }

  while (rateBuckets.size >= MAX_RATE_BUCKETS) {
    const oldestKey = rateBuckets.keys().next().value;
    if (oldestKey === undefined) break;
    rateBuckets.delete(oldestKey);
  }
}

export function rateLimiterBucketCount() {
  return rateBuckets.size;
}

export function createRateLimiter({ windowMs, max, namespace = 'default' }) {
  const safeWindowMs = Math.max(1000, Number(windowMs) || 1000);
  const safeMax = Math.max(1, Math.floor(Number(max) || 1));

  return (req, res, next) => {
    const now = Date.now();
    const remote = clientAddress(req);
    const key = `${namespace}:${remote}`;
    let current = rateBuckets.get(key);

    if (!current || now >= current.resetAt) {
      if (!current && rateBuckets.size >= MAX_RATE_BUCKETS) compactRateBuckets(now);
      current = { count: 1, resetAt: now + safeWindowMs };
      rateBuckets.set(key, current);
    } else if (current.count < safeMax) {
      current.count += 1;
    }

    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    const remaining = Math.max(0, safeMax - current.count);
    res.setHeader('RateLimit-Limit', String(safeMax));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(retryAfter));

    if (current.count >= safeMax && remaining === 0) {
      // A requisição que alcança exatamente o limite ainda é aceita; somente as seguintes são bloqueadas.
      if (current.count === safeMax && !current.blockNext) {
        current.blockNext = true;
        return next();
      }
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'RATE_LIMITED', retryAfter });
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


export function requireAdminRequestContext(req, res, next) {
  const adminOrigin = configuredAdminOrigin();
  if (adminOrigin && requestHostOrigin(req) !== adminOrigin) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  const fetchSite = String(req.get('sec-fetch-site') || '').trim().toLowerCase();
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    return res.status(403).json({ error: 'CROSS_SITE_REQUEST_BLOCKED' });
  }

  return next();
}
