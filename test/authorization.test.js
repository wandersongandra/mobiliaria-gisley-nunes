import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../server/routes.js';
import { enforcePropertyWriteScope } from '../server/db.js';
import {
  auditView,
  canCreateProperty,
  canManagePropertyMedia,
  canMutateProperty,
  canRequestPublication,
  capabilitiesForRole,
  hasCapability,
  requireCapability,
  staffMutationError,
  staffRemovalError,
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
    'property.publish',
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

test('staffView não expõe OpenID nem fragmentos e marca self/bootstrap no servidor', () => {
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
  assert.equal(Object.hasOwn(view, 'identity_hint'), false);
  assert.equal(view.is_self, true);
  assert.equal(view.is_bootstrap, true);
});


test('auditView não expõe OpenID nem detalhes internos ao CRM', () => {
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
  assert.equal(Object.hasOwn(view, 'actor_identity_hint'), false);
  assert.equal(Object.hasOwn(view, 'details'), false);
  assert.equal(view.actor_email, 'owner@gisley.test');
});


test('editor não consegue escalar publicação por payload', () => {
  const editor = { role: 'editor' };
  const manager = { role: 'manager' };

  assert.equal(canCreateProperty(editor, { status: 'draft', featured: false }), true);
  assert.equal(canCreateProperty(editor, { status: 'published', featured: false }), false);
  assert.equal(canCreateProperty(editor, { status: 'archived', featured: false }), false);
  assert.equal(canCreateProperty(editor, { status: 'draft', featured: true }), false);
  assert.equal(canCreateProperty(editor, { status: 'draft', featured: 'false' }), false);

  assert.equal(canRequestPublication(editor, { status: 'published' }), false);
  assert.equal(canRequestPublication(editor, { status: 'archived' }), false);
  assert.equal(canRequestPublication(editor, { featured: true }), false);
  assert.equal(canRequestPublication(editor, { status: 'draft', featured: false }), true);

  assert.equal(canCreateProperty(manager, { status: 'published', featured: true }), true);
  assert.equal(canRequestPublication(manager, { status: 'published', featured: true }), true);
});

test('editor só altera imóvel e mídia enquanto o recurso continua em rascunho', () => {
  const editor = { role: 'editor' };
  const manager = { role: 'manager' };

  for (const status of ['published', 'archived']) {
    assert.equal(canMutateProperty(editor, { status }), false);
    assert.equal(canManagePropertyMedia(editor, { status }), false);
    assert.equal(canMutateProperty(manager, { status }), true);
    assert.equal(canManagePropertyMedia(manager, { status }), true);
  }

  assert.equal(canMutateProperty(editor, { status: 'draft' }), true);
  assert.equal(canManagePropertyMedia(editor, { status: 'draft' }), true);
});

test('editor autenticado não consegue mutar imóvel publicado por chamada direta à API', async () => {
  await withEditorServer(async (origin) => {
    const requests = [
      {
        method: 'PUT',
        path: '/api/admin/properties/demo-1',
        body: {
          title: 'Tentativa indevida',
          location: 'Lourdes · Belo Horizonte',
          city: 'Belo Horizonte',
          purpose: 'Comprar',
          type: 'Apartamento',
          status: 'draft'
        }
      },
      {
        method: 'DELETE',
        path: '/api/admin/properties/demo-1',
        body: {}
      },
      {
        method: 'POST',
        path: '/api/admin/uploads/presign',
        body: {
          propertyId: 'demo-1',
          fileName: 'fachada.jpg',
          contentType: 'image/jpeg',
          size: 1024
        }
      }
    ];

    for (const item of requests) {
      const response = await fetch(`${origin}${item.path}`, {
        method: item.method,
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(item.body)
      });
      assert.equal(response.status, 403, `${item.method} ${item.path} deveria falhar fechado para Editor`);
      assert.deepEqual(await response.json(), { error: 'CAPABILITY_REQUIRED' });
    }
  });
});

test('editor não cria imóvel publicado ou destacado por payload adulterado', async () => {
  await withEditorServer(async (origin) => {
    for (const body of [
      {
        title: 'Publicação indevida',
        location: 'Savassi · Belo Horizonte',
        city: 'Belo Horizonte',
        purpose: 'Comprar',
        type: 'Apartamento',
        status: 'published',
        featured: false
      },
      {
        title: 'Destaque indevido',
        location: 'Savassi · Belo Horizonte',
        city: 'Belo Horizonte',
        purpose: 'Comprar',
        type: 'Apartamento',
        status: 'draft',
        featured: true
      }
    ]) {
      const response = await fetch(`${origin}/api/admin/properties`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(body)
      });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: 'CAPABILITY_REQUIRED' });
    }
  });
});


test('persistência também impede Editor de publicar ou destacar', () => {
  assert.doesNotThrow(() => enforcePropertyWriteScope(
    { status: 'draft', featured: false },
    { requireDraft: true }
  ));

  assert.throws(
    () => enforcePropertyWriteScope({ status: 'published', featured: false }, { requireDraft: true }),
    /CAPABILITY_REQUIRED/
  );
  assert.throws(
    () => enforcePropertyWriteScope({ status: 'draft', featured: true }, { requireDraft: true }),
    /CAPABILITY_REQUIRED/
  );

  assert.doesNotThrow(() => enforcePropertyWriteScope(
    { status: 'published', featured: true },
    { requireDraft: false }
  ));
});


test('gestor não consegue remover ou rebaixar a própria identidade', () => {
  const actor = { openId: 'manager-open-id', role: 'manager' };
  const self = {
    open_id: 'manager-open-id',
    role: 'manager',
    active: 1,
    is_bootstrap: false
  };

  assert.equal(
    staffMutationError(actor, self, { role: 'editor' }),
    'CANNOT_CHANGE_SELF_ACCESS'
  );
  assert.equal(
    staffMutationError(actor, self, { active: false }),
    'CANNOT_CHANGE_SELF_ACCESS'
  );
  assert.equal(staffMutationError(actor, self, { name: 'Novo nome' }), null);
  assert.equal(staffRemovalError(actor, self), 'CANNOT_REMOVE_SELF');
});

test('gestor bootstrap não pode ser rebaixado desativado ou removido', () => {
  const actor = { openId: 'other-manager', role: 'manager' };
  const bootstrap = {
    open_id: 'bootstrap-open-id',
    role: 'manager',
    active: 1,
    is_bootstrap: true
  };

  assert.equal(
    staffMutationError(actor, bootstrap, { role: 'editor' }),
    'BOOTSTRAP_MANAGER_PROTECTED'
  );
  assert.equal(
    staffMutationError(actor, bootstrap, { active: false }),
    'BOOTSTRAP_MANAGER_PROTECTED'
  );
  assert.equal(staffMutationError(actor, bootstrap, { name: 'Nome atualizado' }), null);
  assert.equal(staffRemovalError(actor, bootstrap), 'BOOTSTRAP_MANAGER_PROTECTED');
});

test('ator sem papel manager falha fechado nas mutações de equipe', () => {
  const editor = { openId: 'editor-open-id', role: 'editor' };
  const target = { open_id: 'other-open-id', role: 'editor', active: 1, is_bootstrap: false };
  assert.equal(staffMutationError(editor, target, { role: 'manager' }), 'CAPABILITY_REQUIRED');
  assert.equal(staffRemovalError(editor, target), 'CAPABILITY_REQUIRED');
});


test('persistência exige permissão explícita para arquivar', async () => {
  const { softDeleteProperty } = await import('../server/db.js');
  await assert.rejects(
    () => softDeleteProperty('property-id'),
    /CAPABILITY_REQUIRED/
  );
});
