import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { findAdmin, upsertAdmin } from './db.js';
import { hasDatabase, isAllowedEmail, oauth, sessionSecret } from './config.js';

const sessionCookie = 'webdev_app_session';
const stateCookie = 'morada_oauth_state';

function secureCookie(req) {
  return process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https' || req.secure;
}

function cookieOptions(req, extra = {}) {
  const secure = secureCookie(req);
  return { httpOnly: true, secure, sameSite: secure ? 'none' : 'lax', path: '/', ...extra };
}

function originFromRequest(req) {
  const requested = String(req.query.origin || '').trim();
  if (/^https?:\/\/localhost(?::\d+)?$/i.test(requested) || /^https:\/\/[a-z0-9.-]+\.manus\.computer$/i.test(requested)) return requested;
  const forwarded = req.headers['x-forwarded-proto'] ? `${req.headers['x-forwarded-proto']}://${req.headers.host}` : `${req.protocol}://${req.get('host')}`;
  return forwarded;
}

function encodeState(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeState(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function signSession(user) {
  const secret = new TextEncoder().encode(sessionSecret());
  if (!secret.length) throw new Error('SESSION_SECRET_NOT_CONFIGURED');
  return new SignJWT({ openId: user.openId, email: user.email, name: user.name, role: 'admin', appId: oauth.projectId })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret);
}

async function verifySessionToken(token) {
  if (sessionSecret()) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(sessionSecret()), { algorithms: ['HS256'] });
      if (payload.role === 'admin' && payload.openId) return payload;
    } catch {}
  }
  if (oauth.jwtSecret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(oauth.jwtSecret), { algorithms: ['HS256'] });
      const appId = payload.appId || payload.app_id || payload.clientId;
      if (payload.exp && Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
      if (oauth.projectId && appId && appId !== oauth.projectId) return null;
      const openId = payload.openId || payload.open_id || payload.sub;
      if (openId) return { ...payload, openId };
    } catch {}
  }
  return null;
}

export async function currentAdmin(req) {
  const token = req.cookies?.[sessionCookie];
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload?.openId || !hasDatabase()) return null;
  const user = await findAdmin(String(payload.openId));
  if (!user) return null;
  return { openId: user.open_id, email: user.email, name: user.name, role: 'admin' };
}

export function requireAdmin() {
  return async (req, res, next) => {
    try {
      const user = await currentAdmin(req);
      if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED', login: true });
      req.admin = user;
      next();
    } catch (error) { next(error); }
  };
}

export function login(req, res) {
  const origin = originFromRequest(req);
  const redirectUri = `${origin}/api/auth/callback`;
  const nonce = randomUUID();
  res.cookie(stateCookie, encodeState({ nonce, redirectUri }), cookieOptions(req, { maxAge: 10 * 60 * 1000 }));
  const state = encodeState({ redirectUri, nonce });
  const url = new URL(`${oauth.portalUrl}/app-auth`);
  url.searchParams.set('appId', oauth.projectId);
  url.searchParams.set('redirectUri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('responseType', 'code');
  res.redirect(url.toString());
}

async function exchangeCode({ code, redirectUri }) {
  const response = await fetch(`${oauth.apiUrl}/webdev.v1.WebDevAuthPublicService/ExchangeToken`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'connect-protocol-version': '1' }, body: JSON.stringify({ clientId: oauth.projectId, grantType: 'authorization_code', code, redirectUri }) });
  if (!response.ok) throw new Error(`OAUTH_EXCHANGE_${response.status}`);
  const result = await response.json();
  if (!result.accessToken) throw new Error('OAUTH_ACCESS_TOKEN_MISSING');
  const infoResponse = await fetch(`${oauth.apiUrl}/webdev.v1.WebDevAuthPublicService/GetUserInfo`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'connect-protocol-version': '1' }, body: JSON.stringify({ accessToken: result.accessToken }) });
  if (!infoResponse.ok) throw new Error(`OAUTH_USERINFO_${infoResponse.status}`);
  return infoResponse.json();
}

export async function callback(req, res) {
  try {
    const state = decodeState(String(req.query.state || ''));
    const saved = decodeState(String(req.cookies?.[stateCookie] || ''));
    if (!state.nonce || !saved.nonce || state.nonce !== saved.nonce || state.redirectUri !== saved.redirectUri) return res.status(400).send('Sessão de autenticação inválida. Tente novamente.');
    const userInfo = await exchangeCode({ code: String(req.query.code || ''), redirectUri: saved.redirectUri });
    const email = String(userInfo.email || '').trim().toLowerCase();
    const openId = String(userInfo.openId || userInfo.open_id || '');
    const name = String(userInfo.name || email || 'Administrador');
    if (!openId || !isAllowedEmail(email)) return res.status(403).send('Este e-mail não está autorizado a administrar a Gisley Nunes Imóveis.');
    await upsertAdmin({ openId, email, name });
    const token = await signSession({ openId, email, name });
    res.clearCookie(stateCookie, cookieOptions(req));
    res.cookie(sessionCookie, token, cookieOptions(req, { maxAge: 7 * 24 * 60 * 60 * 1000 }));
    res.redirect('/admin');
  } catch (error) {
    console.error('[oauth]', error.message);
    res.status(400).send('Não foi possível concluir o acesso. Tente novamente.');
  }
}

export function logout(req, res) {
  res.clearCookie(sessionCookie, cookieOptions(req));
  res.json({ ok: true });
}