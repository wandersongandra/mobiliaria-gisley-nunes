import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routesSource = readFileSync(new URL('../server/routes.js', import.meta.url), 'utf8');
const authorizationSource = readFileSync(new URL('../server/authorization.js', import.meta.url), 'utf8');

const managerOnlyDeclarations = [
  "app.put('/api/admin/site', requireCapability('site.manage')",
  "app.post('/api/admin/testimonials', requireCapability('testimonial.manage')",
  "app.delete('/api/admin/testimonials/:id', requireCapability('testimonial.manage')",
  "app.delete('/api/admin/leads/:id', requireCapability('lead.erase')",
  "app.get('/api/admin/audit', requireCapability('audit.read')",
  "app.get('/api/admin/team', requireCapability('team.manage')",
  "app.post('/api/admin/team', requireCapability('team.manage')",
  "app.patch('/api/admin/team/:email', requireCapability('team.manage')",
  "app.delete('/api/admin/team/:email', requireCapability('team.manage')"
];

test('operações sensíveis permanecem explicitamente restritas por capacidade', () => {
  for (const declaration of managerOnlyDeclarations) {
    assert.ok(
      routesSource.includes(declaration),
      `capacidade sensível ausente ou alterada: ${declaration}`
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

test('sonda de sessão continua anônima, mas protegida por contexto de origem e minimizada', () => {
  const contextGuardIndex = routesSource.indexOf("app.use('/api/admin', requireAdminRequestContext)");
  const sessionIndex = routesSource.indexOf("app.get('/api/admin/session'");
  const authGuardIndex = routesSource.indexOf("res.setHeader('Cache-Control', 'no-store');\n    res.setHeader('Pragma', 'no-cache');\n    next();\n  }, requireSameOrigin, adminApiGuard, adminMiddleware)");

  assert.ok(contextGuardIndex >= 0, 'guard de contexto administrativo ausente');
  assert.ok(sessionIndex >= 0, 'session probe ausente');
  assert.ok(authGuardIndex >= 0, 'guard autenticado global ausente');
  assert.ok(contextGuardIndex < sessionIndex, 'session probe deve passar pelo guard de contexto');
  assert.ok(sessionIndex < authGuardIndex, 'session probe deve continuar fora da cadeia autenticada');

  const sessionBlock = routesSource.slice(sessionIndex, authGuardIndex);
  assert.ok(sessionBlock.includes('email: user.email'));
  assert.ok(sessionBlock.includes('name: user.name'));
  assert.ok(sessionBlock.includes('role: user.role'));
  assert.equal(sessionBlock.includes('openId:'), false);
});

test('proteções contra auto-rebaixamento e remoção de gestor bootstrap permanecem centralizadas no backend', () => {
  assert.ok(authorizationSource.includes('export function staffMutationError'));
  assert.ok(authorizationSource.includes('export function staffRemovalError'));
  assert.ok(authorizationSource.includes('CANNOT_CHANGE_SELF_ACCESS'));
  assert.ok(authorizationSource.includes('CANNOT_REMOVE_SELF'));
  assert.ok(authorizationSource.includes('BOOTSTRAP_MANAGER_PROTECTED'));

  assert.ok(routesSource.includes('staffMutationError(req.admin, protectedTarget, patch)'));
  assert.ok(routesSource.includes('staffRemovalError(req.admin, protectedTarget)'));
  assert.ok(routesSource.includes('revokeAdminSessionsByOpenId(current.open_id)'));
});
