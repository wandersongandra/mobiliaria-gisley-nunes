const env = process.env;

export const port = Number(env.PORT || 3000);
export const isProduction = env.NODE_ENV === 'production';

export function hasDatabase() {
  return Boolean(env.DATABASE_URL);
}

export function adminEmails() {
  return String(env.MORADA_ADMIN_EMAILS || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export function isAllowedEmail(email) {
  return adminEmails().includes(String(email || '').trim().toLowerCase());
}

export function sessionSecret() {
  return env.MORADA_SESSION_SECRET || '';
}

export function hasStorage() {
  return Boolean(env.MANUS_API_URL && env.MANUS_API_KEY);
}

export const oauth = {
  portalUrl: env.MANUS_OAUTH_PORTAL_URL || '',
  apiUrl: env.MANUS_OAUTH_API_URL || '',
  projectId: env.MANUS_PROJECT_ID || '',
  jwtSecret: env.MANUS_JWT_SECRET || ''
};

export const storage = {
  apiUrl: env.MANUS_API_URL || '',
  apiKey: env.MANUS_API_KEY || ''
};