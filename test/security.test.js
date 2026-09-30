import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configuredPublicOrigin } from '../server/config.js';
import { requestOrigin } from '../server/security.js';

function mockRequest({ host = 'localhost:3000', proto = '' } = {}) {
  return {
    secure: false,
    headers: { 'x-forwarded-proto': proto },
    get(name) { return name.toLowerCase() === 'host' ? host : ''; }
  };
}

test('configuredPublicOrigin normaliza uma origem HTTPS', () => {
  const previous = process.env.PUBLIC_ORIGIN;
  process.env.PUBLIC_ORIGIN = 'https://example.com/path?q=1';
  assert.equal(configuredPublicOrigin(), 'https://example.com');
  process.env.PUBLIC_ORIGIN = previous;
});

test('requestOrigin rejeita Host inválido', () => {
  const previous = process.env.PUBLIC_ORIGIN;
  process.env.PUBLIC_ORIGIN = '';
  assert.equal(requestOrigin(mockRequest({ host: 'evil.com/path' })), '');
  process.env.PUBLIC_ORIGIN = previous;
});

test('requestOrigin usa protocolo encaminhado HTTPS', () => {
  const previous = process.env.PUBLIC_ORIGIN;
  process.env.PUBLIC_ORIGIN = '';
  assert.equal(requestOrigin(mockRequest({ host: 'site.com', proto: 'https' })), 'https://site.com');
  process.env.PUBLIC_ORIGIN = previous;
});
