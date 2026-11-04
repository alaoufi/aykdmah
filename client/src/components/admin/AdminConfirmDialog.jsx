import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { askConfirm, showAlert } from '../common/AppDialog';
import { apiError, getToken } from '../../services/api';
import { useAdminConfirmationScope } from './confirmAdminChange';

// Compatibility bridge for existing admin actions: all confirmations use the
// single AppDialog queue, while the existing mutations and permission gates stay put.
export default function AdminConfirmDialog({ open, title, body, tone, confirmLabel, cancelLabel, onConfirm, onCancel }) {
  const { t } = useTranslation();
  const lifetime = useAdminConfirmationScope();
  const pending = useRef(false);
  const generation = useRef(0);
  const [revision, setRevision] = useState(0);
  const [working, setWorking] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!open) { generation.current++; return; }
    if (pending.current) return;
    pending.current = true;
    const version = generation.current;
    const session = getToken();
    const route = window.location.pathname + window.location.search;
    const signal = lifetime.current?.signal;
    void (async () => {
      try {
        const approved = await askConfirm({ title, message: body, tone, confirmText: confirmLabel, cancelText: cancelLabel });
        if (!mounted.current || generation.current !== version) return;
        if (signal?.aborted || route !== window.location.pathname + window.location.search || getToken() !== session) { onCancel?.(); return; }
        if (approved) { setWorking(true); await onConfirm?.(); }
        else onCancel?.();
      } catch (error) {
        if (mounted.current && generation.current === version) {
          onCancel?.();
          await showAlert({ title: t('errors.generic'), message: apiError(error) });
        }
      } finally { pending.current = false; if (mounted.current) { setWorking(false); setRevision(value => value + 1); } }
    })();
  }, [open, revision]);
  return working ? <div role="status" aria-live="polite" data-testid="admin-mutation-busy"
    className="fixed inset-0 z-[5900] bg-black/30 grid place-items-center">
    <p className="rounded-card bg-surface text-fg px-5 py-3 shadow-card">{t('admin.saving')}</p>
  </div> : null;
}
