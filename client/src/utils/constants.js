export const ROLES = { ADMIN: 'admin', PROVIDER: 'provider', CLIENT: 'client' };

export const REQUEST_STATUS = {
  open:        { i18nKey: 'status.request.open',        color: 'badge-primary' },
  assigned:    { i18nKey: 'status.request.assigned',    color: 'badge-warning' },
  in_progress: { i18nKey: 'status.request.in_progress', color: 'badge-warning' },
  completed:   { i18nKey: 'status.request.completed',   color: 'badge-success' },
  cancelled:   { i18nKey: 'status.request.cancelled',   color: 'badge-danger'  },
  closed:      { i18nKey: 'status.request.closed',      color: 'badge'         },
};

export const OFFER_STATUS = {
  pending:   { i18nKey: 'status.offer.pending',   color: 'badge'        },
  accepted:  { i18nKey: 'status.offer.accepted',  color: 'badge-success' },
  rejected:  { i18nKey: 'status.offer.rejected',  color: 'badge-danger'  },
  withdrawn: { i18nKey: 'status.offer.withdrawn', color: 'badge'         },
};

export const ALLOWED_FILE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
