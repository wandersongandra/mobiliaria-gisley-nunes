import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const routesSource = readFileSync(path.resolve('server/routes.js'), 'utf8');

const expected = new Map([
  ['GET /api/admin/session', null],
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

test('toda rota administrativa declara capability explícita exceto session probe', () => {
  const regex = /app\.(get|post|put|patch|delete)\('([^']*\/api\/admin[^']*)'([\s\S]*?)=>/g;
  const found = new Map();
  let match;

  while ((match = regex.exec(routesSource))) {
    const method = match[1].toUpperCase();
    const route = match[2];
    const capability = match[3].match(/requireCapability\('([^']+)'\)/)?.[1] || null;
    found.set(`${method} ${route}`, capability);
  }

  assert.deepEqual([...found.keys()].sort(), [...expected.keys()].sort());

  for (const [route, capability] of expected) {
    assert.equal(found.get(route), capability, `${route} com capability incorreta`);
    if (route !== 'GET /api/admin/session') {
      assert.ok(capability, `${route} não pode ficar sem capability`);
    }
  }
});
