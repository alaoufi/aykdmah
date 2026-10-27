import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  adminListPermissions, adminGetUserPermissions, adminUpdateUserPermissions,
} from '../../services/adminService';
import { apiError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import Modal from '../common/Modal';

// Permission picker for one admin user. Two modes:
//   • Super admin    → bypasses every check. Only an existing super
//                      can grant/revoke this flag (server enforces it).
//   • Specialized    → individual permission checkboxes, grouped by
//                      section. The bottom of the modal shows a
//                      summary of how many are selected.

export default function AdminPermissionsEditor({ open, userId, userName, onClose, onSaved }) {
  const { t } = useTranslation();
  const { isSuperAdmin: viewerIsSuper } = useAuth();
  const [registry, setRegistry] = useState([]);
  const [isSuper, setIsSuper] = useState(false);
  const [granted, setGranted] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadedUserId, setLoadedUserId] = useState(null);
  const targetRef = useRef(null);
  targetRef.current = open ? userId : null;
  const saveInFlight = useRef(false);
  const sessionVersion = useRef(0);

  useEffect(() => {
    let active = true;
    ++sessionVersion.current;
    setLoadedUserId(null);
    setRegistry([]); setGranted([]); setIsSuper(false);
    if (!open || !userId) return () => { active = false; };
    setLoading(true); setError('');
    Promise.all([adminListPermissions(), adminGetUserPermissions(userId)])
      .then(([reg, u]) => {
        if (!active) return;
        if (!Array.isArray(reg) || !u || !Array.isArray(u.permissions)) {
          throw new Error(t('errors.generic'));
        }
        setRegistry(reg);
        setIsSuper(!!u.is_super_admin);
        setGranted(u.permissions);
        setLoadedUserId(userId);
      })
      .catch((e) => { if (active) setError(apiError(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, userId, t]);

  const toggle = (key) => {
    setGranted((g) => g.includes(key) ? g.filter((k) => k !== key) : [...g, key]);
  };
  const selectAllInGroup = (group, on) => {
    const keys = registry.filter((p) => p.group === group).map((p) => p.key);
    setGranted((g) => on ? [...new Set([...g, ...keys])] : g.filter((k) => !keys.includes(k)));
  };

  const save = async () => {
    if (!open || !userId || loadedUserId !== userId || loading || saveInFlight.current) return;
    const savedUserId = userId;
    const version = sessionVersion.current;
    saveInFlight.current = true;
    setSaving(true); setError('');
    try {
      await adminUpdateUserPermissions(savedUserId, {
        is_super_admin: isSuper ? 1 : 0,
        permissions: isSuper ? [] : granted, // permissions ignored when super, but cleared for tidiness
      });
      if (targetRef.current !== savedUserId || version !== sessionVersion.current) return;
      onSaved && onSaved();
      onClose && onClose();
    } catch (e) { if (targetRef.current === savedUserId && version === sessionVersion.current) setError(apiError(e)); }
    finally { saveInFlight.current = false; setSaving(false); }
  };

  // Group keys for the layout
  const groups = registry.reduce((acc, p) => {
    (acc[p.group] = acc[p.group] || []).push(p);
    return acc;
  }, Object.create(null));

  const totalSelected = isSuper ? registry.length : granted.length;

  return (
    <Modal open={open} onClose={onClose} width={620}
      title={t('admin.permissions_title', { name: userName || `#${userId}` })}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-pill bg-surface hover:bg-surface-alt text-fg-muted text-[13px] font-semibold border border-border transition">
            {t('admin.cancel_btn')}
          </button>
          <button onClick={save} disabled={saving || loading || loadedUserId !== userId}
            className="px-4 py-2 rounded-pill text-primary-fg text-[13px] font-bold shadow-soft disabled:opacity-60 transition bg-primary-grad">
            {saving ? t('admin.saving') : t('admin.save')}
          </button>
        </>
      }>
      {error && <div className="mb-3 px-3 py-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[13px]">{error}</div>}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-card bg-surface-alt animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Super-admin toggle. Only super admins can flip this; for
              everyone else the row is disabled but visible so the state
              is clear. */}
          <label className={`flex items-center justify-between gap-3 p-3 rounded-card border-2 ${isSuper ? 'border-amber-300 bg-amber-50' : 'border-border'} ${viewerIsSuper ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
            <div>
              <div className="font-extrabold text-ink text-[14px]">👑 {t('admin.role_super')}</div>
              <div className="text-[11.5px] text-fg-muted leading-relaxed mt-0.5">{t('admin.super_explainer')}</div>
            </div>
            <input type="checkbox" checked={isSuper} disabled={!viewerIsSuper}
              onChange={(e) => setIsSuper(e.target.checked)}
              className="w-5 h-5 accent-amber-500" />
          </label>

          {!isSuper && Object.entries(groups).map(([group, perms]) => {
            const allOn = perms.every((p) => granted.includes(p.key));
            return (
              <div key={group} className="bg-surface-alt rounded-card p-3 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-extrabold text-ink text-[13px]">
                    {t(`admin.perm_group.${group}`, group)}
                  </h4>
                  <button type="button" onClick={() => selectAllInGroup(group, !allOn)}
                    className="text-[11.5px] font-bold text-primary hover:underline">
                    {allOn ? t('admin.perm_clear_all') : t('admin.perm_select_all')}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {perms.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 p-2 rounded bg-surface hover:bg-primary-soft transition cursor-pointer">
                      <input type="checkbox" checked={granted.includes(p.key)}
                        onChange={() => toggle(p.key)} className="w-4 h-4 accent-primary" />
                      <span className="text-[12.5px] text-ink flex-1">{t(p.label, p.key)}</span>
                      {p.sensitive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-bold">{t('admin.perm_sensitive')}</span>}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="text-[11.5px] text-fg-subtle text-center pt-1">
            {t('admin.perm_total', { count: totalSelected, of: registry.length })}
          </div>
        </div>
      )}
    </Modal>
  );
}
