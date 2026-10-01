import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { decodeJwt, SignJWT } from 'jose';
import {
  authCookieNames,
  createSessionToken,
  hashOAuthState,
  resolveAdminAccess,
  safeStateEqual,
  verifySessionToken
} from '../server/auth.js';

const strongSecret = 'A9!gisley-session-secret-'.padEnd(64, 'x');

test('JWT administrativo carrega apenas identificadores técnicos', async () => {
  const previous = process.env.GISELY_SESSION_SECRET;
  process.env.GISELY_SESSION_SECRET = strongSecret;

  try {
    const issued = await createSessionToken({ openId: 'oauth-user-123', nowMs: Date.now() });
    const decoded = decodeJwt(issued.token);

    assert.equal(decoded.sub, 'oauth-user-123');
    assert.equal(decoded.jti, issued.jti);
    assert.equal(decoded.iss, 'gisley-nunes-imoveis');
    assert.equal(decoded.aud, 'gisley-admin');
    assert.equal(Object.hasOwn(decoded, 'email'), false);
    assert.equal(Object.hasOwn(decoded, 'name'), false);
    assert.equal(Object.hasOwn(decoded, 'role'), false);

    const verified = await verifySessionToken(issued.token);
    assert.equal(verified?.sub, 'oauth-user-123');
    assert.equal(verified?.jti, issued.jti);
  } finally {
    if (previous === undefined) delete process.env.GISELY_SESSION_SECRET;
    else process.env.GISELY_SESSION_SECRET = previous;
  }
});

test('JWT adulterado ou expirado é rejeitado', async () => {
  const previous = process.env.GISELY_SESSION_SECRET;
  process.env.GISELY_SESSION_SECRET = strongSecret;

  try {
    const issued = await createSessionToken({ openId: 'oauth-user-123' });
    const [header, payload, signature] = issued.token.split('.');
    const first = signature[0];
    const tamperedSignature = (first === 'a' ? 'b' : 'a') + signature.slice(1);
    const tampered = `${header}.${payload}.${tamperedSignature}`;
    assert.equal(await verifySessionToken(tampered), null);

    const expired = await createSessionToken({
      openId: 'oauth-user-123',
      nowMs: Date.now() - 9 * 60 * 60 * 1000
    });
    assert.equal(await verifySessionToken(expired.token), null);
  } finally {
    if (previous === undefined) delete process.env.GISELY_SESSION_SECRET;
    else process.env.GISELY_SESSION_SECRET = previous;
  }
});

test('JWT com idade absoluta maior que oito horas é rejeitado mesmo com expiração futura', async () => {
  const previous = process.env.GISELY_SESSION_SECRET;
  process.env.GISELY_SESSION_SECRET = strongSecret;

  try {
    const now = Math.floor(Date.now() / 1000);
    const secret = new TextEncoder().encode(strongSecret);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('gisley-nunes-imoveis')
      .setAudience('gisley-admin')
      .setSubject('oauth-user-123')
      .setJti('22222222-2222-4222-8222-222222222222')
      .setIssuedAt(now - (9 * 60 * 60))
      .setExpirationTime(now + 60 * 60)
      .sign(secret);

    assert.equal(await verifySessionToken(token), null);
  } finally {
    if (previous === undefined) delete process.env.GISELY_SESSION_SECRET;
    else process.env.GISELY_SESSION_SECRET = previous;
  }
});

test('JWT com audiência antiga ou diferente é rejeitado', async () => {
  const previous = process.env.GISELY_SESSION_SECRET;
  process.env.GISELY_SESSION_SECRET = strongSecret;

  try {
    const secret = new TextEncoder().encode(strongSecret);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('gisley-nunes-imoveis')
      .setAudience('morada-admin')
      .setSubject('oauth-user-123')
      .setJti('11111111-1111-4111-8111-111111111111')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret);

    assert.equal(await verifySessionToken(token), null);
  } finally {
    if (previous === undefined) delete process.env.GISELY_SESSION_SECRET;
    else process.env.GISELY_SESSION_SECRET = previous;
  }
});

test('state OAuth usa hash estável e comparação segura', () => {
  const state = 'abc123-_';
  assert.equal(hashOAuthState(state).length, 64);
  assert.equal(hashOAuthState(state), hashOAuthState(state));
  assert.equal(safeStateEqual(state, state), true);
  assert.equal(safeStateEqual(state, 'abc123-x'), false);
  assert.equal(safeStateEqual('', ''), false);
  assert.equal(safeStateEqual('curto', 'muito-maior'), false);
});

function authConfigResult(envOverrides) {
  const script = `
    const auth = await import('./server/auth.js');
    try {
      auth.assertAuthConfiguration();
      process.stdout.write('OK');
    } catch (error) {
      process.stdout.write(String(error.message));
    }
  `;

  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL: 'mysql://user:pass@db:3306/gisley',
      ADMIN_ORIGIN: 'https://painel.gisley.test',
      GISELY_SESSION_SECRET: strongSecret,
      GISELY_ADMIN_OPEN_IDS: 'owner-open-id',
      MANUS_OAUTH_PORTAL_URL: 'https://oauth.example.test',
      MANUS_OAUTH_API_URL: 'https://oauth-api.example.test',
      MANUS_PROJECT_ID: 'project-test',
      ...envOverrides
    },
    encoding: 'utf8'
  });
}

test('produção exige configuração de autenticação fechada e HTTPS', () => {
  assert.equal(authConfigResult({}), 'OK');
  assert.equal(authConfigResult({ DATABASE_URL: '' }), 'AUTH_DATABASE_NOT_CONFIGURED');
  assert.equal(authConfigResult({ ADMIN_ORIGIN: 'http://painel.gisley.test' }), 'ADMIN_ORIGIN_NOT_CONFIGURED');
  assert.equal(authConfigResult({ GISELY_ADMIN_OPEN_IDS: '' }), 'BOOTSTRAP_IDENTITY_NOT_CONFIGURED');
  assert.equal(authConfigResult({ GISELY_ADMIN_OPEN_IDS: 'id com espaco' }), 'BOOTSTRAP_IDENTITY_INVALID');
  assert.equal(authConfigResult({ MANUS_OAUTH_API_URL: 'http://oauth-api.example.test' }), 'OAUTH_URL_INVALID');
  assert.equal(authConfigResult({ GISELY_SESSION_SECRET: 'troque-por-um-segredo' }), 'SESSION_SECRET_NOT_CONFIGURED');
  assert.equal(authConfigResult({ GISELY_SESSION_SECRET: 'a'.repeat(64) }), 'SESSION_SECRET_NOT_CONFIGURED');
  assert.equal(authConfigResult({ MANUS_OAUTH_PORTAL_URL: 'https://user:pass@oauth.example.test' }), 'OAUTH_URL_INVALID');
});


test('JWT assinado com secret antigo é invalidado após rotação', async () => {
  const previous = process.env.GISELY_SESSION_SECRET;
  process.env.GISELY_SESSION_SECRET = strongSecret;

  try {
    const issued = await createSessionToken({ openId: 'oauth-user-rotation' });
    process.env.GISELY_SESSION_SECRET = 'B7!rotated-session-secret-'.padEnd(64, 'z');
    assert.equal(await verifySessionToken(issued.token), null);
  } finally {
    if (previous === undefined) delete process.env.GISELY_SESSION_SECRET;
    else process.env.GISELY_SESSION_SECRET = previous;
  }
});

test('JWT com issuer ou typ incorretos é rejeitado', async () => {
  const previous = process.env.GISELY_SESSION_SECRET;
  process.env.GISELY_SESSION_SECRET = strongSecret;

  try {
    const secret = new TextEncoder().encode(strongSecret);

    const wrongIssuer = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('outro-sistema')
      .setAudience('gisley-admin')
      .setSubject('oauth-user-123')
      .setJti('33333333-3333-4333-8333-333333333333')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret);

    const wrongType = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'NOTJWT' })
      .setIssuer('gisley-nunes-imoveis')
      .setAudience('gisley-admin')
      .setSubject('oauth-user-123')
      .setJti('44444444-4444-4444-8444-444444444444')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret);

    assert.equal(await verifySessionToken(wrongIssuer), null);
    assert.equal(await verifySessionToken(wrongType), null);
  } finally {
    if (previous === undefined) delete process.env.GISELY_SESSION_SECRET;
    else process.env.GISELY_SESSION_SECRET = previous;
  }
});

test('limite de sessões administrativas é sempre restringido entre 1 e 10', async () => {
  const { maxAdminSessions } = await import('../server/config.js');
  const previous = process.env.GISELY_MAX_ADMIN_SESSIONS;

  try {
    process.env.GISELY_MAX_ADMIN_SESSIONS = '0';
    assert.equal(maxAdminSessions(), 1);

    process.env.GISELY_MAX_ADMIN_SESSIONS = '5';
    assert.equal(maxAdminSessions(), 5);

    process.env.GISELY_MAX_ADMIN_SESSIONS = '99';
    assert.equal(maxAdminSessions(), 10);

    process.env.GISELY_MAX_ADMIN_SESSIONS = 'abc';
    assert.equal(maxAdminSessions(), 5);
  } finally {
    if (previous === undefined) delete process.env.GISELY_MAX_ADMIN_SESSIONS;
    else process.env.GISELY_MAX_ADMIN_SESSIONS = previous;
  }
});


test('acesso bootstrap removido do ambiente é revogado imediatamente', () => {
  const previous = process.env.GISELY_ADMIN_OPEN_IDS;
  process.env.GISELY_ADMIN_OPEN_IDS = 'owner-open-id';

  try {
    assert.deepEqual(
      resolveAdminAccess({
        openId: 'owner-open-id',
        access: { open_id: 'owner-open-id', role: 'manager', active: 1, invited_by: 'environment' }
      }),
      { role: 'manager', bootstrapManager: true }
    );

    process.env.GISELY_ADMIN_OPEN_IDS = '';
    assert.equal(
      resolveAdminAccess({
        openId: 'owner-open-id',
        access: { open_id: 'owner-open-id', role: 'manager', active: 1, invited_by: 'environment' }
      }),
      null
    );
  } finally {
    if (previous === undefined) delete process.env.GISELY_ADMIN_OPEN_IDS;
    else process.env.GISELY_ADMIN_OPEN_IDS = previous;
  }
});

test('editor ativo permanece editor e acesso inativo é negado', () => {
  const previous = process.env.GISELY_ADMIN_OPEN_IDS;
  process.env.GISELY_ADMIN_OPEN_IDS = 'owner-open-id';

  try {
    assert.deepEqual(
      resolveAdminAccess({
        openId: 'editor-open-id',
        access: { open_id: 'editor-open-id', role: 'editor', active: 1, invited_by: 'owner@gisley.test' }
      }),
      { role: 'editor', bootstrapManager: false }
    );

    assert.equal(
      resolveAdminAccess({
        openId: 'editor-open-id',
        access: { open_id: 'editor-open-id', role: 'editor', active: 0, invited_by: 'owner@gisley.test' }
      }),
      null
    );
  } finally {
    if (previous === undefined) delete process.env.GISELY_ADMIN_OPEN_IDS;
    else process.env.GISELY_ADMIN_OPEN_IDS = previous;
  }
});

test('produção usa cookies host-only com prefixo __Host', () => {
  const names = authCookieNames();
  if (process.env.NODE_ENV === 'production') {
    assert.match(names.sessionCookie, /^__Host-/);
    assert.match(names.stateCookie, /^__Host-/);
  } else {
    assert.equal(names.sessionCookie, 'gisley_admin_session');
    assert.equal(names.stateCookie, 'gisley_oauth_state');
  }
});


test('idle timeout administrativo é limitado entre 15 e 240 minutos', async () => {
  const { sessionIdleTimeoutMs } = await import('../server/config.js');
  const previous = process.env.GISELY_ADMIN_IDLE_TIMEOUT_MINUTES;

  try {
    process.env.GISELY_ADMIN_IDLE_TIMEOUT_MINUTES = '1';
    assert.equal(sessionIdleTimeoutMs(), 15 * 60 * 1000);

    process.env.GISELY_ADMIN_IDLE_TIMEOUT_MINUTES = '60';
    assert.equal(sessionIdleTimeoutMs(), 60 * 60 * 1000);

    process.env.GISELY_ADMIN_IDLE_TIMEOUT_MINUTES = '999';
    assert.equal(sessionIdleTimeoutMs(), 240 * 60 * 1000);

    process.env.GISELY_ADMIN_IDLE_TIMEOUT_MINUTES = 'abc';
    assert.equal(sessionIdleTimeoutMs(), 60 * 60 * 1000);
  } finally {
    if (previous === undefined) delete process.env.GISELY_ADMIN_IDLE_TIMEOUT_MINUTES;
    else process.env.GISELY_ADMIN_IDLE_TIMEOUT_MINUTES = previous;
  }
});

test('produção nomeia cookies de sessão e OAuth com prefixo __Host', () => {
  const script = `
    const auth = await import('./server/auth.js');
    process.stdout.write(JSON.stringify(auth.authCookieNames()));
  `;

  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'production' },
    encoding: 'utf8'
  });

  assert.deepEqual(JSON.parse(output), {
    sessionCookie: '__Host-gisley_admin_session',
    stateCookie: '__Host-gisley_oauth_state'
  });
});
