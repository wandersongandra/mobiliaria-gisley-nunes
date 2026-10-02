import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routesSource = readFileSync(new URL('../server/routes.js', import.meta.url), 'utf8');
const authorizationSource = readFileSync(new URL('../server/authorization.js', import.meta.url), 'utf8');
const dbSource = readFileSync(new URL('../server/db.js', import.meta.url), 'utf8');

const managerOnlyRoutes = [
  ['put', '/api/admin/site', 'site.manage'],
  ['post', '/api/admin/testimonials', 'testimonial.manage'],
  ['delete', '/api/admin/testimonials/:id', 'testimonial.manage'],
  ['delete', '/api/admin/leads/:id', 'lead.erase'],
  ['get', '/api/admin/audit', 'audit.read'],
  ['get', '/api/admin/team', 'team.manage'],
  ['get', '/api/admin/team/invitations', 'team.manage'],
  ['post', '/api/admin/team/invitations', 'team.manage'],
  ['delete', '/api/admin/team/invitations/:email', 'team.manage'],
  ['post', '/api/admin/team', 'team.manage'],
  ['patch', '/api/admin/team/:email', 'team.manage'],
  ['delete', '/api/admin/team/:email', 'team.manage']
];

test('operações sensíveis permanecem explicitamente restritas por capacidade', () => {
  for (const [method, route, capability] of managerOnlyRoutes) {
    const routePrefix = `app.${method}('${route}'`;
    const start = routesSource.indexOf(routePrefix);
    assert.ok(start >= 0, `rota sensível ausente: ${method.toUpperCase()} ${route}`);
    const declaration = routesSource.slice(start, routesSource.indexOf('\n', start));
    assert.ok(
      declaration.includes(`requireCapability('${capability}')`),
      `capacidade sensível ausente ou alterada: ${method.toUpperCase()} ${route} -> ${capability}`
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
    routesSource.includes('requireSameOrigin, adminApiGuard, adminMiddleware, requireCsrfToken'),
    'ordem global same-origin → rate-limit → autenticação → CSRF foi alterada'
  );
});

test('logout individual e global mantêm origem e rate limit antes da lógica de sessão', () => {
  assert.ok(routesSource.includes("const logoutLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 60, namespace: 'auth-logout' });"));
  assert.ok(routesSource.includes("app.post('/api/auth/logout', requireSameOrigin, requireCsrfToken, logoutLimiter, logout);"));
  assert.ok(routesSource.includes("app.post('/api/auth/logout-all', requireSameOrigin, logoutLimiter, requireAdmin(), requireCsrfToken, logoutAll);"));
});

test('sonda de sessão continua anônima, mas protegida por contexto de origem e minimizada', () => {
  const contextGuardIndex = routesSource.indexOf("app.use('/api/admin', requireAdminRequestContext)");
  const sessionIndex = routesSource.indexOf("app.get('/api/admin/session'");
  const authGuardIndex = routesSource.indexOf('requireSameOrigin, adminApiGuard, adminMiddleware, requireCsrfToken', sessionIndex);

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


test('capability precede rate limit on manager-only destructive routes', () => {
  const routes = [
    ["app.delete('/api/admin/properties/:id'", "requireCapability('property.archive')", 'destructiveLimiter'],
    ["app.delete('/api/admin/testimonials/:id'", "requireCapability('testimonial.manage')", 'destructiveLimiter'],
    ["app.delete('/api/admin/leads/:id'", "requireCapability('lead.erase')", 'destructiveLimiter'],
    ["app.delete('/api/admin/team/invitations/:email'", "requireCapability('team.manage')", 'destructiveLimiter'],
    ["app.delete('/api/admin/team/:email'", "requireCapability('team.manage')", 'destructiveLimiter']
  ];

  for (const [routePrefix, capability, limiter] of routes) {
    const start = routesSource.indexOf(routePrefix);
    assert.ok(start >= 0, `rota ausente: ${routePrefix}`);
    const line = routesSource.slice(start, routesSource.indexOf('\n', start));
    assert.ok(line.indexOf(capability) >= 0, `capability ausente: ${routePrefix}`);
    assert.ok(line.indexOf(limiter) >= 0, `limiter ausente: ${routePrefix}`);
    assert.ok(
      line.indexOf(capability) < line.indexOf(limiter),
      `autorização deve ocorrer antes do rate limit destrutivo: ${routePrefix}`
    );
  }
});


test('mídia pública exige vínculo published antes de emitir URL assinada', () => {
  const start = routesSource.indexOf("app.get(/^\\/media\\/(.+)$/");
  assert.ok(start >= 0, 'rota pública /media ausente');
  const end = routesSource.indexOf("if (legacyStorageRouteEnabled())", start);
  const block = routesSource.slice(start, end);
  const lookup = block.indexOf('findPublishedPhotoByStoragePath(key)');
  const sign = block.indexOf('storageGetSignedUrl(key)');
  assert.ok(lookup >= 0, 'lookup de publicação ausente');
  assert.ok(sign >= 0, 'assinatura GET ausente');
  assert.ok(lookup < sign, 'URL assinada não pode ser emitida antes de validar publicação');
  assert.ok(block.includes("if (!publishedPhoto) return res.status(404)"));
});

test('mídia de rascunho do CRM exige autenticação e property.read', () => {
  const prefix = "app.get('/api/admin/photos/:id/media'";
  const start = routesSource.indexOf(prefix);
  assert.ok(start >= 0, 'rota autenticada de mídia ausente');
  const line = routesSource.slice(start, routesSource.indexOf('\n', start));
  assert.ok(line.includes("requireCapability('property.read')"));
});


test('persistência mantém barreira de rascunho para mutações de Editor', () => {
  const persistenceGuards = [
    'export function enforcePropertyWriteScope',
    'export async function saveProperty',
    'export async function addPhoto',
    'export async function removePhoto',
    'export async function setPhotoCover',
    'export async function reorderPhotos'
  ];

  for (const symbol of persistenceGuards) {
    assert.ok(dbSource.includes(symbol), `barreira de persistência ausente: ${symbol}`);
  }

  const draftChecks = dbSource.match(/requireDraft && String\(property\.status\) !== 'draft'/g) || [];
  assert.ok(
    draftChecks.length >= 4,
    'mutações de mídia devem revalidar status draft dentro da transação'
  );

  assert.ok(
    dbSource.includes("if (requireDraft && String(existing.status) !== 'draft')"),
    'update de imóvel deve revalidar status draft sob lock'
  );
  assert.ok(
    dbSource.includes("if (requireDraft && (data.status !== 'draft' || data.featured))"),
    'payload persistido de Editor não pode publicar ou destacar'
  );
});

test('rotas operacionais propagam requireDraft até a persistência', () => {
  const occurrences = routesSource.match(/requireDraft:\s*!hasCapability\(req\.admin, 'property\.publish'\)/g) || [];
  assert.ok(
    occurrences.length >= 5,
    'property/media mutations devem propagar requireDraft para o banco'
  );
});
