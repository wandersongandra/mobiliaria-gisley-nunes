const env = process.env;

export const port = Number(env.PORT || 3000);
export const isProduction = env.NODE_ENV === 'production';

export function hasDatabase() {
  return Boolean(env.DATABASE_URL);
}

export function adminOpenIds() {
  return String(env.GISELY_ADMIN_OPEN_IDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function adminBootstrapEmails() {
  return String(env.GISELY_ADMIN_BOOTSTRAP_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedOpenId(openId) {
  return adminOpenIds().includes(String(openId || '').trim());
}

export function isAllowedIdentity(openId, email = '') {
  return isAllowedOpenId(openId)
    || adminBootstrapEmails().includes(String(email || '').trim().toLowerCase());
}

export function sessionSecret() {
  return String(env.GISELY_SESSION_SECRET || '');
}

export function maxAdminSessions() {
  const value = Number(env.GISELY_MAX_ADMIN_SESSIONS || 3);
  if (!Number.isFinite(value)) return 3;
  return Math.min(Math.max(Math.trunc(value), 1), 10);
}

export function sessionIdleTimeoutMs() {
  const minutes = Number(env.GISELY_ADMIN_IDLE_TIMEOUT_MINUTES || 60);
  const safeMinutes = Number.isFinite(minutes)
    ? Math.min(Math.max(Math.trunc(minutes), 15), 240)
    : 60;
  return safeMinutes * 60 * 1000;
}

function configuredOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (url.username || url.password) return '';
    if (url.pathname && url.pathname !== '/') return '';
    if (url.search || url.hash) return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function configuredPublicOrigin() {
  return configuredOrigin(env.PUBLIC_ORIGIN);
}

export function configuredAdminOrigin() {
  return configuredOrigin(env.ADMIN_ORIGIN);
}


export function hasR2Storage() {
  return Boolean(
    env.R2_ACCOUNT_ID
    && env.R2_BUCKET
    && env.R2_ACCESS_KEY_ID
    && env.R2_SECRET_ACCESS_KEY
  );
}

export function hasLegacyStorage() {
  return Boolean(env.MANUS_API_URL && env.MANUS_API_KEY);
}

export function hasStorage() {
  return hasR2Storage() || hasLegacyStorage();
}

export const oauth = {
  provider: 'google',
  clientId: env.GOOGLE_CLIENT_ID || '',
  clientSecret: env.GOOGLE_CLIENT_SECRET || '',
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo'
};

export function r2UploadExpiresSeconds() {
  const value = Number(env.R2_UPLOAD_EXPIRES_SECONDS || 600);
  if (!Number.isFinite(value)) return 600;
  return Math.min(Math.max(Math.trunc(value), 60), 3600);
}

export const r2Storage = {
  accountId: env.R2_ACCOUNT_ID || '',
  bucket: env.R2_BUCKET || '',
  accessKeyId: env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: env.R2_SECRET_ACCESS_KEY || '',
  get uploadExpiresSeconds() { return r2UploadExpiresSeconds(); }
};

export const storage = {
  apiUrl: env.MANUS_API_URL || '',
  apiKey: env.MANUS_API_KEY || ''
};


export function legacyStorageRouteEnabled() {
  return String(env.ENABLE_LEGACY_STORAGE_ROUTE || '').trim().toLowerCase() === 'true';
}


export function assertStorageConfiguration() {
  if (!isProduction) return true;
  if (!hasR2Storage()) throw new Error('R2_STORAGE_NOT_CONFIGURED');

  if (!/^[a-f0-9]{32}$/i.test(String(r2Storage.accountId))) {
    throw new Error('R2_ACCOUNT_ID_INVALID');
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/.test(String(r2Storage.bucket))) {
    throw new Error('R2_BUCKET_INVALID');
  }
  if (String(r2Storage.accessKeyId).trim().length < 16) {
    throw new Error('R2_ACCESS_KEY_INVALID');
  }
  if (String(r2Storage.secretAccessKey).trim().length < 32) {
    throw new Error('R2_SECRET_KEY_INVALID');
  }
  if (legacyStorageRouteEnabled()) {
    throw new Error('LEGACY_STORAGE_ROUTE_FORBIDDEN_IN_PRODUCTION');
  }
  return true;
}


export function databaseSslConfig() {
  const mode = String(env.DATABASE_SSL_MODE || (isProduction ? 'verify' : 'disable')).trim().toLowerCase();
  if (!['verify', 'disable'].includes(mode)) throw new Error('DATABASE_SSL_MODE_INVALID');
  if (mode === 'disable') return undefined;

  const caBase64 = String(env.DATABASE_SSL_CA_BASE64 || '').trim();
  let ca;
  if (caBase64) {
    try {
      ca = Buffer.from(caBase64, 'base64').toString('utf8');
      if (!ca.includes('BEGIN CERTIFICATE')) throw new Error('INVALID_CA');
    } catch {
      throw new Error('DATABASE_SSL_CA_INVALID');
    }
  }
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}

export function assertDatabaseConfiguration() {
  if (!isProduction) return true;
  if (!hasDatabase()) throw new Error('DATABASE_NOT_CONFIGURED');

  let url;
  try {
    url = new URL(String(env.DATABASE_URL || ''));
  } catch {
    throw new Error('DATABASE_URL_INVALID');
  }
  if (url.protocol !== 'mysql:') throw new Error('DATABASE_URL_INVALID');
  if (!url.hostname || !url.username || !url.password) throw new Error('DATABASE_URL_INVALID');

  const mode = String(env.DATABASE_SSL_MODE || 'verify').trim().toLowerCase();
  if (mode !== 'verify') throw new Error('DATABASE_TLS_REQUIRED');
  databaseSslConfig();
  return true;
}
