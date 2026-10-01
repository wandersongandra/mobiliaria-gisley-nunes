const env = process.env;

export const port = Number(env.PORT || 3000);
export const isProduction = env.NODE_ENV === 'production';

export function hasDatabase() {
  return Boolean(env.DATABASE_URL);
}

export function adminEmails() {
  return String(env.GISELY_ADMIN_EMAILS || env.MORADA_ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email) {
  return adminEmails().includes(String(email || '').trim().toLowerCase());
}

export function sessionSecret() {
  return String(env.GISELY_SESSION_SECRET || env.MORADA_SESSION_SECRET || '');
}

export function maxAdminSessions() {
  const value = Number(env.GISELY_MAX_ADMIN_SESSIONS || 5);
  if (!Number.isFinite(value)) return 5;
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
    url.username = '';
    url.password = '';
    url.pathname = '';
    url.search = '';
    url.hash = '';
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

export function configuredMediaOrigin() {
  return configuredOrigin(env.MEDIA_PUBLIC_ORIGIN);
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
  portalUrl: env.MANUS_OAUTH_PORTAL_URL || '',
  apiUrl: env.MANUS_OAUTH_API_URL || '',
  projectId: env.MANUS_PROJECT_ID || ''
};

export const r2Storage = {
  accountId: env.R2_ACCOUNT_ID || '',
  bucket: env.R2_BUCKET || '',
  accessKeyId: env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: env.R2_SECRET_ACCESS_KEY || '',
  uploadExpiresSeconds: Math.min(Math.max(Number(env.R2_UPLOAD_EXPIRES_SECONDS || 600), 60), 3600)
};

export const storage = {
  apiUrl: env.MANUS_API_URL || '',
  apiKey: env.MANUS_API_KEY || ''
};


export function legacyStorageRouteEnabled() {
  return String(env.ENABLE_LEGACY_STORAGE_ROUTE || '').trim().toLowerCase() === 'true';
}
