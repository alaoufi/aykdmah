import { askConfirm } from '../common/AppDialog';
import { getToken, TOKEN_CHANGE_EVENT, ADMIN_TOKEN_KEY } from '../../services/api';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

let pending = false;
// A double tap must not queue another confirmation for the same visible form.
export async function confirmAdminChange(t, name = '', danger = false, { signal } = {}) {
  if (pending || signal?.aborted) return false;
  pending = true;
  const session = getToken();
  const route = typeof window === 'undefined' ? null : window.location.pathname + window.location.search;
  try {
    const approved = await askConfirm({
      title: t('admin.confirm_action'),
      message: `${t('admin.confirm_change_body')}${name ? `\n${name}` : ''}`,
      tone: danger ? 'danger' : undefined,
    });
    const sameRoute = route === null || route === window.location.pathname + window.location.search;
    return approved && !signal?.aborted && sameRoute && getToken() === session;
  } finally { pending = false; }
}

// Each mounted form owns its confirmation lifetime. An old form must remain
// invalid after Back/Forward returns to an identical URL with the same token.
export function useAdminConfirmationScope() {
  const lifetime = useRef(null);
  const location = useLocation();
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    const invalidate = event => {
      if (event.type !== 'storage' || event.key === null || event.key === ADMIN_TOKEN_KEY) controller.abort();
    };
    window.addEventListener(TOKEN_CHANGE_EVENT, invalidate);
    window.addEventListener('storage', invalidate);
    return () => {
      controller.abort();
      window.removeEventListener(TOKEN_CHANGE_EVENT, invalidate);
      window.removeEventListener('storage', invalidate);
    };
  }, [location.key, location.pathname, location.search]);
  return lifetime;
}
export function useAdminConfirmation() {
  const lifetime = useAdminConfirmationScope();
  return (t, name, danger) => lifetime.current
    ? confirmAdminChange(t, name, danger, { signal: lifetime.current.signal })
    : Promise.resolve(false);
}
