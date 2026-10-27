import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSettings, updateSettings, applyMigrations } from '../../services/adminService';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import { apiError } from '../../services/api';
import { localizedSettingLabel } from '../../data/settingLabels';

const GROUP_ICONS = {
  general: '⚙️',
  auth: '🔐',
  map: '🗺️',
  requests: '📋',
  payments: '💳',
  notifications: '🔔',
  files: '📎',
  system: '🛠️',
};

// Settings that already render through dedicated controls inside the
// Auth tab (chip toggles, test-mode switch). Hide them from the
// generic key/value list so each option only appears once.
const HANDLED_BY_CUSTOM_UI = new Set([
  'auth_methods_enabled',
  'verify_methods_enabled',
  'verify_block_until_verified',
  'verify_required_for_provider',
  'verify_required_for_client',
]);

export default function AdminSettingsPage() {
  const { t } = useTranslation();
  const TABS = [
    { key: 'auth',          label: t('admin.settings_auth') },
    { key: 'general',       label: t('admin.settings_general') },
    { key: 'map',           label: t('admin.settings_map') },
    { key: 'requests',      label: t('admin.settings_requests') },
    { key: 'payments',      label: t('admin.settings_payments') },
    { key: 'notifications', label: t('admin.settings_notifications') },
    { key: 'files',         label: t('admin.settings_files') },
    { key: 'system',        label: t('admin.system_maintenance') },
  ];

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);
  const [activeTab, setActiveTab] = useState('auth');
  const [loaded, setLoaded] = useState(false);
  const mutationInFlight = useRef(false);

  const runMigrations = async () => {
    if (mutationInFlight.current) return;
    if (!confirm(t('admin.migrate_confirm'))) return;
    mutationInFlight.current = true;
    setMigrating(true);
    setMigrationResult(null);
    try {
      const res = await applyMigrations();
      setMigrationResult({ ok: true, applied: res.applied || [] });
      setMsg({ type: 'success', text: t('admin.migrate_done') });
    } catch (e) {
      setMigrationResult({ ok: false, error: apiError(e) });
      setMsg({ type: 'error', text: apiError(e) });
    } finally { mutationInFlight.current = false; setMigrating(false); }
  };

  useEffect(() => {
    getSettings()
      .then((data) => { setItems(data || []); setLoaded(true); })
      .catch((e) => setMsg({ type: 'error', text: apiError(e) }))
      .finally(() => setLoading(false));
  }, []);

  const update = (key, value) => {
    setItems((prev) => prev.map((it) => (it.setting_key === key ? { ...it, setting_value: value } : it)));
  };

  const onSave = async () => {
    if (!loaded || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setSaving(true);
    setMsg(null);
    try {
      const payload = items.map((it) => ({
        key: it.setting_key,
        value: it.setting_value,
      }));
      await updateSettings(payload);
      setMsg({ type: 'success', text: t('admin.saved') });
    } catch (e) {
      setMsg({ type: 'error', text: t('errors.generic') });
    } finally {
      setSaving(false);
      mutationInFlight.current = false;
      setTimeout(() => setMsg(null), 3500);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[200px] rounded-card bg-white border border-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  // Group items by setting_group (excluding ones handled by custom UI).
  const groups = Object.create(null);
  for (const it of items) {
    if (HANDLED_BY_CUSTOM_UI.has(it.setting_key)) continue;
    const g = it.setting_group || 'general';
    if (!groups[g]) groups[g] = [];
    groups[g].push(it);
  }

  // Helpers reused by the Auth tab's special widgets.
  const get = (k) => items.find((it) => it.setting_key === k)?.setting_value ?? '';
  const toList = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  const hasIn  = (csv, k) => toList(csv).includes(k);
  const toggleIn = (csv, k) => {
    const set = new Set(toList(csv));
    if (set.has(k)) set.delete(k); else set.add(k);
    return Array.from(set).join(',');
  };
  // Setting may not exist yet on the DB (added by a later migration).
  // Append it on the fly so the chip-state is immediately visible and
  // gets persisted when the user hits Save.
  const setOrAdd = (key, value, group = 'auth') => {
    setItems((prev) => {
      if (prev.some((it) => it.setting_key === key)) {
        return prev.map((it) => (it.setting_key === key ? { ...it, setting_value: value } : it));
      }
      return [...prev, {
        setting_key: key, setting_value: value, setting_type: 'string',
        setting_group: group, is_public: 1, description: '',
      }];
    });
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <AdminPageHeader title={t('admin.settings')}>
        <button
          onClick={onSave}
          disabled={saving || migrating || !loaded}
          className="px-6 py-3 rounded-pill text-white text-[14px] font-bold shadow-soft hover:shadow-lift transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}
        >
          {saving ? t('admin.saving') : `✓ ${t('admin.save')}`}
        </button>
      </AdminPageHeader>

      {msg && (
        <div
          className={`px-4 py-3 rounded-card text-[13.5px] font-semibold ${
            msg.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border border-rose-200 text-rose-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Sticky horizontal tab strip — mobile-first */}
      <div className="bg-white rounded-card border border-slate-100 shadow-soft sticky top-0 z-10">
        <div className="flex gap-1 overflow-x-auto no-scrollbar p-2">
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            // Show a small dot when the tab has settings in it.
            const dot = tab.key === 'system' ? false : (groups[tab.key]?.length || 0) > 0;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-pill text-[13px] font-semibold transition ${
                  active
                    ? 'text-white shadow-soft'
                    : 'text-slate-600 hover:text-brand-700 hover:bg-slate-50'
                }`}
                style={active ? { background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' } : undefined}
              >
                <span>{GROUP_ICONS[tab.key]}</span>
                <span>{tab.label}</span>
                {dot && !active && <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* === AUTH TAB === */}
      {activeTab === 'auth' && (
        <div className="space-y-4">
          {/* Sign-in & verification method chips */}
          {(() => {
            const SIGNIN_METHODS = [
              { key: 'username', icon: '🆔', label: t('auth.username') },
              { key: 'email',    icon: '📧', label: t('auth.email') },
              { key: 'phone',    icon: '📱', label: t('auth.phone') },
              { key: 'facebook', icon: '🟦', label: 'Facebook' },
            ];
            const VERIFY_METHODS = [
              { key: 'nafath',   icon: '🪪', label: t('admin.verify_method_nafath') },
              { key: 'sms',      icon: '💬', label: t('admin.verify_method_sms') },
              { key: 'whatsapp', icon: '🟢', label: t('admin.verify_method_whatsapp') },
              { key: 'email',    icon: '📧', label: t('admin.verify_method_email') },
              { key: 'facebook', icon: '🟦', label: 'Facebook' },
            ];
            const signinCsv = items.some((it) => it.setting_key === 'auth_methods_enabled')
              ? get('auth_methods_enabled') : 'username,email,phone,facebook';
            const verifyCsv = get('verify_methods_enabled');

            const MethodChip = ({ active, icon, label, onClick }) => (
              <button
                type="button"
                onClick={onClick}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-card border-2 transition text-[13px] font-bold ${
                  active
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                <span className="text-base">{icon}</span>
                <span className="flex-1 text-start">{label}</span>
                <span className={`inline-block w-4 h-4 rounded-full border-2 ${active ? 'bg-brand-500 border-brand-500' : 'border-slate-300'}`}>
                  {active && <span className="block text-white text-[10px] leading-4 text-center">✓</span>}
                </span>
              </button>
            );

            return (
              <div className="bg-white rounded-card border border-slate-100 shadow-soft overflow-hidden">
                <div className="px-5 md:px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <span className="text-xl">🔑</span>
                  <h3 className="text-ink font-extrabold text-[15px]">{t('admin.auth_methods_title')}</h3>
                </div>
                <div className="p-5 md:p-6 space-y-5">
                  <div>
                    <div className="text-[13px] font-bold text-ink mb-1">{t('admin.signin_methods')}</div>
                    <p className="text-[12px] text-slate-500 mb-3">{t('admin.signin_methods_hint')}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {SIGNIN_METHODS.map((m) => (
                        <MethodChip key={m.key} icon={m.icon} label={m.label}
                          active={hasIn(signinCsv, m.key)}
                          onClick={() => setOrAdd('auth_methods_enabled', toggleIn(signinCsv, m.key))} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[13px] font-bold text-ink mb-1">{t('admin.verify_methods')}</div>
                    <p className="text-[12px] text-slate-500 mb-3">{t('admin.verify_methods_hint')}</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      {VERIFY_METHODS.map((m) => (
                        <MethodChip key={m.key} icon={m.icon} label={m.label}
                          active={hasIn(verifyCsv, m.key)}
                          onClick={() => setOrAdd('verify_methods_enabled', toggleIn(verifyCsv, m.key))} />
                      ))}
                    </div>
                  </div>
                  <p className="text-[11.5px] text-slate-400">{t('admin.method_save_reminder')}</p>
                </div>
              </div>
            );
          })()}

          {/* Test mode toggle */}
          {(() => {
            const isTestMode =
              (get('verify_block_until_verified') || 'false') === 'false' &&
              !get('verify_required_for_provider') &&
              !get('verify_required_for_client');
            const toggle = async () => {
              if (!loaded || mutationInFlight.current) return;
              mutationInFlight.current = true;
              setSaving(true);
              const next = !isTestMode;
              const mk = (key, value) => ({ key, value });
              const payload = next
                ? [
                    mk('verify_block_until_verified', 'false', 'boolean'),
                    mk('verify_required_for_provider', '', 'string'),
                    mk('verify_required_for_client', '', 'string'),
                  ]
                : [
                    mk('verify_block_until_verified', 'true', 'boolean'),
                    mk('verify_required_for_provider', 'sms', 'string'),
                    mk('verify_required_for_client', '', 'string'),
                  ];
              try {
                const updated = await updateSettings(payload);
                setItems(updated || []);
                setMsg({ type: 'success', text: t('admin.saved') });
              } catch (e) {
                setMsg({ type: 'error', text: apiError(e) || t('errors.generic') });
              } finally { mutationInFlight.current = false; setSaving(false); }
            };
            return (
              <div className={`rounded-card border-2 shadow-soft overflow-hidden ${isTestMode ? 'border-amber-400 bg-amber-50' : 'border-slate-100 bg-white'}`}>
                <div className="px-5 md:px-6 py-4 flex items-center gap-3">
                  <span className="text-2xl">{isTestMode ? '🧪' : '🛡️'}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-ink font-extrabold text-[15px]">{t('admin.test_mode_title')}</h3>
                    <p className="text-slate-600 text-[12.5px] mt-0.5">
                      {isTestMode ? t('admin.test_mode_on_hint') : t('admin.test_mode_off_hint')}
                    </p>
                  </div>
                  <button
                    onClick={toggle}
                    disabled={saving || migrating || !loaded}
                    role="switch"
                    aria-checked={isTestMode}
                    className={`relative w-14 h-8 rounded-full transition shrink-0 ${isTestMode ? 'bg-amber-500' : 'bg-slate-300'}`}
                  >
                    <span
                      className="absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all"
                      style={{ insetInlineStart: isTestMode ? 'calc(100% - 1.75rem)' : '0.25rem' }}
                    />
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Remaining auth-group key/value rows (badge fees, OTP TTL, etc.) */}
          {groups.auth?.length > 0 && (
            <SettingGroupCard
              icon={GROUP_ICONS.auth}
              title={t('admin.settings_auth')}
              items={groups.auth}
              update={update}
              t={t}
            />
          )}
        </div>
      )}

      {/* === GENERIC TABS (general / map / requests / payments / notifications / files) === */}
      {['general', 'map', 'requests', 'payments', 'notifications', 'files'].includes(activeTab) && (
        groups[activeTab]?.length > 0 ? (
          <SettingGroupCard
            icon={GROUP_ICONS[activeTab]}
            title={TABS.find((x) => x.key === activeTab)?.label}
            items={groups[activeTab]}
            update={update}
            t={t}
          />
        ) : (
          <EmptyTab icon={GROUP_ICONS[activeTab]} title={TABS.find((x) => x.key === activeTab)?.label} hint={t('admin.no_settings_in_group')} />
        )
      )}

      {/* === SYSTEM TAB === */}
      {activeTab === 'system' && (
        <div className="bg-white rounded-card border border-slate-100 shadow-soft overflow-hidden">
          <div className="px-5 md:px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <span className="text-xl">🛠️</span>
            <h3 className="text-ink font-extrabold text-[15px]">{t('admin.system_maintenance')}</h3>
          </div>
          <div className="px-5 md:px-6 py-4">
            <p className="text-slate-600 text-[13px] mb-3">{t('admin.migrate_hint')}</p>
            <button
              onClick={runMigrations}
              disabled={migrating || saving}
              className="px-5 py-2.5 rounded-pill text-white text-[13.5px] font-bold shadow-soft hover:shadow-lift disabled:opacity-60 transition"
              style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}
            >
              {migrating ? '⏳ ' + t('admin.migrate_running') : '🛠️ ' + t('admin.migrate_run')}
            </button>
            {migrationResult?.ok && (
              <div className="mt-3 p-3 rounded-card bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12.5px]">
                <div className="font-bold mb-1">✓ {t('admin.migrate_applied', { count: migrationResult.applied.length })}</div>
                <ul className="font-mono text-[11.5px] space-y-0.5">
                  {migrationResult.applied.map((m) => (
                    <li key={m.file}>{m.file} — {t('admin.migrate_ok_count', { count: m.ok })}, {t('admin.migrate_skipped_count', { count: m.skipped })}</li>
                  ))}
                </ul>
              </div>
            )}
            {migrationResult?.ok === false && (
              <div className="mt-3 p-3 rounded-card bg-rose-50 border border-rose-200 text-rose-700 text-[12.5px]">
                ✗ {migrationResult.error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingGroupCard({ icon, title, items, update, t }) {
  return (
    <div className="bg-white rounded-card border border-slate-100 shadow-soft overflow-hidden">
      <div className="px-5 md:px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <h3 className="text-ink font-extrabold text-[15px]">{title}</h3>
      </div>
      <div className="p-5 md:p-6 space-y-4">
        {items.map((it) => (
          <SettingRow key={it.setting_key} it={it} update={update} t={t} />
        ))}
      </div>
    </div>
  );
}

function SettingRow({ it, update, t }) {
  const { i18n } = useTranslation();
  const isBool = it.setting_type === 'boolean';
  const isLong = it.setting_type === 'text' || String(it.setting_value || '').length > 80;
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] items-start md:items-center gap-2 md:gap-4 pb-4 border-b border-slate-50 last:border-0 last:pb-0">
      <div>
        <label className="text-[13.5px] font-bold text-ink block">
          {localizedSettingLabel(it, i18n.resolvedLanguage)}
        </label>
        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{it.setting_key}</div>
      </div>
      <div>
        {isBool ? (
          <label className="inline-flex items-center gap-3 cursor-pointer">
            <span className="relative inline-block w-12 h-7 rounded-full transition" style={{
              background: (it.setting_value === 'true' || it.setting_value === true) ? 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' : '#e2e8f0',
            }}>
              <input
                type="checkbox"
                checked={it.setting_value === 'true' || it.setting_value === true}
                onChange={(e) => update(it.setting_key, e.target.checked ? 'true' : 'false')}
                className="sr-only"
              />
              <span
                className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all"
                style={{
                  insetInlineStart: (it.setting_value === 'true' || it.setting_value === true) ? 'calc(100% - 26px)' : '2px',
                }}
              />
            </span>
            <span className="text-[13px] font-semibold text-slate-600">
              {(it.setting_value === 'true' || it.setting_value === true) ? t('common.yes') : t('common.no')}
            </span>
          </label>
        ) : isLong ? (
          <textarea
            value={it.setting_value || ''}
            onChange={(e) => update(it.setting_key, e.target.value)}
            rows={3}
            className="w-full px-4 py-2.5 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none text-[14px] transition resize-y"
          />
        ) : (
          <input
            type={it.setting_type === 'number' ? 'number' : 'text'}
            value={it.setting_value || ''}
            onChange={(e) => update(it.setting_key, e.target.value)}
            className="w-full px-4 py-2.5 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none text-[14px] transition"
          />
        )}
      </div>
    </div>
  );
}

function EmptyTab({ icon, title, hint }) {
  return (
    <div className="bg-white rounded-card border border-slate-100 shadow-soft px-6 py-12 text-center">
      <div className="text-4xl mb-2">{icon}</div>
      <h3 className="font-extrabold text-ink text-[15px]">{title}</h3>
      <p className="text-slate-500 text-[12.5px] mt-1">{hint}</p>
    </div>
  );
}
