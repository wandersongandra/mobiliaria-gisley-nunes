import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routesSource = readFileSync(new URL('../server/routes.js', import.meta.url), 'utf8');

const managerOnlyDeclarations = [
  "app.put('/api/admin/site', requireManager()",
  "app.post('/api/admin/testimonials', requireManager()",
  "app.delete('/api/admin/testimonials/:id', requireManager()",
  "app.delete('/api/admin/leads/:id', requireManager()",
  "app.get('/api/admin/audit', requireManager()",
  "app.get('/api/admin/team', requireManager()",
  "app.post('/api/admin/team', requireManager()",
  "app.patch('/api/admin/team/:email', requireManager()",
  "app.delete('/api/admin/team/:email', requireManager()"
];

test('operações sensíveis permanecem explicitamente restritas a gestor', () => {
  for (const declaration of managerOnlyDeclarations) {
    assert.ok(
      routesSource.includes(declaration),
      `proteção de gestor ausente ou alterada: ${declaration}`
    );
  }
});

test('API administrativa mantém autenticação global antes das rotas de negócio', () => {
  assert.ok(
    routesSource.includes("app.use('/api/admin'"),
    'middleware global /api/admin ausente'
  );
  assert.ok(
    routesSource.includes('registerRoutes(app, { adminMiddleware = requireAdmin() } = {})'),
    'middleware administrativo padrão deixou de ser requireAdmin()'
  );
  assert.ok(
    routesSource.includes('requireSameOrigin, adminApiGuard, adminMiddleware'),
    'ordem global same-origin → rate-limit → autenticação foi alterada'
  );
});

test('sonda de sessão continua fora da cadeia autenticada, mas minimizada', () => {
  const sessionIndex = routesSource.indexOf("app.get('/api/admin/session'");
  const guardIndex = routesSource.indexOf("app.use('/api/admin'");
  assert.ok(sessionIndex >= 0);
  assert.ok(guardIndex >= 0);
  assert.ok(sessionIndex < guardIndex, 'session probe deixou de ser a exceção anônima anterior ao guard');

  const sessionBlock = routesSource.slice(sessionIndex, guardIndex);
  assert.ok(sessionBlock.includes('email: user.email'));
  assert.ok(sessionBlock.includes('name: user.name'));
  assert.ok(sessionBlock.includes('role: user.role'));
  assert.equal(sessionBlock.includes('openId:'), false);
});

test('proteções contra auto-rebaixamento e remoção de gestor bootstrap permanecem no backend', () => {
  assert.ok(routesSource.includes('CANNOT_CHANGE_SELF_ACCESS'));
  assert.ok(routesSource.includes('CANNOT_REMOVE_SELF'));
  assert.ok(routesSource.includes('BOOTSTRAP_MANAGER_PROTECTED'));
  assert.ok(routesSource.includes('revokeAdminSessionsByEmail(email)'));
});
