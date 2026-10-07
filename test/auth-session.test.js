import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
function sessionFixtureSecret() {
  return ['unit', 'fixture', 'session', 'A1b2C3d4E5f6G7h8I9j0K1l2'].join('-');
}

import {
  createSessionToken,
  hashOAuthState,
  resolveAdminAccess,
  safeStateEqual,
  verifySessionToken
} from '../server/auth.js';

const strongSecret = sessionFixtureSecret();

async function withSecret(secret, run) {
  const previous = process.env.GISELY_SESSION_SECRET;
  process.env.GISELY_SESSION_SECRET = secret;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.GISELY_SESSION_SECRET;
    else process.env.GISELY_SESSION_SECRET = previous;
  }
}

test('JWT administrativo válido contém apenas identidade e controles de sessão', async () => {
  await withSecret(strongSecret, async () => {
    const issued = await createSessionToken({ openId: 'oauth-user-123', nowMs: Date.now() });
    assert.equal(typeof issued.jti, 'string');
    assert.equal(issued.jti.length, 36);

    const payload = await verifySessionToken(issued.token);
    assert.ok(payload);
    assert.equal(payload.sub, 'oauth-user-123');
    assert.equal(payload.iss, 'gisley-nunes-imoveis');
    assert.equal(payload.aud, 'gisley-admin');
    assert.equal(payload.jti, issued.jti);
    assert.equal(Object.hasOwn(payload, 'role'), false);
    assert.equal(Object.hasOwn(payload, 'email'), false);
  });
});

test('JWT adulterado é rejeitado', async () => {
  await withSecret(strongSecret, async () => {
    const issued = await createSessionToken({ openId: 'oauth-user-123' });
    const parts = issued.token.split('.');
    const signature = parts[2];
    const index = Math.floor(signature.length / 2);
    const current = signature[index];
    const replacement = current === 'A' ? 'B' : 'A';
    parts[2] = signature.slice(0, index) + replacement + signature.slice(index + 1);
    const tampered = parts.join('.');
    assert.equal(await verifySessionToken(tampered), null);
  });
});

test('JWT expirado é rejeitado', async () => {
  await withSecret(strongSecret, async () => {
    const nineHoursAgo = Date.now() - (9 * 60 * 60 * 1000);
    const issued = await createSessionToken({ openId: 'oauth-user-123', nowMs: nineHoursAgo });
    assert.equal(await verifySessionToken(issued.token), null);
  });
});

test('rotação do segredo invalida tokens antigos', async () => {
  let token;
  await withSecret(strongSecret, async () => {
    token = (await createSessionToken({ openId: 'oauth-user-123' })).token;
    assert.ok(await verifySessionToken(token));
  });

  await withSecret(['rotated','unit','fixture','Q9w8E7r6T5y4U3i2O1p0'].join('-'), async () => {
    assert.equal(await verifySessionToken(token), null);
  });
});

test('state OAuth usa hash estável e comparação segura de tamanho fixo', () => {
  const state = 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789';
  assert.equal(hashOAuthState(state), hashOAuthState(state));
  assert.equal(hashOAuthState(state).length, 64);
  assert.equal(safeStateEqual(state, state), true);
  assert.equal(safeStateEqual(state, state + 'x'), false);
  assert.equal(safeStateEqual('', ''), false);
  assert.equal(safeStateEqual(state, 'x'.repeat(state.length)), false);
});

test('resolveAdminAccess exige vínculo ativo ao OpenID', () => {
  const previous = process.env.GISELY_ADMIN_OPEN_IDS;
  process.env.GISELY_ADMIN_OPEN_IDS = 'bootstrap-open-id';

  assert.deepEqual(
    resolveAdminAccess({ openId: 'bootstrap-open-id', email: 'owner@example.com', access: null }),
    { role: 'manager', bootstrapManager: true }
  );

  assert.equal(
    resolveAdminAccess({
      openId: 'editor-open-id',
      email: 'editor@example.com',
      access: { email: 'editor@example.com', open_id: 'editor-open-id', role: 'editor', active: 0, invited_by: 'manager@example.com' }
    }),
    null
  );

  assert.equal(
    resolveAdminAccess({
      openId: 'editor-open-id',
      email: 'editor@example.com',
      access: { email: 'editor@example.com', open_id: 'different-open-id', role: 'manager', active: 1, invited_by: 'manager@example.com' }
    }),
    null
  );

  assert.deepEqual(
    resolveAdminAccess({
      openId: 'editor-open-id',
      email: 'editor@example.com',
      access: { email: 'editor@example.com', open_id: 'editor-open-id', role: 'editor', active: 1, invited_by: 'manager@example.com' }
    }),
    { role: 'editor', bootstrapManager: false }
  );

  assert.equal(
    resolveAdminAccess({
      openId: 'editor-open-id',
      email: 'attacker@example.com',
      access: { email: 'editor@example.com', open_id: 'editor-open-id', role: 'editor', active: 1, invited_by: 'manager@example.com' }
    }),
    null,
    'rejeita e-mail OAuth diferente do convite'
  );

  if (previous === undefined) delete process.env.GISELY_ADMIN_OPEN_IDS;
  else process.env.GISELY_ADMIN_OPEN_IDS = previous;
});

test('cookies de produção usam prefixo __Host e flags fortes', () => {
  const script = `
    process.env.NODE_ENV = 'production';
    process.env.GISELY_SESSION_SECRET = ['unit','fixture','session','A1b2C3d4E5f6G7h8I9j0K1l2'].join('-');
    const auth = await import('./server/auth.js');
    const req = { secure: true, headers: {} };
    process.stdout.write(JSON.stringify({
      names: auth.authCookieNames(),
      options: auth.cookieOptions(req)
    }));
  `;

  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  const result = JSON.parse(output);

  assert.match(result.names.sessionCookie, /^__Host-/);
  assert.match(result.names.stateCookie, /^__Host-/);
  assert.equal(result.options.httpOnly, true);
  assert.equal(result.options.secure, true);
  assert.equal(result.options.sameSite, 'strict');
  assert.equal(result.options.path, '/');
  assert.equal(result.options.priority, 'high');
});
