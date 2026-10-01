import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { decodeJwt, SignJWT } from 'jose';
import {
  createSessionToken,
  hashOAuthState,
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
    const last = issued.token.at(-1);
    const tampered = issued.token.slice(0, -1) + (last === 'a' ? 'b' : 'a');
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
  assert.equal(authConfigResult({ MANUS_OAUTH_API_URL: 'http://oauth-api.example.test' }), 'OAUTH_URL_INVALID');
  assert.equal(authConfigResult({ GISELY_SESSION_SECRET: 'troque-por-um-segredo' }), 'SESSION_SECRET_NOT_CONFIGURED');
  assert.equal(authConfigResult({ MANUS_OAUTH_PORTAL_URL: 'https://user:pass@oauth.example.test' }), 'OAUTH_URL_INVALID');
});
