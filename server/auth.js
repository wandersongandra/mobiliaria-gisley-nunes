import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { findAdmin, findStaffAccess, saveStaffAccess, upsertAdmin } from './db.js';
import { hasDatabase, isAllowedEmail, oauth, sessionSecret } from './config.js';
import { requestOrigin } from './security.js';

const sessionCookie = 'webdev_app_session';
const stateCookie = 'morada_oauth_state';
const sessionIssuer = 'gisley-nunes-imoveis';
const sessionAudience = 'morada-admin';

function secureCookie(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return process.env.NODE_ENV === 'production' || forwardedProto === 'https' || req.secure;
}

function cookieOptions(req, extra = {}) {
  return {
    httpOnly: true,
    secure: secureCookie(req),
    sameSite: 'lax',
    path: '/',
    ...extra
  };
}

function encodeState(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeState(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function assertAuthConfig() {
  if (!oauth.portalUrl || !oauth.apiUrl || !oauth.projectId) throw new Error('OAUTH_NOT_CONFIGURED');
  if (sessionSecret().length < 32) throw new Error('SESSION_SECRET_NOT_CONFIGURED');
}

async function signSession(user) {
  const secret = new TextEncoder().encode(sessionSecret());
  return new SignJWT({ openId: user.openId, email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(sessionIssuer)
    .setAudience(sessionAudience)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret);
}

async function verifySessionToken(token) {
  const secretValue = sessionSecret();
  if (secretValue.length < 32) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secretValue), {
      algorithms: ['HS256'],
      issuer: sessionIssuer,
      audience: sessionAudience
    });
    if (['manager', 'editor'].includes(payload.role) && payload.openId) return payload;
  } catch {}
  return null;
}

export async function currentAdmin(req) {
  const token = req.cookies?.[sessionCookie];
  if (!token || !hasDatabase()) return null;
  const payload = await verifySessionToken(token);
  if (!payload?.openId) return null;
  const user = await findAdmin(String(payload.openId));
  if (!user) return null;
  const email = String(user.email || '').trim().toLowerCase();
  const bootstrapManager = isAllowedEmail(email);
  const access = await findStaffAccess(email);
  if (!bootstrapManager && (!access || !access.active)) return null;
  const role = bootstrapManager ? 'manager' : (access?.role === 'manager' ? 'manager' : 'editor');
  return { openId: user.open_id, email, name: user.name, role };
}

export function requireAdmin() {
  return async (req, res, next) => {
    try {
      const user = await currentAdmin(req);
      if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED', login: true });
      req.admin = user;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireManager() {
  return (req, res, next) => {
    if (req.admin?.role !== 'manager') return res.status(403).json({ error: 'MANAGER_REQUIRED' });
    return next();
  };
}

export function login(req, res, next) {
  try {
    assertAuthConfig();
    const origin = requestOrigin(req);
    if (!origin) return res.status(400).send('Origem inválida.');

    const redirectUri = `${origin}/api/auth/callback`;
    const nonce = randomUUID();
    const state = encodeState({ redirectUri, nonce });

    res.cookie(stateCookie, state, cookieOptions(req, { maxAge: 10 * 60 * 1000, path: '/api/auth' }));

    const url = new URL(`${oauth.portalUrl.replace(/\/$/, '')}/app-auth`);
    url.searchParams.set('appId', oauth.projectId);
    url.searchParams.set('redirectUri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('responseType', 'code');
    return res.redirect(302, url.toString());
  } catch (error) {
    return next(error);
  }
}

async function exchangeCode({ code, redirectUri }) {
  const response = await fetch(`${oauth.apiUrl.replace(/\/$/, '')}/webdev.v1.WebDevAuthPublicService/ExchangeToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'connect-protocol-version': '1' },
    body: JSON.stringify({ clientId: oauth.projectId, grantType: 'authorization_code', code, redirectUri }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`OAUTH_EXCHANGE_${response.status}`);

  const result = await response.json();
  if (!result.accessToken) throw new Error('OAUTH_ACCESS_TOKEN_MISSING');

  const infoResponse = await fetch(`${oauth.apiUrl.replace(/\/$/, '')}/webdev.v1.WebDevAuthPublicService/GetUserInfo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'connect-protocol-version': '1' },
    body: JSON.stringify({ accessToken: result.accessToken }),
    signal: AbortSignal.timeout(10000)
  });
  if (!infoResponse.ok) throw new Error(`OAUTH_USERINFO_${infoResponse.status}`);
  return infoResponse.json();
}

export async function callback(req, res) {
  try {
    assertAuthConfig();
    const code = String(req.query.code || '').trim();
    if (!code) return res.status(400).send('Código de autenticação ausente.');

    const state = decodeState(String(req.query.state || ''));
    const saved = decodeState(String(req.cookies?.[stateCookie] || ''));
    if (!state.nonce || !saved.nonce || state.nonce !== saved.nonce || state.redirectUri !== saved.redirectUri) {
      return res.status(400).send('Sessão de autenticação inválida. Tente novamente.');
    }

    const userInfo = await exchangeCode({ code, redirectUri: saved.redirectUri });
    const email = String(userInfo.email || '').trim().toLowerCase();
    const openId = String(userInfo.openId || userInfo.open_id || '');
    const name = String(userInfo.name || email || 'Administrador').slice(0, 255);

    const bootstrapManager = isAllowedEmail(email);
    const access = email ? await findStaffAccess(email) : null;
    if (!openId || (!bootstrapManager && (!access || !access.active))) {
      return res.status(403).send('Este e-mail não está autorizado a administrar a Gisley Nunes Imóveis.');
    }

    const role = bootstrapManager ? 'manager' : (access?.role === 'manager' ? 'manager' : 'editor');
    if (bootstrapManager) await saveStaffAccess({ email, name, role: 'manager', active: true, invitedBy: 'environment' });
    await upsertAdmin({ openId, email, name });
    const token = await signSession({ openId, email, name, role });

    res.clearCookie(stateCookie, cookieOptions(req, { path: '/api/auth' }));
    res.cookie(sessionCookie, token, cookieOptions(req, { maxAge: 12 * 60 * 60 * 1000 }));
    return res.redirect(303, '/admin');
  } catch (error) {
    console.error('[oauth]', error.message);
    return res.status(400).send('Não foi possível concluir o acesso. Tente novamente.');
  }
}

export function logout(req, res) {
  res.clearCookie(sessionCookie, cookieOptions(req));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
}
