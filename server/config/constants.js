module.exports = {
  ROLES: {
    ADMIN: 'admin',
    PROVIDER: 'provider',
    CLIENT: 'client',
  },

  REQUEST_STATUS: {
    OPEN: 'open',
    ASSIGNED: 'assigned',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    CLOSED: 'closed',
  },

  OFFER_STATUS: {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    WITHDRAWN: 'withdrawn',
  },

  PAYMENT_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REFUNDED: 'refunded',
    CANCELLED: 'cancelled',
  },

  SUBSCRIPTION_STATUS: {
    PENDING: 'pending',
    ACTIVE: 'active',
    EXPIRED: 'expired',
    CANCELLED: 'cancelled',
  },

  MESSAGE_TYPES: {
    TEXT: 'text',
    IMAGE: 'image',
    FILE: 'file',
    VOICE: 'voice',
    SYSTEM: 'system',
  },

  NOTIFICATION_TYPES: {
    NEW_REQUEST: 'new_request',
    NEW_OFFER: 'new_offer',
    OFFER_ACCEPTED: 'offer_accepted',
    OFFER_REJECTED: 'offer_rejected',
    NEW_MESSAGE: 'new_message',
    REQUEST_COMPLETED: 'request_completed',
    NEW_REVIEW: 'new_review',
    VERIFICATION_APPROVED: 'verification_approved',
    VERIFICATION_REJECTED: 'verification_rejected',
    SUBSCRIPTION_ACTIVATED: 'subscription_activated',
    SUBSCRIPTION_EXPIRING: 'subscription_expiring',
    PAYMENT_SUCCESS: 'payment_success',
  },

  ALLOWED_FILE_TYPES: {
    IMAGE: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    // Animated formats accepted by browsers without extra tooling.
    // GIF + APNG are decoded by <img>; WebM/MP4 need <video>.
    IMAGE_ANIMATED: ['image/gif', 'image/apng', 'image/webp'],
    VIDEO: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
    DOCUMENT: ['application/pdf'],
    AUDIO: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'],
  },

  ALLOWED_EXTENSIONS: [
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.apng',
    '.mp4', '.m4a', '.mov', '.webm', '.ogv', '.ogg',
    '.pdf', '.mp3', '.wav',
  ],

  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
  },
};
