import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clientAddress,
  createRateLimiter,
  rateLimiterBucketCount
} from '../server/security.js';

function mockReq(ip = '127.0.0.1', headers = {}) {
  return {
    headers,
    socket: { remoteAddress: ip }
  };
}

function invoke(middleware, req) {
  const headers = new Map();
  const result = {
    nextCalled: false,
    statusCode: 200,
    body: null,
    headers
  };
  const res = {
    setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); },
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
  };
  middleware(req, res, () => { result.nextCalled = true; });
  return result;
}

test('rate limiter aceita até o limite e bloqueia a requisição seguinte', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3, namespace: 'test-basic' });
  const req = mockReq('198.51.100.10');

  for (let i = 0; i < 3; i += 1) {
    const result = invoke(limiter, req);
    assert.equal(result.nextCalled, true, `request ${i + 1}`);
    assert.equal(result.statusCode, 200);
    assert.equal(result.headers.get('ratelimit-limit'), '3');
  }

  const blocked = invoke(limiter, req);
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.error, 'RATE_LIMITED');
  assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  assert.equal(blocked.headers.get('ratelimit-remaining'), '0');
});

test('CF-Connecting-IP é ignorado sem opt-in explícito', () => {
  const previousMode = process.env.TRUST_PROXY_MODE;
  const previousTrust = process.env.TRUST_CLIENT_IP_HEADER;
  try {
    process.env.TRUST_PROXY_MODE = 'cloudflare';
    process.env.TRUST_CLIENT_IP_HEADER = 'false';
    assert.equal(
      clientAddress(mockReq('203.0.113.20', { 'cf-connecting-ip': '198.51.100.99' })),
      '203.0.113.20'
    );

    process.env.TRUST_CLIENT_IP_HEADER = 'true';
    assert.equal(
      clientAddress(mockReq('203.0.113.20', { 'cf-connecting-ip': '198.51.100.99' })),
      '198.51.100.99'
    );
  } finally {
    if (previousMode === undefined) delete process.env.TRUST_PROXY_MODE; else process.env.TRUST_PROXY_MODE = previousMode;
    if (previousTrust === undefined) delete process.env.TRUST_CLIENT_IP_HEADER; else process.env.TRUST_CLIENT_IP_HEADER = previousTrust;
  }
});

test('rate limiter mantém teto rígido de buckets em memória', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, namespace: 'test-cardinality' });

  for (let i = 0; i < 10_250; i += 1) {
    const a = (i >> 16) & 255;
    const b = (i >> 8) & 255;
    const c = i & 255;
    invoke(limiter, mockReq(`10.${a}.${b}.${c}`));
  }

  assert.ok(rateLimiterBucketCount() <= 10_000, rateLimiterBucketCount());
});
