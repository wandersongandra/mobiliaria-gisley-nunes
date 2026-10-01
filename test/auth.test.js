import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authCookieNames,
  cookieOptions,
  createSessionToken,
  hashOAuthState,
  hashPairingCode,
  requireManager,
  resolveAdminAccess,
  safeStateEqual,
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
