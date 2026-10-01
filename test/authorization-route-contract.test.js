import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server/routes.js', import.meta.url), 'utf8');

const expected = new Map([
  ['GET /api/admin/properties', 'property.read'],
  ['POST /api/admin/properties', 'property.write'],
  ['GET /api/admin/properties/:id', 'property.read'],
  ['PUT /api/admin/properties/:id', 'property.write'],
  ['DELETE /api/admin/properties/:id', 'property.archive'],
  ['POST /api/admin/uploads/presign', 'media.manage'],
  ['POST /api/admin/properties/:id/photos', 'media.manage'],
  ['DELETE /api/admin/photos/:id', 'media.manage'],
  ['PUT /api/admin/properties/:id/photos/order', 'media.manage'],
  ['PUT /api/admin/photos/:id/cover', 'media.manage'],
  ['GET /api/admin/site', 'site.read'],
  ['PUT /api/admin/site', 'site.manage'],
  ['POST /api/admin/testimonials', 'testimonial.manage'],
  ['DELETE /api/admin/testimonials/:id', 'testimonial.manage'],
  ['GET /api/admin/leads', 'lead.read'],
  ['PATCH /api/admin/leads/:id', 'lead.status'],
  ['DELETE /api/admin/leads/:id', 'lead.erase'],
  ['GET /api/admin/audit', 'audit.read'],
  ['GET /api/admin/team', 'team.manage'],
  ['POST /api/admin/team', 'team.manage'],
  ['PATCH /api/admin/team/:email', 'team.manage'],
  ['DELETE /api/admin/team/:email', 'team.manage']
]);

test('toda rota administrativa declara capability explícita conforme matriz', () => {
  const routeLines = source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^app\.(get|post|put|patch|delete)\('\/api\/admin\//.test(line));

  const seen = new Set();

  for (const line of routeLines) {
    const match = line.match(/^app\.(get|post|put|patch|delete)\('([^']+)'/);
    assert.ok(match, `Não foi possível interpretar rota administrativa: ${line}`);

    const method = match[1].toUpperCase();
    const path = match[2];
    const key = `${method} ${path}`;

    if (key === 'GET /api/admin/session') {
      assert.equal(line.includes('requireCapability('), false, 'session probe é exceção anônima documentada');
      continue;
    }

    const capability = expected.get(key);
    assert.ok(capability, `Rota administrativa nova sem classificação na matriz: ${key}`);
    assert.ok(
      line.includes(`requireCapability('${capability}')`),
      `${key} deveria exigir capability ${capability}`
    );
    seen.add(key);
  }

  assert.deepEqual(
    [...seen].sort(),
    [...expected.keys()].sort(),
    'A matriz e as rotas registradas precisam permanecer sincronizadas'
  );
});
