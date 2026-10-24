import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = readFileSync(new URL('../public/.htaccess', import.meta.url), 'utf8');
const directives = config.split('\n').map((line) => line.trim());

test('Apache CORS policy removes inherited grants from both header tables only on private routes', () => {
  const privatePaths = [
    '/admin', '/admin/', '/admin/main.js',
    '/api/admin/properties', '/api/admin/session',
    '/api/auth/login', '/api/auth/login?next=1', '/oauth/google/return'
  ];
  const publicPaths = ['/api/v2/properties', '/api/contact', '/imoveis', '/administer'];

  for (const header of ['Access-Control-Allow-Origin', 'Access-Control-Allow-Credentials']) {
    for (const table of ['', 'always ']) {
      const rule = directives.find((line) => line.startsWith(`Header ${table}unset ${header} `));
      assert.ok(rule, `Missing ${table || 'onsuccess '}${header} cleanup`);
      const expression = rule.match(/%\{THE_REQUEST\} =~ m#([^#]+)#/);
      assert.ok(expression, `Missing original request-line expression for ${header}`);
      const route = new RegExp(expression[1]);
      for (const pathname of privatePaths) assert.match(`OPTIONS ${pathname} HTTP/1.1`, route);
      for (const pathname of publicPaths) assert.doesNotMatch(`OPTIONS ${pathname} HTTP/1.1`, route);
    }
  }
});

test('Apache only permits immutable cache for versioned static JS/CSS', () => {
  const rules = directives.filter((line) => line.startsWith('Header set Cache-Control '));
  assert.equal(rules.length, 2);
  assert.match(rules[0], /max-age=0, must-revalidate/);
  assert.match(rules[1], /max-age=31536000, immutable/);
  assert.match(rules[1], /%\{QUERY_STRING\} =~ m#\^v=\[a-f0-9\]\{64\}\$#/);

  const pathExpression = rules[1].match(/%\{REQUEST_URI\} =~ m#([^#]+)#/);
  assert.ok(pathExpression);
  const allowedAsset = new RegExp(pathExpression[1]);
  for (const pathname of ['/admin/main.js', '/admin/styles.css', '/assets/main.js', '/assets/main.css']) {
    assert.match(pathname, allowedAsset);
  }
  for (const pathname of ['/admin', '/api/admin/properties', '/imoveis', '/assets/logo.svg']) {
    assert.doesNotMatch(pathname, allowedAsset);
  }
});
