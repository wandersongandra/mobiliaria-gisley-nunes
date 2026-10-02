import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const baseEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:pass@db.example.com:3306/gisley',
  ADMIN_ORIGIN: 'https://painel.gisley.test',
  GISELY_ADMIN_OPEN_IDS: 'bootstrap-open-id',
  GISELY_SESSION_SECRET: 'Gisley-Session-Secret-2026!A9#xQ7@Lm2$Vr',
  MANUS_OAUTH_PORTAL_URL: 'https://oauth.example.com',
  MANUS_OAUTH_API_URL: 'https://oauth-api.example.com',
  MANUS_PROJECT_ID: 'project-123'
};

function runConfig(overrides = {}) {
  const env = { ...process.env, ...baseEnv, ...overrides };
  const script = `
    const auth = await import('./server/auth.js');
    try {
      auth.assertAuthConfiguration();
      process.stdout.write('OK');
    } catch (error) {
      process.stdout.write(error.message);
    }
  `;
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8'
  }).trim();
}

test('configuração de autenticação forte é aceita em produção', () => {
  assert.equal(runConfig(), 'OK');
});

test('produção rejeita segredo de sessão fraco', () => {
  assert.equal(runConfig({ GISELY_SESSION_SECRET: 'change-me-change-me-change-me-change-me' }), 'SESSION_SECRET_NOT_CONFIGURED');
});

test('produção exige ADMIN_ORIGIN HTTPS', () => {
  assert.equal(runConfig({ ADMIN_ORIGIN: '' }), 'ADMIN_ORIGIN_NOT_CONFIGURED');
  assert.equal(runConfig({ ADMIN_ORIGIN: 'http://painel.gisley.test' }), 'ADMIN_ORIGIN_NOT_CONFIGURED');
});

test('produção rejeita endpoints OAuth inseguros', () => {
  assert.equal(runConfig({ MANUS_OAUTH_PORTAL_URL: 'http://oauth.example.com' }), 'OAUTH_URL_INVALID');
  assert.equal(runConfig({ MANUS_OAUTH_API_URL: 'http://oauth-api.example.com' }), 'OAUTH_URL_INVALID');
});

test('produção exige identidade bootstrap explícita', () => {
  assert.equal(runConfig({ GISELY_ADMIN_OPEN_IDS: '' }), 'BOOTSTRAP_IDENTITY_NOT_CONFIGURED');
});

test('produção rejeita OpenID bootstrap inválido', () => {
  assert.equal(runConfig({ GISELY_ADMIN_OPEN_IDS: 'id com espaco' }), 'BOOTSTRAP_IDENTITY_INVALID');
});
