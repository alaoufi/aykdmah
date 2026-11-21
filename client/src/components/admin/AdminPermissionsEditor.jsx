import { useAdminConfirmation } from './confirmAdminChange';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  adminListPermissions, adminGetUserPermissions, adminUpdateUserPermissions,
} from '../../services/adminService';
import { apiError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import Modal from '../common/Modal';

// Permission picker for one admin user (AYK-359, the owner: «إدارة عامة / إدارة مخصصة، وفيها كل
// الأقسام أو تحديد أقسام أو تحديد تبويبات»):
//   • إدارة عامة      is_super_admin: everything, managing other administration accounts included.
//   • إدارة مخصصة:
//       كل الأقسام     '*'            every section, and sections added later;
//       تحديد أقسام    'group:<name>' whole sections, and tabs added to them later;
//       تحديد تبويبات  single keys    only the ticked tabs.
//   Managing other administration accounts (admins.manage) is never part of a wide grant; it is its
//   own box. The admin area is Arabic only (AYK-295).
const ALL = '*';
const ADMINS_KEY = 'admins.manage';
const groupGrant = group => `group:${group}`;

function modeOf(isSuper, grants) {
  if (isSuper) return 'super';
  if (grants.includes(ALL)) return 'all';
  const keys = grants.filter(k => k !== ADMINS_KEY && !k.startsWith('group:'));
  if (grants.some(k => k.startsWith('group:')) && !keys.length) return 'sections';
  return 'tabs';
}

export default function AdminPermissionsEditor({ open, userId, userName, onClose, onSaved }) {
  const { t } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const { isSuperAdmin: viewerIsSuper } = useAuth();
  const [registry, setRegistry] = useState([]);
  const [mode, setMode] = useState('tabs');
  const [sections, setSections] = useState([]);
  const [granted, setGranted] = useState([]);
  const [admins, setAdmins] = useState(false);
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
    setRegistry([]); setGranted([]); setSections([]); setAdmins(false); setMode('tabs');
    if (!open || !userId) return () => { active = false; };
    setLoading(true); setError('');
    Promise.all([adminListPermissions(), adminGetUserPermissions(userId)])
      .then(([reg, u]) => {
        if (!active) return;
        if (!Array.isArray(reg) || !u || !Array.isArray(u.permissions)) throw new Error(t('errors.generic'));
        const grants = u.permissions;
        setRegistry(reg);
        setMode(modeOf(!!u.is_super_admin, grants));
        setAdmins(grants.includes(ADMINS_KEY));
        setSections(grants.filter(k => k.startsWith('group:')).map(k => k.slice(6)));
        // Tabs: the single ones, plus every tab of a whole section (so switching to tabs shows them).
        const fromSections = reg.filter(p => p.key !== ADMINS_KEY && (grants.includes(ALL) || grants.includes(groupGrant(p.group)))).map(p => p.key);
        setGranted([...new Set([...grants.filter(k => k !== ADMINS_KEY && !k.startsWith('group:') && k !== ALL), ...fromSections])]);
        setLoadedUserId(userId);
      })
      .catch((e) => { if (active) setError(apiError(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, userId, t]);

  const toggle = (key) => setGranted((g) => g.includes(key) ? g.filter((k) => k !== key) : [...g, key]);
  const toggleSection = (group) => setSections((g) => g.includes(group) ? g.filter((k) => k !== group) : [...g, group]);
  const selectAllInGroup = (group, on) => {
    const keys = registry.filter((p) => p.group === group && p.key !== ADMINS_KEY).map((p) => p.key);
    setGranted((g) => on ? [...new Set([...g, ...keys])] : g.filter((k) => !keys.includes(k)));
  };

  const chosen = () => {
    const extra = admins ? [ADMINS_KEY] : [];
    if (mode === 'all') return [ALL, ...extra];
    if (mode === 'sections') return [...sections.map(groupGrant), ...extra];
    if (mode === 'tabs') return [...granted.filter(k => k !== ADMINS_KEY), ...extra];
    return [];
  };
  const nothingChosen = mode !== 'super' && chosen().length === 0;

  const save = async () => {
    if (nothingChosen) { setError('اختر قسمًا أو تبويبًا واحدًا على الأقل، وإلا فلن يدخل الإدارة.'); return; }
    if (!(await confirmAdminChange(t))) return;
    if (!open || !userId || loadedUserId !== userId || loading || saveInFlight.current) return;
    const savedUserId = userId;
    const version = sessionVersion.current;
    saveInFlight.current = true;
    setSaving(true); setError('');
    try {
      await adminUpdateUserPermissions(savedUserId, { is_super_admin: mode === 'super' ? 1 : 0, permissions: chosen() });
      if (targetRef.current !== savedUserId || version !== sessionVersion.current) return;
      onSaved && onSaved();
      onClose && onClose();
    } catch (e) { if (targetRef.current === savedUserId && version === sessionVersion.current) setError(apiError(e)); }
    finally { saveInFlight.current = false; setSaving(false); }
  };

  const groups = registry.reduce((acc, p) => {
    (acc[p.group] = acc[p.group] || []).push(p);
    return acc;
  }, Object.create(null));
  const groupName = (group) => t(`admin.perm_group.${group}`, group);

  const choice = (value, title, hint, disabled = false) => (
    <label className={`flex items-start gap-3 p-3 rounded-card border-2 transition ${mode === value ? 'border-primary bg-primary-soft' : 'border-border bg-surface'} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input type="radio" name="admin-mode" value={value} checked={mode === value} disabled={disabled}
        onChange={() => { setMode(value); setError(''); }} className="w-5 h-5 mt-0.5 accent-primary" data-testid={`mode-${value}`} />
      <span className="flex-1">
        <span className="block font-extrabold text-ink text-[14px]">{title}</span>
        <span className="block text-[11.5px] text-fg-muted leading-relaxed mt-0.5">{hint}</span>
      </span>
    </label>
  );

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
      {error && <div role="alert" className="mb-3 px-3 py-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[13px]">{error}</div>}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-card bg-surface-alt animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {choice('super', '👑 إدارة عامة', 'كل شيء في الإدارة، ومنه إدارة حسابات الإدارة الأخرى وصلاحياتها.' + (viewerIsSuper ? '' : ' (يمنحها صاحب إدارة عامة فقط)'), !viewerIsSuper)}

          <div className="rounded-card border-2 border-border p-3 space-y-2">
            <div className="font-extrabold text-ink text-[14px]">🧩 إدارة مخصصة</div>
            {choice('all', '📚 كل الأقسام', 'يدخل كل الأقسام، وأي قسم يُضاف مستقبلًا يصله تلقائيًا.')}
            {choice('sections', '🗂️ تحديد أقسام', 'يدخل الأقسام التي تختارها كاملة، وأي تبويب يُضاف لها مستقبلًا يصله تلقائيًا.')}
            {choice('tabs', '📑 تحديد تبويبات', 'يدخل التبويبات التي تختارها فقط.')}

            {mode === 'sections' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1" data-testid="sections-list">
                {Object.entries(groups).map(([group, perms]) => (
                  <label key={group} className="flex items-center gap-2 p-2.5 rounded bg-surface-alt hover:bg-primary-soft transition cursor-pointer">
                    <input type="checkbox" checked={sections.includes(group)} onChange={() => toggleSection(group)} className="w-4 h-4 accent-primary" />
                    <span className="text-[13px] font-bold text-ink flex-1">{groupName(group)}</span>
                    <span className="text-[11px] text-fg-subtle">{perms.filter(p => p.key !== ADMINS_KEY).length} تبويب</span>
                  </label>
                ))}
              </div>
            )}

            {mode === 'tabs' && Object.entries(groups).map(([group, perms]) => {
              const list = perms.filter(p => p.key !== ADMINS_KEY);
              if (!list.length) return null;
              const allOn = list.every((p) => granted.includes(p.key));
              return (
                <div key={group} className="bg-surface-alt rounded-card p-3 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-extrabold text-ink text-[13px]">{groupName(group)}</h4>
                    <button type="button" onClick={() => selectAllInGroup(group, !allOn)} className="text-[11.5px] font-bold text-primary hover:underline">
                      {allOn ? t('admin.perm_clear_all') : t('admin.perm_select_all')}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {list.map((p) => (
                      <label key={p.key} className="flex items-center gap-2 p-2 rounded bg-surface hover:bg-primary-soft transition cursor-pointer">
                        <input type="checkbox" checked={granted.includes(p.key)} onChange={() => toggle(p.key)} className="w-4 h-4 accent-primary" />
                        <span className="text-[12.5px] text-ink flex-1">{t(p.label, p.key)}</span>
                        {p.sensitive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-bold">{t('admin.perm_sensitive')}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}

            {mode !== 'super' && (
              <label className="flex items-center gap-2 p-2.5 rounded border border-rose-200 bg-rose-50 cursor-pointer">
                <input type="checkbox" checked={admins} onChange={(e) => setAdmins(e.target.checked)} className="w-4 h-4 accent-rose-600" />
                <span className="text-[12.5px] text-ink flex-1">👥 إدارة حسابات الإدارة الأخرى وصلاحياتها</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-bold">{t('admin.perm_sensitive')}</span>
              </label>
            )}
          </div>

          {nothingChosen && <div className="text-[12px] text-amber-800 text-center">⚠️ لم تختر شيئًا بعد، ولن يدخل الإدارة حتى تختار.</div>}
        </div>
      )}
    </Modal>
  );
}
