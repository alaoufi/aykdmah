import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listIntegrations, getIntegrationProviders, createIntegration,
  updateIntegration, deleteIntegration, testIntegration,
} from '../../services/integrationService';
import { apiError } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import EmptyState from '../../components/admin/EmptyState';
import AdminFab from '../../components/admin/AdminFab';
import { formatRelativeTime } from '../../utils/formatters';
import { localizedIntegrationText } from '../../data/referenceIntegrationLabels';

const TYPE_META = {
  sms:      { icon: '📱', labelKey: 'admin.verify_method_sms' },
  whatsapp: { icon: '💬', labelKey: 'admin.verify_method_whatsapp' },
  email:    { icon: '✉️', labelKey: 'admin.verify_method_email' },
  nafath:   { icon: '🆔', labelKey: 'admin.verify_method_nafath' },
  maps:     { icon: '🗺️', label: 'Maps' },
  payment:  { icon: '💳', label: 'Payment' },
  ai:       { icon: '🤖', label: 'AI' },
  delivery: { icon: '📦', label: 'Delivery' },
};

const EMPTY_FORM = {
  type: 'sms', provider: '', label: '', mode: 'sandbox',
  is_enabled: false, is_primary: false,
  config: {}, credentials: {}, webhook_url: '',
};

export default function AdminIntegrationsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const typeLabel = type => TYPE_META[type]?.labelKey
    ? t(TYPE_META[type].labelKey)
    : localizedIntegrationText(TYPE_META[type]?.label || type, lang);
  const modeLabel = mode => ['sandbox', 'live'].includes(mode) ? t(`integration.mode_${mode}`) : mode;
  const [items, setItems] = useState([]);
  const [providers, setProviders] = useState({});
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [testTarget, setTestTarget] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [confirm, setConfirm] = useState({ open: false });
  const editVersion = useRef(0);
  const saveInFlight = useRef(false);
  const testInFlight = useRef(false);

  const load = () => {
    setLoading(true);
    Promise.all([listIntegrations(), getIntegrationProviders()])
      .then(([its, prov]) => { setItems(its || []); setProviders(prov || {}); })
      .catch((e) => { setItems([]); setErr(apiError(e)); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const adapterFor = (type, provider) => {
    return (providers[type] || []).find(p => p.provider === provider);
  };

  const openCreate = () => {
    ++editVersion.current;
    const firstType = Object.keys(providers)[0] || 'sms';
    const firstProvider = providers[firstType]?.[0]?.provider || '';
    setEditing(null);
    setForm({ ...EMPTY_FORM, type: firstType, provider: firstProvider });
    setErr('');
    setEditOpen(true);
  };

  const savedKeys = new Set(editing?.credentials_set || []);

  const openEdit = (it) => {
    ++editVersion.current;
    setEditing(it);
    setForm({
      type: it.type, provider: it.provider, label: it.label || '',
      mode: it.mode, is_enabled: !!it.is_enabled, is_primary: !!it.is_primary,
      config: it.config || {}, credentials: { ...(it.credentials_public || {}) }, webhook_url: it.webhook_url || '',
    });
    setErr('');
    setEditOpen(true);
  };

  const closeEdit = () => {
    ++editVersion.current;
    setEditOpen(false); setEditing(null); setForm({ ...EMPTY_FORM, config: {}, credentials: {} }); setErr('');
  };

  const onSave = async () => {
    if (saveInFlight.current) return;
    const version = editVersion.current;
    saveInFlight.current = true;
    setSaving(true); setErr('');
    try {
      const payload = {
        ...form,
        credentials: Object.fromEntries(Object.entries(form.credentials || {})
          .filter(([, value]) => typeof value === 'string' && value.trim())),
      };
      // Don't send empty credentials — preserves the encrypted blob server-side
      if (!Object.values(payload.credentials || {}).some(v => v && String(v).trim())) {
        delete payload.credentials;
      }
      if (editing) await updateIntegration(editing.id, payload);
      else await createIntegration(payload);
      if (version !== editVersion.current) return;
      closeEdit();
      load();
    } catch (e) {
      if (version === editVersion.current) {
        setErr(String(e.response?.data?.message || '').startsWith('A key field contains a link') ? t('integration.secret_is_url') : apiError(e));
      }
    } finally { saveInFlight.current = false; setSaving(false); }
  };

  const onDelete = (it) => {
    setConfirm({
      open: true,
      title: t('admin.confirm_delete_title'),
      body: `${t('admin.confirm_delete_body')} (${it.provider})`,
      tone: 'danger',
      onConfirm: async () => {
        await deleteIntegration(it.id);
        setConfirm({ open: false });
        load();
      },
    });
  };

  const onTest = async (it) => {
    if (testInFlight.current) return;
    testInFlight.current = true;
    setTesting(true); setTestResult(null);
    try {
      const res = await testIntegration(it.id, { to: testTarget });
      setTestResult({ ok: true, ...res });
      load();
    } catch (e) {
      // The provider's own reason (secrets already stripped) helps the administrator fix the fields.
      const reason = e.response?.data?.message;
      setTestResult({ ok: false, message: typeof reason === 'string' && reason.startsWith('Provider: ') ? `${apiError(e)} — ${reason.slice(10)}` : apiError(e) });
    } finally { testInFlight.current = false; setTesting(false); }
  };

  const adapter = adapterFor(form.type, form.provider);

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('admin.integrations')} count={items.length}>
        <AdminButton variant="primary" icon="+" onClick={openCreate}>{t('admin.new')}</AdminButton>
      </AdminPageHeader>

      {!editOpen && err && <div role="alert" className="px-3 py-2 rounded bg-danger-soft text-danger text-[13px]">{err}</div>}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[110px] rounded-card bg-surface border border-border animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-surface rounded-card border border-border">
          <EmptyState icon="🔌" title={t('admin.no_results')} subtitle={t('integration.empty_hint')} />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.id} className="bg-surface border border-border rounded-card p-4 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-card bg-primary-soft grid place-items-center text-2xl shrink-0">
                  {TYPE_META[it.type]?.icon || '🔌'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-fg text-[15px]">{it.label || it.provider}</h3>
                    <span className="px-2 py-0.5 rounded-pill bg-surface-alt text-fg-muted text-[10.5px] font-bold uppercase">
                      {typeLabel(it.type)} / {it.provider}
                    </span>
                    {it.is_primary && (
                      <span className="px-2 py-0.5 rounded-pill bg-primary-soft text-primary text-[10.5px] font-bold">★ {t('integration.primary')}</span>
                    )}
                    <span className={`px-2 py-0.5 rounded-pill text-[10.5px] font-bold ${
                      it.is_enabled ? 'bg-success-soft text-success' : 'bg-surface-alt text-fg-subtle'
                    }`}>
                      {it.is_enabled ? t('integration.enabled') : t('integration.disabled')}
                    </span>
                    <span className="px-2 py-0.5 rounded-pill bg-info-soft text-info text-[10.5px] font-bold">{modeLabel(it.mode)}</span>
                  </div>
                  {it.credentials_masked && Object.keys(it.credentials_masked).length > 0 && (
                    <div className="text-[11.5px] text-fg-subtle mt-1 font-mono">
                      {Object.entries(it.credentials_masked).slice(0, 2).map(([k, v]) => {
                        const field = adapterFor(it.type, it.provider)?.fields?.find(candidate => candidate.key === k);
                        return `${localizedIntegrationText(field?.label || k, lang)}: ${v}`;
                      }).join('  ·  ')}
                    </div>
                  )}
                  {it.last_test_at && (
                    <div className="text-[11px] mt-1.5">
                      <span className={it.last_test_ok ? 'text-success' : 'text-danger'}>
                        {it.last_test_ok ? '✓' : '✗'} {t('integration.last_test')}
                      </span>
                      <span className="text-fg-subtle ms-2">{formatRelativeTime(it.last_test_at)}</span>
                      {it.last_test_message && <span className="text-fg-subtle ms-2">— {localizedIntegrationText(it.last_test_message, lang)}</span>}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
                <button onClick={() => openEdit(it)} className="px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-primary-soft text-primary hover:opacity-80">
                  {t('admin.edit')}
                </button>
                <button onClick={() => onTest(it)} disabled={testing}
                  className="px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-info-soft text-info hover:opacity-80 disabled:opacity-60">
                  {testing ? '…' : t('integration.test')}
                </button>
                <button onClick={() => onDelete(it)}
                  className="px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-danger-soft text-danger hover:opacity-80">
                  {t('admin.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {testResult && (
        <div className={`p-3 rounded-card text-[13px] ${testResult.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
          {testResult.ok ? '✓ ' + t('integration.test_ok') : '✗ ' + testResult.message}
        </div>
      )}

      <div className="bg-surface border border-border rounded-card p-4">
        <div className="text-[12.5px] font-bold text-fg mb-1">{t('integration.test_send_to')}</div>
        <input
          value={testTarget}
          onChange={(e) => setTestTarget(e.target.value)}
          placeholder="+9665XXXXXXXX / you@example.com"
          className="w-full px-3 py-2 rounded-card border border-border bg-surface-alt text-[14px]"
        />
      </div>

      <Modal
        open={editOpen}
        onClose={closeEdit}
        title={editing ? t('admin.edit') : t('admin.new')}
        width={620}
        footer={
          <>
            <button onClick={closeEdit} className="px-4 py-2 rounded-pill bg-surface hover:bg-surface-alt text-fg-muted text-[13px] font-semibold border border-border">{t('admin.cancel_btn')}</button>
            <button onClick={onSave} disabled={saving} className="px-4 py-2 rounded-pill text-primary-fg text-[13px] font-semibold bg-primary-grad disabled:opacity-60">
              {saving ? t('admin.saving') : t('admin.save')}
            </button>
          </>
        }
      >
        {err && <div className="mb-3 px-3 py-2 rounded bg-danger-soft text-danger text-[13px]">{err}</div>}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-bold text-fg mb-1">{t('integration.type')}</label>
              <select value={form.type} disabled={!!editing}
                onChange={(e) => {
                  const t = e.target.value;
                  const firstP = providers[t]?.[0]?.provider || '';
                  setForm({ ...form, type: t, provider: firstP, config: {}, credentials: {} });
                }}
                className="w-full px-3 py-2 rounded-card border border-border bg-surface-alt text-[14px]">
                {Object.keys(providers).map(tp => <option key={tp} value={tp}>{typeLabel(tp)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-fg mb-1">{t('integration.provider')}</label>
              <select value={form.provider} disabled={!!editing}
                onChange={(e) => setForm({ ...form, provider: e.target.value, config: {}, credentials: {} })}
                className="w-full px-3 py-2 rounded-card border border-border bg-surface-alt text-[14px]">
                <option value="">—</option>
                {(providers[form.type] || []).map(p => <option key={p.provider} value={p.provider}>{localizedIntegrationText(p.label, lang)}</option>)}
              </select>
            </div>
          </div>

          {adapter?.description && (
            <p className="text-[12px] text-fg-muted">{localizedIntegrationText(adapter.description, lang)}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-bold text-fg mb-1">{t('integration.label')}</label>
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                className="w-full px-3 py-2 rounded-card border border-border bg-surface-alt text-[14px]" />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-fg mb-1">{t('integration.mode')}</label>
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}
                className="w-full px-3 py-2 rounded-card border border-border bg-surface-alt text-[14px]">
                <option value="sandbox">{t('integration.mode_sandbox')}</option>
                <option value="live">{t('integration.mode_live')}</option>
              </select>
            </div>
          </div>

          {adapter && adapter.fields?.length > 0 && (
            <div className="bg-surface-alt p-3 rounded-card">
              <div className="text-[11.5px] font-bold text-fg-muted uppercase tracking-wider mb-2">{t('integration.credentials')}</div>
              {editing && (
                <p className="text-[11px] text-fg-subtle mb-2">{t('integration.credentials_hint')}</p>
              )}
              <div className="space-y-2">
                {adapter.fields.map(f => (
                  <div key={f.key}>
                    <label className="block text-[12px] text-fg mb-0.5">{localizedIntegrationText(f.label, lang)}{f.required && <span className="text-danger ms-1">*</span>}</label>
                    <input
                      type={f.sensitive ? 'password' : 'text'}
                      autoComplete={f.sensitive ? 'new-password' : 'off'}
                      value={form.credentials[f.key] || ''}
                      onChange={(e) => setForm({ ...form, credentials: { ...form.credentials, [f.key]: e.target.value } })}
                      placeholder={editing && savedKeys.has(f.key) ? `✓ ${t('integration.saved_value')}` : ''}
                      className="w-full px-3 py-2 rounded border border-border bg-surface text-[13.5px] font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {adapter && adapter.config_fields?.length > 0 && (
            <div>
              <div className="text-[11.5px] font-bold text-fg-muted uppercase tracking-wider mb-2">{t('integration.config')}</div>
              <div className="space-y-2">
                {adapter.config_fields.map(f => (
                  <div key={f.key}>
                    <label className="block text-[12px] text-fg mb-0.5">{localizedIntegrationText(f.label, lang)}</label>
                    <input
                      value={form.config[f.key] || ''}
                      onChange={(e) => setForm({ ...form, config: { ...form.config, [f.key]: e.target.value } })}
                      className="w-full px-3 py-2 rounded border border-border bg-surface-alt text-[14px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[12px] font-bold text-fg mb-1">{t('integration.webhook')}</label>
            <input value={form.webhook_url} onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
              placeholder="https://…"
              className="w-full px-3 py-2 rounded-card border border-border bg-surface-alt text-[14px] font-mono" />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={form.is_enabled}
                onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })} />
              <span>{t('integration.enabled')}</span>
            </label>
            <label className="inline-flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={form.is_primary}
                onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} />
              <span>★ {t('integration.primary')}</span>
            </label>
          </div>
        </div>
      </Modal>

      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
      <AdminFab onClick={openCreate} ariaLabel={t('admin.new')} />
    </div>
  );
}
