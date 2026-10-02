const ROLE_CAPABILITIES = Object.freeze({
  editor: new Set([
    'property.read',
    'property.write',
    'media.manage',
    'site.read',
    'lead.read',
    'lead.status'
  ]),
  manager: new Set([
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
  ])
});

export function capabilitiesForRole(role) {
  return new Set(ROLE_CAPABILITIES[String(role || '')] || []);
}

export function hasCapability(admin, capability) {
  if (!admin || !capability) return false;
  return capabilitiesForRole(admin.role).has(capability);
}

export function requireCapability(capability) {
  return (req, res, next) => {
    if (!hasCapability(req.admin, capability)) {
      return res.status(403).json({ error: 'CAPABILITY_REQUIRED' });
    }
    return next();
  };
}

export function staffView(member, actor) {
  const openId = String(member?.open_id || '');
  return {
    email: String(member?.email || ''),
    name: String(member?.name || ''),
    role: member?.role === 'manager' ? 'manager' : 'editor',
    active: Boolean(member?.active),
    is_self: Boolean(openId && actor?.openId && openId === String(actor.openId)),
    is_bootstrap: Boolean(member?.is_bootstrap)
  };
}


export function auditView(entry = {}) {
  return {
    id: entry.id,
    actor_email: entry.actor_email,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    created_at: entry.created_at
  };
}


function requestedFeatured(input = {}) {
  return input.featured === true
    || input.featured === 1
    || input.featured === '1'
    || input.featured === 'true';
}

export function canCreateProperty(admin, input = {}) {
  if (!hasCapability(admin, 'property.write')) return false;
  if (hasCapability(admin, 'property.publish')) return true;
  const requestedStatus = input.status === undefined ? 'draft' : String(input.status);
  return requestedStatus === 'draft' && !requestedFeatured(input);
}

export function canMutateProperty(admin, property) {
  if (!hasCapability(admin, 'property.write')) return false;
  if (hasCapability(admin, 'property.publish')) return true;
  return String(property?.status || '') === 'draft';
}

export function canArchiveProperty(admin) {
  return hasCapability(admin, 'property.archive');
}

export function canManagePropertyMedia(admin, property) {
  if (!hasCapability(admin, 'media.manage')) return false;
  if (hasCapability(admin, 'property.publish')) return true;
  return String(property?.status || '') === 'draft';
}

export function canRequestPublication(admin, input = {}) {
  if (hasCapability(admin, 'property.publish')) return true;
  const requestedStatus = input.status === undefined ? 'draft' : String(input.status);
  return requestedStatus === 'draft' && !requestedFeatured(input);
}


export function staffMutationError(actor, target, patch = {}) {
  if (!actor || actor.role !== 'manager' || !target) return 'CAPABILITY_REQUIRED';

  const actorOpenId = String(actor.openId || '');
  const targetOpenId = String(target.open_id || '');
  const isSelf = Boolean(actorOpenId && targetOpenId && actorOpenId === targetOpenId);
  const isBootstrap = Boolean(target.is_bootstrap);

  if (isSelf && ((patch.role && patch.role !== actor.role) || patch.active === false)) {
    return 'CANNOT_CHANGE_SELF_ACCESS';
  }

  if (isBootstrap && ((patch.role && patch.role !== 'manager') || patch.active === false)) {
    return 'BOOTSTRAP_MANAGER_PROTECTED';
  }

  return null;
}

export function staffRemovalError(actor, target) {
  if (!actor || actor.role !== 'manager' || !target) return 'CAPABILITY_REQUIRED';

  const actorOpenId = String(actor.openId || '');
  const targetOpenId = String(target.open_id || '');

  if (actorOpenId && targetOpenId && actorOpenId === targetOpenId) return 'CANNOT_REMOVE_SELF';
  if (target.is_bootstrap) return 'BOOTSTRAP_MANAGER_PROTECTED';
  return null;
}
