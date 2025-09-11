// Session configuration constants
export const SESSION_LIMITS = {
  MAX_SESSIONS_PER_USER: 3,
  QR_TIMEOUT_MINUTES: 2,
  INITIALIZATION_TIMEOUT_SECONDS: 45,
  MAX_QR_RETRIES: 5,
  MAX_AUTH_FAILURES: 3,
  AUTO_CLEANUP_INTERVAL_HOURS: 1,
  SESSION_MAX_AGE_HOURS: 24
};

export const SESSION_MESSAGES = {
  LIMIT_REACHED: `You can have maximum ${SESSION_LIMITS.MAX_SESSIONS_PER_USER} active WhatsApp sessions. Please delete an existing session before creating a new one.`,
  INITIALIZATION_TIMEOUT: 'Session initialization took too long. Please try again.',
  QR_EXPIRED: `QR code expired after ${SESSION_LIMITS.QR_TIMEOUT_MINUTES} minutes. Please try again.`,
  AUTH_FAILURE: 'Authentication failed. Please scan the QR code correctly.',
  DELETE_CONFIRM: 'Are you sure you want to permanently delete this session? This action cannot be undone.',
  LOGOUT_CONFIRM: 'Are you sure you want to logout this session? You will need to scan QR code again.',
  CONNECTION_REQUIRED: 'Please wait for server connection to be established.',
  SESSION_CREATED: 'New WhatsApp session is being initialized...',
  SESSION_DELETED: 'WhatsApp session has been permanently deleted.',
  SESSION_LOGGED_OUT: 'Session has been logged out. You can scan QR code to reconnect.',
  GROUPS_REFRESHING: 'Loading latest WhatsApp groups...'
};

export default {
  SESSION_LIMITS,
  SESSION_MESSAGES
};