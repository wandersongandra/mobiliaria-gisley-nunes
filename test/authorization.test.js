import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../server/routes.js';
import {
  auditView,
  capabilitiesForRole,
  hasCapability,
  requireCapability,
  staffView
} from '../server/authorization.js';

process.env.DATABASE_URL = '';
process.env.ADMIN_ORIGIN = '';
process.env.ENABLE_LEGACY_STORAGE_ROUTE = 'false';

async function withEditorServer(run) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  const editorMiddleware = (req, res, next) => {
    req.admin = {
      openId: 'editor-open-id',
      email: 'editor@gisley.test',
      name: 'Editor Teste',
      role: 'editor'
    };
    next();
  };

  registerRoutes(app, { adminMiddleware: editorMiddleware });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('editor recebe apenas capacidades operacionais previstas', () => {
  const capabilities = capabilitiesForRole('editor');
  assert.deepEqual([...capabilities].sort(), [
    'lead.read',
    'lead.status',
    'media.manage',
    'property.read',
    'property.write',
    'site.read'
  ].sort());

  for (const denied of [
    'property.publish',
    'property.archive',
    'site.manage',
    'testimonial.manage',
    'lead.erase',
    'audit.read',
    'team.manage'
  ]) {
    assert.equal(capabilities.has(denied), false, `editor não deveria possuir ${denied}`);
  }
});

test('gestor possui capacidades administrativas e operacionais', () => {
  for (const capability of [
    'property.read',
    'property.write',
    'property.archive',
    'media.manage',
    'site.read',
    'site.manage',
    'testimonial.manage',
    'lead.read',
    'lead.status',
    'lead.erase',
    'audit.read',
    'team.manage'
  ]) {
    assert.equal(hasCapability({ role: 'manager' }, capability), true, `gestor sem ${capability}`);
  }
});

test('papel desconhecido falha fechado', () => {
  assert.equal(capabilitiesForRole('superadmin').size, 0);
  assert.equal(hasCapability({ role: 'superadmin' }, 'team.manage'), false);
  assert.equal(hasCapability(null, 'property.read'), false);
});

test('requireCapability retorna 403 sem revelar regra interna além do contrato', () => {
  const middleware = requireCapability('team.manage');
  const req = { admin: { role: 'editor' } };
  const result = { statusCode: 200, body: null, next: false };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
  };
  middleware(req, res, () => { result.next = true; });

  assert.equal(result.next, false);
  assert.equal(result.statusCode, 403);
  assert.deepEqual(result.body, { error: 'CAPABILITY_REQUIRED' });
});

test('editor recebe 403 em todas as rotas exclusivas de gestor', async () => {
  const managerOnly = [
    ['PUT', '/api/admin/site'],
    ['POST', '/api/admin/testimonials'],
    ['DELETE', '/api/admin/testimonials/testimonial-id'],
    ['DELETE', '/api/admin/leads/lead-id'],
    ['GET', '/api/admin/audit'],
    ['GET', '/api/admin/team'],
    ['POST', '/api/admin/team'],
    ['PATCH', '/api/admin/team/person%40example.com'],
    ['DELETE', '/api/admin/team/person%40example.com']
  ];

  await withEditorServer(async (origin) => {
    for (const [method, path] of managerOnly) {
      const headers = { Accept: 'application/json' };
      const options = { method, headers };

      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        headers.Origin = origin;
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify({});
      }

      const response = await fetch(`${origin}${path}`, options);
      assert.equal(response.status, 403, `${method} ${path} deveria exigir capacidade de Gestor`);
      assert.deepEqual(await response.json(), { error: 'CAPABILITY_REQUIRED' });
    }
  });
});

test('método inesperado não contorna o guard administrativo do editor', async () => {
  await withEditorServer(async (origin) => {
    const response = await fetch(`${origin}/api/admin/team`, {
      method: 'PUT',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: '{}'
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'NOT_FOUND' });
  });
});

test('staffView minimiza openId e marca self/bootstrap no servidor', () => {
  const view = staffView({
    email: 'owner@gisley.test',
    open_id: 'oauth-identity-abcdefghijklmnop',
    name: 'Owner',
    role: 'manager',
    active: 1,
    invited_by: 'environment',
    is_bootstrap: true
  }, { openId: 'oauth-identity-abcdefghijklmnop' });

  assert.equal(Object.hasOwn(view, 'open_id'), false);
  assert.equal(view.identity_hint, 'oauth-id…mnop');
  assert.equal(view.is_self, true);
  assert.equal(view.is_bootstrap, true);
});


test('auditView mantém openId bruto somente no banco e entrega hint ao CRM', () => {
  const view = auditView({
    id: 'event-id',
    actor_email: 'owner@gisley.test',
    actor_open_id: 'oauth-identity-abcdefghijklmnop',
    action: 'property.update',
    entity_type: 'property',
    entity_id: 'property-id',
    details: null,
    created_at: '2026-10-01T12:00:00.000Z'
  });

  assert.equal(Object.hasOwn(view, 'actor_open_id'), false);
  assert.equal(view.actor_identity_hint, 'oauth-id…mnop');
  assert.equal(view.actor_email, 'owner@gisley.test');
});
