const ROLE_CAPABILITIES = Object.freeze({
  editor: new Set([
    'property.read',
    'property.write',
    'property.archive',
    'media.manage',
    'site.read',
    'lead.read',
    'lead.status'
  ]),
  manager: new Set([
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
    invited_by: member?.invited_by || null,
    identity_hint: identityHint,
    is_self: Boolean(openId && actor?.openId && openId === String(actor.openId)),
    is_bootstrap: Boolean(member?.is_bootstrap),
    created_at: member?.created_at || null,
    updated_at: member?.updated_at || null
  };
}
