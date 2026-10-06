const SAFE_ERROR_LABELS = new Set([
  'DATABASE_NOT_CONFIGURED',
  'DATABASE_URL_INVALID',
  'AUTH_DATABASE_NOT_CONFIGURED',
  'STORAGE_NOT_CONFIGURED',
  'R2_NOT_CONFIGURED',
  'OAUTH_NOT_CONFIGURED',
  'OAUTH_URL_INVALID',
  'OAUTH_ACCESS_TOKEN_MISSING',
  'SESSION_SECRET_NOT_CONFIGURED',
  'ADMIN_ORIGIN_NOT_CONFIGURED',
  'BOOTSTRAP_IDENTITY_NOT_CONFIGURED',
  'BOOTSTRAP_IDENTITY_INVALID',
  'BOOTSTRAP_EMAIL_INVALID',
  'ER_DUP_ENTRY',
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EPIPE',
  'PROTOCOL_CONNECTION_LOST'
]);

const SAFE_LOG_EVENTS = new Set([
  'api.error',
  'audit.write_failed',
  'storage.upload_cleanup_failed',
  'storage.orphan_cleanup_deferred',
  'db.migration_deferred',
  'db.shutdown_failed',
  'oauth.callback_failed',
  'startup.failed'
]);

export function safeErrorLabel(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (SAFE_ERROR_LABELS.has(code)) return code;

  const message = typeof error?.message === 'string' ? error.message : '';
  if (SAFE_ERROR_LABELS.has(message)) return message;
  if (/^OAUTH_(?:EXCHANGE|USERINFO)_[45][0-9]{2}$/.test(message)) return message;

  return 'UNCLASSIFIED';
}

export function logOperationalError(logger, event, error) {
  const safeEvent = SAFE_LOG_EVENTS.has(event) ? event : 'startup.failed';
  logger(`[${safeEvent}] ${safeErrorLabel(error)}`);
}
