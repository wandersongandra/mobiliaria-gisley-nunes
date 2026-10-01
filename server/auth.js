import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import {
  consumeAuthChallenge,
  createAdminSession,
  createAuthChallenge,
  findActiveAdminSession,
  findAdmin,
  findStaffAccessByOpenId,
  revokeAdminSession,
  saveStaffAccess,
  upsertAdmin
} from './db.js';
import {
  adminOpenIds,
  configuredAdminOrigin,
  hasDatabase,
  isAllowedOpenId,
  oauth,
  sessionSecret
} from './config.js';
import { requestHostOrigin } from './security.js';

const sessionCookie = process.env.NODE_ENV === 'production' ? '__Host-gisley_admin_session' : 'gisley_admin_session';
const stateCookie = process.env.NODE_ENV === 'production' ? '__Host-gisley_oauth_state' : 'gisley_oauth_state';
const sessionIssuer = 'gisley-nunes-imoveis';
const sessionAudience = 'gisley-admin';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function secureCookie(req) {
  const trustCloudflare = process.env.TRUST_PROXY_MODE === 'cloudflare';
  const forwardedProto = trustCloudflare ? String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() : '';
  return process.env.NODE_ENV === 'production' || forwardedProto === 'https' || req.secure;
}

export function cookieOptions(req, extra = {}) {
  return {
    httpOnly: true,
    secure: secureCookie(req),
    sameSite: 'lax',
    path: '/',
    priority: 'high',
    ...extra
  };
}

function validUrl(value, { httpsOnly = false } = {}) {
  try {
    const parsed = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (parsed.username || parsed.password) return false;
    if (httpsOnly && parsed.protocol !== 'https:') return false;
    return true;
  } catch {
    return false;
  }
}

function weakSessionSecret(value) {
  const secret = String(value || '');
  if (Buffer.byteLength(secret, 'utf8') < 32) return true;
  if (/troque-por|change-me|example/i.test(secret)) return true;
  const unique = new Set(secret).size;
  if (unique < 12) return true;
  if (/^(.)\1+$/.test(secret)) return true;
  if (/^(.{1,16})\1+$/.test(secret)) return true;
  return false;
}

function assertAuthConfig() {
  if (!hasDatabase()) throw new Error('AUTH_DATABASE_NOT_CONFIGURED');
  if (!oauth.portalUrl || !oauth.apiUrl || !oauth.projectId) throw new Error('OAUTH_NOT_CONFIGURED');

  const secret = sessionSecret();
  if (weakSessionSecret(secret)) throw new Error('SESSION_SECRET_NOT_CONFIGURED');

  const production = process.env.NODE_ENV === 'production';
  if (!validUrl(oauth.portalUrl, { httpsOnly: production }) || !validUrl(oauth.apiUrl, { httpsOnly: production })) {
    throw new Error('OAUTH_URL_INVALID');
  }

  if (production) {
    const adminOrigin = configuredAdminOrigin();
    if (!adminOrigin || !adminOrigin.startsWith('https://')) throw new Error('ADMIN_ORIGIN_NOT_CONFIGURED');
    const bootstrapOpenIds = adminOpenIds();
    if (bootstrapOpenIds.length === 0) throw new Error('BOOTSTRAP_IDENTITY_NOT_CONFIGURED');
    if (bootstrapOpenIds.some((openId) => openId.length > 191 || !/^\S+$/.test(openId))) {
      throw new Error('BOOTSTRAP_IDENTITY_INVALID');
    }
  }
}

export function assertAuthConfiguration() {
  assertAuthConfig();
  return true;
}

export function hashOAuthState(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

export function safeStateEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export async function createSessionToken({ openId, nowMs = Date.now() }) {
  const secretValue = sessionSecret();
  if (Buffer.byteLength(secretValue, 'utf8') < 32) throw new Error('SESSION_SECRET_NOT_CONFIGURED');

  const jti = randomUUID();
  const expiresAtMs = nowMs + SESSION_TTL_MS;
  const secret = new TextEncoder().encode(secretValue);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(sessionIssuer)
    .setAudience(sessionAudience)
    .setSubject(String(openId))
    .setJti(jti)
    .setIssuedAt(Math.floor(nowMs / 1000))
    .setExpirationTime(Math.floor(expiresAtMs / 1000))
    .sign(secret);

  return { token, jti, expiresAtMs };
}

export async function verifySessionToken(token) {
  const secretValue = sessionSecret();
  if (Buffer.byteLength(secretValue, 'utf8') < 32) return null;

  try {
    const { payload, protectedHeader } = await jwtVerify(token, new TextEncoder().encode(secretValue), {
      algorithms: ['HS256'],
      issuer: sessionIssuer,
      audience: sessionAudience,
      maxTokenAge: '8h',
      clockTolerance: '30s'
    });

    if (protectedHeader.typ !== 'JWT') return null;
    if (!payload.sub || !payload.jti) return null;
    return payload;
  } catch {
    return null;
  }
}

export function resolveAdminAccess({ openId, access }) {
  const normalizedOpenId = String(openId || '').trim();
  const bootstrapManager = isAllowedOpenId(normalizedOpenId);

  if (access?.invited_by === 'environment' && !bootstrapManager) return null;
  if (!bootstrapManager && (!access || !access.active)) return null;
  if (access?.open_id && String(access.open_id) !== normalizedOpenId) return null;

  return {
    role: bootstrapManager ? 'manager' : (access?.role === 'manager' ? 'manager' : 'editor'),
    bootstrapManager
  };
}

export function authCookieNames() {
  return { sessionCookie, stateCookie };
}

export async function currentAdmin(req) {
  const token = req.cookies?.[sessionCookie];
  if (!token || !hasDatabase()) return null;

  const payload = await verifySessionToken(token);
  if (!payload?.sub || !payload?.jti) return null;

  const session = await findActiveAdminSession(String(payload.jti));
  if (!session || String(session.open_id) !== String(payload.sub)) return null;

  const user = await findAdmin(String(payload.sub));
  if (!user) {
    await revokeAdminSession(payload.jti);
    return null;
  }

  const email = String(user.email || '').trim().toLowerCase();
  if (!email || String(session.email || '').trim().toLowerCase() !== email) {
    await revokeAdminSession(payload.jti);
    return null;
  }

  const access = await findStaffAccessByOpenId(String(payload.sub));
  const resolved = resolveAdminAccess({ openId: String(payload.sub), access });
  if (!resolved) {
    await revokeAdminSession(payload.jti);
    return null;
  }

  return { openId: user.open_id, email, name: user.name, role: resolved.role };
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

export async function login(req, res, next) {
  try {
    assertAuthConfig();

    const origin = configuredAdminOrigin() || requestHostOrigin(req);
    if (!origin) return res.status(400).send('Origem inválida.');

    const redirectUri = `${origin}/api/auth/callback`;
    const state = randomBytes(32).toString('base64url');
    const expiresAtMs = Date.now() + OAUTH_STATE_TTL_MS;

    await createAuthChallenge({
      stateHash: hashOAuthState(state),
      redirectUri,
      expiresAtMs
    });

    res.setHeader('Cache-Control', 'no-store');
    res.cookie(stateCookie, state, cookieOptions(req, { maxAge: OAUTH_STATE_TTL_MS, path: '/' }));

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
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');

  try {
    assertAuthConfig();

    const code = String(req.query.code || '').trim();
    const state = String(req.query.state || '').trim();
    const savedState = String(req.cookies?.[stateCookie] || '');

    res.clearCookie(stateCookie, cookieOptions(req, { path: '/' }));

    if (!code || code.length > 4096) return res.status(400).send('Código de autenticação ausente ou inválido.');
    if (state.length !== 43 || savedState.length !== 43 || !safeStateEqual(state, savedState)) {
      return res.status(400).send('Sessão de autenticação inválida. Tente novamente.');
    }

    const challenge = await consumeAuthChallenge(hashOAuthState(state));
    if (!challenge) return res.status(400).send('Sessão de autenticação expirada ou já utilizada.');

    const expectedOrigin = configuredAdminOrigin() || requestHostOrigin(req);
    const expectedRedirectUri = expectedOrigin ? `${expectedOrigin}/api/auth/callback` : '';
    if (!expectedRedirectUri || challenge.redirectUri !== expectedRedirectUri) {
      return res.status(400).send('Origem de autenticação inválida.');
    }

    const userInfo = await exchangeCode({ code, redirectUri: challenge.redirectUri });
    const email = String(userInfo.email || '').trim().toLowerCase();
    const openId = String(userInfo.openId || userInfo.open_id || '').trim();
    const name = String(userInfo.name || email || 'Administrador').trim().slice(0, 255);
    if (
      email.length > 255
      || openId.length === 0
      || openId.length > 191
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(403).send('Identidade inválida para acesso administrativo.');
    }

    const bootstrapManager = isAllowedOpenId(openId);
    const access = await findStaffAccessByOpenId(openId);
    if (!bootstrapManager && (!access || !access.active)) {
      return res.status(403)
        .type('text/plain; charset=utf-8')
        .send(
          'Acesso administrativo ainda não liberado.\n\n'
          + `Código de identidade OAuth: ${openId}\n\n`
          + 'Envie este código ao gestor para vincular seu acesso.'
        );
    }

    const role = bootstrapManager ? 'manager' : (access?.role === 'manager' ? 'manager' : 'editor');
    if (bootstrapManager) {
      await saveStaffAccess({ email, openId, name, role: 'manager', active: true, invitedBy: 'environment' });
    }

    await upsertAdmin({ openId, email, name });

    const previousToken = req.cookies?.[sessionCookie];
    if (previousToken) {
      const previousPayload = await verifySessionToken(previousToken);
      if (previousPayload?.jti) await revokeAdminSession(previousPayload.jti);
    }

    const issued = await createSessionToken({ openId });
    await createAdminSession({
      jti: issued.jti,
      openId,
      email,
      expiresAtMs: issued.expiresAtMs
    });

    res.setHeader('Cache-Control', 'no-store');
    res.cookie(sessionCookie, issued.token, cookieOptions(req, { maxAge: SESSION_TTL_MS, path: '/' }));
    return res.redirect(303, configuredAdminOrigin() ? `${configuredAdminOrigin()}/admin` : '/admin');
  } catch (error) {
    console.error('[oauth]', error.message);
    return res.status(400).send('Não foi possível concluir o acesso. Tente novamente.');
  }
}

export async function logout(req, res) {
  const token = req.cookies?.[sessionCookie];
  let revoked = true;

  if (token && hasDatabase()) {
    try {
      const payload = await verifySessionToken(token);
      if (payload?.jti) await revokeAdminSession(payload.jti);
    } catch {
      revoked = false;
    }
  }

  res.setHeader('Cache-Control', 'no-store');

  if (!revoked) {
    return res.status(503).json({ ok: false, error: 'SESSION_REVOCATION_FAILED' });
  }

  res.clearCookie(sessionCookie, cookieOptions(req, { path: '/' }));
  return res.json({ ok: true });
}
