const env = process.env;

export const port = Number(env.PORT || 3000);
export const isProduction = env.NODE_ENV === 'production';

export function hasDatabase() {
  return Boolean(env.DATABASE_URL);
}

export function adminEmails() {
  return String(env.MORADA_ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email) {
  return adminEmails().includes(String(email || '').trim().toLowerCase());
}

export function sessionSecret() {
  return String(env.MORADA_SESSION_SECRET || '');
}

export function configuredPublicOrigin() {
  const raw = String(env.PUBLIC_ORIGIN || '').trim();
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

export function hasStorage() {
  return Boolean(env.MANUS_API_URL && env.MANUS_API_KEY);
}

export const oauth = {
  portalUrl: env.MANUS_OAUTH_PORTAL_URL || '',
  apiUrl: env.MANUS_OAUTH_API_URL || '',
  projectId: env.MANUS_PROJECT_ID || ''
};

export const storage = {
  apiUrl: env.MANUS_API_URL || '',
  apiKey: env.MANUS_API_KEY || ''
};
