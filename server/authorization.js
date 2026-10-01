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
  const identityHint = openId
    ? (openId.length <= 12 ? openId : `${openId.slice(0, 8)}…${openId.slice(-4)}`)
    : '';

  return {
    email: String(member?.email || ''),
    name: String(member?.name || ''),
    role: member?.role === 'manager' ? 'manager' : 'editor',
    active: Boolean(member?.active),
    identity_hint: identityHint,
    is_self: Boolean(openId && actor?.openId && openId === String(actor.openId)),
    is_bootstrap: Boolean(member?.is_bootstrap)
  };
}


export function auditView(entry = {}) {
  const openId = String(entry.actor_open_id || '');
  const identityHint = openId
    ? (openId.length <= 12 ? openId : `${openId.slice(0, 8)}…${openId.slice(-4)}`)
    : '';

  return {
    id: entry.id,
    actor_email: entry.actor_email,
    actor_identity_hint: identityHint,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    created_at: entry.created_at
  };
}


export function canCreateProperty(admin, input = {}) {
  if (!hasCapability(admin, 'property.write')) return false;
  if (hasCapability(admin, 'property.publish')) return true;
  return input.status !== 'published' && !Boolean(input.featured);
}

export function canMutateProperty(admin, property) {
  if (!hasCapability(admin, 'property.write')) return false;
  if (hasCapability(admin, 'property.publish')) return true;
  return String(property?.status || '') === 'draft';
}

export function canManagePropertyMedia(admin, property) {
  if (!hasCapability(admin, 'media.manage')) return false;
  if (hasCapability(admin, 'property.publish')) return true;
  return String(property?.status || '') === 'draft';
}

export function canRequestPublication(admin, input = {}) {
  if (hasCapability(admin, 'property.publish')) return true;
  return input.status !== 'published' && !Boolean(input.featured);
}
