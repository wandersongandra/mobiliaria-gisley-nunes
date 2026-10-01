import { SignJWT } from 'jose';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authCookieNames,
  cookieOptions,
  createSessionToken,
  hashOAuthState,
  hashPairingCode,
  normalizeOAuthIdentity,
  requireManager,
  resolveAdminAccess,
  resolveSessionIdentity,
  safeStateEqual,
  validSessionClaims,
  verifySessionToken
} from '../server/auth.js';

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    cleared: [],
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this; },
    clearCookie(name, options) { this.cleared.push({ name, options }); return this; }
  };
}

test('requireManager permite gestor', () => {
  const req = { admin: { role: 'manager' } };
  const res = createResponse();
  let called = false;
  requireManager()(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('requireManager bloqueia corretor/editor', () => {
  const req = { admin: { role: 'editor' } };
  const res = createResponse();
  let called = false;
  requireManager()(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'MANAGER_REQUIRED' });
});

test('state OAuth usa hash estável e comparação em tempo constante', () => {
  const a = 'a'.repeat(43);
  const b = 'b'.repeat(43);
  assert.equal(hashOAuthState(a).length, 64);
  assert.equal(hashOAuthState(a), hashOAuthState(a));
  assert.notEqual(hashOAuthState(a), hashOAuthState(b));
  assert.equal(safeStateEqual(a, a), true);
  assert.equal(safeStateEqual(a, b), false);
  assert.equal(safeStateEqual(a, ''), false);
  assert.equal(safeStateEqual(a, a + 'x'), false);

  const pairing = 'AbCdEfGhIjKlMnOp';
  assert.equal(hashPairingCode(pairing).length, 64);
  assert.equal(hashPairingCode(pairing), hashPairingCode(pairing));
  assert.notEqual(hashPairingCode(pairing), hashPairingCode(pairing + 'x'));
});

test('JWT administrativo aceita token íntegro e rejeita adulteração/expiração', async () => {
  const previous = process.env.GISELY_SESSION_SECRET;
  process.env.GISELY_SESSION_SECRET = 'x9N#4qLm7!P2vR8@cT5$wY1&kD6*eF3zH0+uJ9sB';

  try {
    const now = Date.now();
    const issued = await createSessionToken({ openId: 'oauth-user-123', nowMs: now });
    const payload = await verifySessionToken(issued.token);
    assert.equal(payload?.sub, 'oauth-user-123');
    assert.equal(payload?.jti, issued.jti);

    const parts = issued.token.split('.');
    const last = parts[2];
    parts[2] = last.slice(0, -1) + (last.endsWith('a') ? 'b' : 'a');
    assert.equal(await verifySessionToken(parts.join('.')), null);

    const expired = await createSessionToken({
      openId: 'oauth-user-123',
      nowMs: now - (9 * 60 * 60 * 1000)
    });
    assert.equal(await verifySessionToken(expired.token), null);
  } finally {
    if (previous === undefined) delete process.env.GISELY_SESSION_SECRET;
    else process.env.GISELY_SESSION_SECRET = previous;
  }
});

test('resolveAdminAccess é vinculado ao OpenID e revalida email para não-bootstrap', () => {
  const previous = process.env.GISELY_ADMIN_OPEN_IDS;
  process.env.GISELY_ADMIN_OPEN_IDS = 'bootstrap-open-id';

  try {
    assert.deepEqual(
      resolveAdminAccess({
        openId: 'bootstrap-open-id',
        email: 'novo@email.com',
        access: { invited_by: 'environment', open_id: 'bootstrap-open-id', email: 'antigo@email.com', active: 1, role: 'editor' }
      }),
      { role: 'manager', bootstrapManager: true }
    );

    assert.deepEqual(
      resolveAdminAccess({
        openId: 'editor-open-id',
        email: 'editor@email.com',
        access: { invited_by: 'gestor@email.com', open_id: 'editor-open-id', email: 'editor@email.com', active: 1, role: 'editor' }
      }),
      { role: 'editor', bootstrapManager: false }
    );

    assert.equal(
      resolveAdminAccess({
        openId: 'editor-open-id',
        email: 'outro@email.com',
        access: { invited_by: 'gestor@email.com', open_id: 'editor-open-id', email: 'editor@email.com', active: 1, role: 'editor' }
      }),
      null
    );

    assert.equal(
      resolveAdminAccess({
        openId: 'wrong-open-id',
        email: 'editor@email.com',
        access: { invited_by: 'gestor@email.com', open_id: 'editor-open-id', email: 'editor@email.com', active: 1, role: 'editor' }
      }),
      null
    );
  } finally {
    if (previous === undefined) delete process.env.GISELY_ADMIN_OPEN_IDS;
    else process.env.GISELY_ADMIN_OPEN_IDS = previous;
  }
});

test('cookies administrativos mantêm flags seguras esperadas', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousProxy = process.env.TRUST_PROXY_MODE;
  process.env.NODE_ENV = 'test';
  process.env.TRUST_PROXY_MODE = 'cloudflare';

  try {
    const req = { secure: false, headers: { 'x-forwarded-proto': 'https' } };
    const options = cookieOptions(req);
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, 'strict');
    assert.equal(options.path, '/');
    assert.equal(options.priority, 'high');

    const names = authCookieNames();
    assert.match(names.sessionCookie, /gisley_admin_session$/);
    assert.match(names.stateCookie, /gisley_oauth_state$/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousProxy === undefined) delete process.env.TRUST_PROXY_MODE;
    else process.env.TRUST_PROXY_MODE = previousProxy;
  }
});


test('produção usa prefixo __Host nos cookies administrativos', async () => {
  const { execFileSync } = await import('node:child_process');
  const script = [
    "process.env.NODE_ENV='production';",
    "const m=await import('./server/auth.js');",
    "process.stdout.write(JSON.stringify(m.authCookieNames()));"
  ].join('');
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  const names = JSON.parse(output);
  assert.equal(names.sessionCookie, '__Host-gisley_admin_session');
  assert.equal(names.stateCookie, '__Host-gisley_oauth_state');
});


test('claims administrativas rejeitam identidade, jti e janelas temporais inválidas', () => {
  const now = Date.now();
  const nowSec = Math.floor(now / 1000);
  const good = {
    sub: 'oauth-user-123',
    jti: '123e4567-e89b-42d3-a456-426614174000',
    iat: nowSec,
    exp: nowSec + (8 * 60 * 60)
  };

  assert.equal(validSessionClaims(good, now), true);
  assert.equal(validSessionClaims({ ...good, sub: '' }, now), false);
  assert.equal(validSessionClaims({ ...good, sub: 'x'.repeat(192) }, now), false);
  assert.equal(validSessionClaims({ ...good, sub: 'open id' }, now), false);
  assert.equal(validSessionClaims({ ...good, jti: 'not-a-uuid' }, now), false);
  assert.equal(validSessionClaims({ ...good, iat: nowSec + 120 }, now), false);
  assert.equal(validSessionClaims({ ...good, exp: nowSec - 1 }, now), false);
  assert.equal(validSessionClaims({ ...good, exp: nowSec + (9 * 60 * 60) }, now), false);
});

test('verificação JWT rejeita formatos absurdos antes da criptografia', async () => {
  const previous = process.env.GISELY_SESSION_SECRET;
  process.env.GISELY_SESSION_SECRET = 'x9N#4qLm7!P2vR8@cT5$wY1&kD6*eF3zH0+uJ9sB';

  try {
    assert.equal(await verifySessionToken(''), null);
    assert.equal(await verifySessionToken('a.b'), null);
    assert.equal(await verifySessionToken('x'.repeat(5000)), null);
    assert.equal(await verifySessionToken(null), null);
  } finally {
    if (previous === undefined) delete process.env.GISELY_SESSION_SECRET;
    else process.env.GISELY_SESSION_SECRET = previous;
  }
});


test('JWT administrativo rejeita issuer, audience e typ incorretos', async () => {
  const previous = process.env.GISELY_SESSION_SECRET;
  process.env.GISELY_SESSION_SECRET = 'x9N#4qLm7!P2vR8@cT5$wY1&kD6*eF3zH0+uJ9sB';
  const secret = new TextEncoder().encode(process.env.GISELY_SESSION_SECRET);
  const now = Math.floor(Date.now() / 1000);
  const base = () => new SignJWT({})
    .setSubject('oauth-user-123')
    .setJti('123e4567-e89b-42d3-a456-426614174000')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600);

  try {
    const wrongIssuer = await base()
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('outro-sistema')
      .setAudience('gisley-admin')
      .sign(secret);
    assert.equal(await verifySessionToken(wrongIssuer), null);

    const wrongAudience = await base()
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('gisley-nunes-imoveis')
      .setAudience('outro-painel')
      .sign(secret);
    assert.equal(await verifySessionToken(wrongAudience), null);

    const wrongTyp = await base()
      .setProtectedHeader({ alg: 'HS256', typ: 'NOT-JWT' })
      .setIssuer('gisley-nunes-imoveis')
      .setAudience('gisley-admin')
      .sign(secret);
    assert.equal(await verifySessionToken(wrongTyp), null);
  } finally {
    if (previous === undefined) delete process.env.GISELY_SESSION_SECRET;
    else process.env.GISELY_SESSION_SECRET = previous;
  }
});

test('JWT administrativo rejeita claim temporal futura e janela excessiva', async () => {
  const previous = process.env.GISELY_SESSION_SECRET;
  process.env.GISELY_SESSION_SECRET = 'x9N#4qLm7!P2vR8@cT5$wY1&kD6*eF3zH0+uJ9sB';
  const secret = new TextEncoder().encode(process.env.GISELY_SESSION_SECRET);
  const now = Math.floor(Date.now() / 1000);

  try {
    const futureIssued = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('gisley-nunes-imoveis')
      .setAudience('gisley-admin')
      .setSubject('oauth-user-123')
      .setJti('123e4567-e89b-42d3-a456-426614174000')
      .setIssuedAt(now + 120)
      .setExpirationTime(now + 3600)
      .sign(secret);
    assert.equal(await verifySessionToken(futureIssued), null);

    const tooLong = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('gisley-nunes-imoveis')
      .setAudience('gisley-admin')
      .setSubject('oauth-user-123')
      .setJti('123e4567-e89b-42d3-a456-426614174000')
      .setIssuedAt(now)
      .setExpirationTime(now + (9 * 60 * 60))
      .sign(secret);
    assert.equal(await verifySessionToken(tooLong), null);
  } finally {
    if (previous === undefined) delete process.env.GISELY_SESSION_SECRET;
    else process.env.GISELY_SESSION_SECRET = previous;
  }
});

test('segredo administrativo fraco nunca emite sessão', async () => {
  const previous = process.env.GISELY_SESSION_SECRET;
  process.env.GISELY_SESSION_SECRET = 'change-me';
  try {
    await assert.rejects(
      () => createSessionToken({ openId: 'oauth-user-123' }),
      /SESSION_SECRET_NOT_CONFIGURED/
    );
  } finally {
    if (previous === undefined) delete process.env.GISELY_SESSION_SECRET;
    else process.env.GISELY_SESSION_SECRET = previous;
  }
});


test('cookie OAuth permite retorno top-level sem afrouxar flags essenciais', () => {
  const req = { secure: true, headers: {} };
  const options = cookieOptions(req, { sameSite: 'lax', maxAge: 10 * 60 * 1000 });
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, 'lax');
  assert.equal(options.path, '/');
  assert.equal(options.priority, 'high');
  assert.equal(options.maxAge, 10 * 60 * 1000);
});


test('normalizeOAuthIdentity rejeita identidade OAuth inconsistente', () => {
  assert.deepEqual(
    normalizeOAuthIdentity({
      email: ' Gestor@Example.com ',
      openId: 'oauth-user-123',
      name: 'Gestor',
      emailVerified: true
    }),
    { email: 'gestor@example.com', openId: 'oauth-user-123', name: 'Gestor' }
  );

  assert.equal(normalizeOAuthIdentity({ email: 'gestor@example.com', openId: '', emailVerified: true }), null);
  assert.equal(normalizeOAuthIdentity({ email: 'gestor@example.com', openId: 'open id', emailVerified: true }), null);
  assert.equal(normalizeOAuthIdentity({ email: 'gestor@example.com', openId: 'open\ncontrol', emailVerified: true }), null);
  assert.equal(normalizeOAuthIdentity({ email: 'email-invalido', openId: 'oauth-user-123', emailVerified: true }), null);
  assert.equal(normalizeOAuthIdentity({ email: 'gestor@example.com', openId: 'oauth-user-123', emailVerified: false }), null);

  const providerWithoutVerificationClaim = normalizeOAuthIdentity({
    email: 'gestor@example.com',
    openId: 'oauth-user-123'
  });
  assert.equal(providerWithoutVerificationClaim?.openId, 'oauth-user-123');
});

test('resolveSessionIdentity exige vínculo completo entre JWT sessão usuário e acesso', () => {
  const payload = { sub: 'open-123', jti: '123e4567-e89b-42d3-a456-426614174000' };
  const session = {
    jti: payload.jti,
    open_id: payload.sub,
    email: 'editor@example.com'
  };
  const user = {
    open_id: payload.sub,
    email: 'editor@example.com',
    name: 'Editor'
  };
  const access = {
    invited_by: 'gestor@example.com',
    open_id: payload.sub,
    email: 'editor@example.com',
    active: 1,
    role: 'editor'
  };

  assert.deepEqual(
    resolveSessionIdentity({ payload, session, user, access }),
    { openId: 'open-123', email: 'editor@example.com', name: 'Editor', role: 'editor' }
  );

  assert.equal(resolveSessionIdentity({
    payload,
    session: { ...session, jti: '223e4567-e89b-42d3-a456-426614174000' },
    user,
    access
  }), null);

  assert.equal(resolveSessionIdentity({
    payload,
    session: { ...session, open_id: 'outro-open-id' },
    user,
    access
  }), null);

  assert.equal(resolveSessionIdentity({
    payload,
    session,
    user: { ...user, email: 'alterado@example.com' },
    access
  }), null);

  assert.equal(resolveSessionIdentity({
    payload,
    session,
    user,
    access: { ...access, active: 0 }
  }), null);

  assert.equal(resolveSessionIdentity({
    payload,
    session,
    user,
    access: { ...access, open_id: 'outro-open-id' }
  }), null);
});
