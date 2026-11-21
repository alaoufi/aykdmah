import { useAdminConfirmation } from '../../components/admin/confirmAdminChange';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listIntegrations, getIntegrationProviders, createIntegration,
  updateIntegration, deleteIntegration, testIntegration,
} from '../../services/integrationService';
import { apiError } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import EmptyState from '../../components/admin/EmptyState';
import AdminFab from '../../components/admin/AdminFab';
import { formatRelativeTime } from '../../utils/formatters';
import { localizedIntegrationText } from '../../data/referenceIntegrationLabels';
import { InfoButton, InfoPanel } from '../../components/common/InfoTip';

// AYK-415: a field's name with (i) beside it, a short line under it, and the full explanation in
// place. `label` may hold the field itself (a checkbox) when there is no `htmlFor`.
function HelpLabel({ htmlFor, label, short, info, className = 'block text-[12px] font-bold text-fg' }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="mb-1">
      <span className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className={className}>{label}</label>
        {info && <InfoButton open={open} onToggle={() => setOpen(v => !v)} controls={panelId} label={typeof label === 'string' ? label : ''} />}
      </span>
      {short && <div className="text-[12px] text-slate-500 mt-0.5 leading-snug" data-testid="field-short">{short}</div>}
      <InfoPanel id={panelId} open={open}>{info}</InfoPanel>
    </div>
  );
}

// The provider's own fields (server/services/integrations/*.js), explained by what the sending code
// does with each one. Secret values are never shown back; an empty box keeps the saved one.
const KEEP = 'عند التعديل: اترك الخانة فارغة لتبقى القيمة المحفوظة، أو اكتب قيمة جديدة لتستبدلها.';
function providerFieldHelp(type, key, sensitive) {
  if (sensitive) {
    return {
      short: 'مفتاح سري تأخذه من لوحة حسابك لدى المزوّد. يُحفظ مشفّرًا ولا يُعرض.',
      info: `انسخه من لوحة حسابك لدى المزوّد والصقه كما هو، دون مسافات، وهو المفتاح نفسه وليس رابطًا.\nيُحفظ مشفّرًا ولا يظهر بعد الحفظ إلا مختصرًا في البطاقة.\nبدونه لا يستطيع الموقع الإرسال عبر هذا المزوّد.\n${KEEP}`,
    };
  }
  const help = {
    account_sid: ['رقم تعريف حسابك لدى Twilio، يبدأ بحرفي AC.', 'تجده في الصفحة الرئيسية للوحة Twilio.\nيُرسل مع المفتاح السري لكل رسالة.'],
    from: type === 'email'
      ? ['البريد الذي تصل منه الرسائل، ويجب أن يكون موثّقًا لدى المزوّد.', 'مثال: no-reply@aykdmh.com.\nإن لم يكن موثّقًا لدى المزوّد يرفض الإرسال.']
      : ['رقم الإرسال الذي اشتريته لدى المزوّد، بالصيغة الدولية.', 'تصل رسائل الرموز من هذا الرقم.\nمثال: +15550000000.'],
    sender_name: ['اسم المرسل الذي يراه المستلم بدل الرقم، معتمد لدى المزوّد.', 'يجب أن يكون اسمًا معتمدًا في حسابك لدى المزوّد، وإلا تُرفض الرسائل.\nإن تركته فارغًا يُستخدم الاسم في «إعدادات إضافية»، ثم الاسم الافتراضي AyKhidma.'],
    sender: ['اسم المرسل الذي يراه المستلم، كما هو معتمد لدى المزوّد. مطلوب.', 'يجب أن يطابق اسم مرسل معتمدًا في حسابك لدى المزوّد حرفًا بحرف، وإلا تُرفض الرسائل.\nمثال: AyKhidma.'],
    api_url: ['اختياري: اتركه فارغًا ليُستخدم عنوان المزوّد المعتاد.', 'لا تملأه إلا إذا طلب منك المزوّد عنوانًا آخر.\nيُقبل فقط عنوان يبدأ بـ https ويكون على موقع المزوّد نفسه، وإلا يُرفض الحفظ.'],
    phone_number_id: ['رقم تعريف رقم الواتساب في حسابك لدى Meta (ليس رقم الجوال نفسه).', 'تجده في لوحة واتساب للأعمال لدى Meta، بجانب رقم الجوال المربوط.\nتُرسل منه رسائل الرموز.'],
    base_url: ['عنوان خدمة نفاذ لدى الجهة المزوّدة، يبدأ بـ https.', 'تعطيك إياه الجهة التي تربطك بنفاذ.\nيُقبل فقط عنوان آمن يبدأ بـ https من العناوين المسموح بها، وإلا يُرفض الحفظ.'],
    client_id: ['رقم تعريف حسابك لدى الجهة المزوّدة لنفاذ.', 'تعطيك إياه الجهة المزوّدة مع المفتاح السري.\nيُرسل مع كل طلب تحقق عبر نفاذ.'],
  }[key];
  if (!help) return { short: 'قيمة يطلبها هذا المزوّد؛ انسخها من لوحة حسابك لديه.', info: `انسخها كما هي من لوحة حسابك لدى المزوّد.\n${KEEP}` };
  return { short: help[0], info: `${help[1]}\n${KEEP}` };
}
function configFieldHelp(key) {
  const help = {
    sender_name: ['اسم مرسل احتياطي، يُستخدم إذا تُرك «Sender name» فارغًا.', 'إن تُرك الاثنان فارغين يُستخدم الاسم AyKhidma.\nيجب أن يكون معتمدًا لدى المزوّد.'],
    from_name: ['الاسم الذي يظهر للمستلم بجانب بريد المرسل.', 'مثال: «أي خدمة».\nإن تركته فارغًا يظهر AY KHIDMA.'],
    base_url: ['عنوان احتياطي لخدمة نفاذ، يُستخدم إذا تُرك «Base URL» فارغًا.', 'يُقبل فقط عنوان آمن يبدأ بـ https من العناوين المسموح بها.'],
    template_name: ['يُحفظ فقط؛ الإرسال الحالي لا يستخدمه ويرسل الرموز نصًا عاديًا.', 'هذا اسم قالب رسالة معتمد لدى Meta.\nالكود الحالي يحفظه ولا يقرؤه عند الإرسال، فلا يتغير شيء بملئه أو تركه.'],
    template_lang: ['يُحفظ فقط؛ الإرسال الحالي لا يستخدمه.', 'لغة قالب الرسالة لدى Meta (مثل ar أو en).\nالكود الحالي يحفظها ولا يقرؤها عند الإرسال.'],
  }[key];
  if (!help) return { short: 'إعداد يخص هذا المزوّد، ليس سرًّا.', info: 'يُحفظ كما تكتبه ويظهر عند التعديل.\nاتركه فارغًا إن لم يطلبه المزوّد.' };
  return { short: help[0], info: help[1] };
}

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
  const confirmAdminChange = useAdminConfirmation();
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
    if (!(await confirmAdminChange(t))) return;
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
        <HelpLabel htmlFor="integration-test-to" className="text-[12.5px] font-bold text-fg" label={t('integration.test_send_to')}
          short="الجوال أو البريد الذي تصله رسالة الاختبار عند الضغط على «اختبار»."
          info={'للرسائل النصية والواتساب: رقم جوال بالصيغة الدولية مثل +966500000000. للبريد: عنوان بريد.\nإن تركته فارغًا تُرسل إلى جوالك أو بريدك المسجّل في حسابك.\nاختبار نفاذ لا يستعمل هذه الخانة.\nالنتيجة تظهر فوقها، وتُحفظ مع الربط كـ«آخر اختبار».'} />
        <input
          id="integration-test-to"
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
              <HelpLabel htmlFor="integration-type" label={t('integration.type')}
                short="القناة التي يخدمها هذا الربط: رسائل نصية، واتساب، بريد، أو نفاذ."
                info={'يحدد الغرض: الرسائل النصية لرموز الدخول والتسجيل والتحقق من الجوال، والواتساب والبريد لرموز التحقق، ونفاذ للتحقق من الهوية.\nتغيير النوع يمسح الخانات التي كتبتها تحته.\nلا يمكن تغييره بعد الحفظ؛ احذف الربط وأنشئ غيره.'} />
              <select id="integration-type" value={form.type} disabled={!!editing}
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
              <HelpLabel htmlFor="integration-provider" label={t('integration.provider')}
                short="الشركة التي ترسل عبرها، ولك حساب لديها."
                info={'كل شركة تطلب خانات مختلفة تظهر أسفل بعد اختيارها.\nالخيارات المكتوب بجانبها dev only للتجارب فقط ولا تظهر في الموقع الحقيقي.\nلا يمكن تغييرها بعد الحفظ.'} />
              <select id="integration-provider" value={form.provider} disabled={!!editing}
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
              <HelpLabel htmlFor="integration-label" label={t('integration.label')}
                short="اسم تعرف به هذا الربط في القائمة. اختياري، لا يراه الزوار."
                info={'يظهر عنوانًا للبطاقة في هذه الصفحة فقط.\nمثال: «رسائل الرموز - الحساب الرئيسي».\nإن تركته فارغًا يظهر اسم المزوّد.'} />
              <input id="integration-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                className="w-full px-3 py-2 rounded-card border border-border bg-surface-alt text-[14px]" />
            </div>
            <div>
              <HelpLabel htmlFor="integration-mode" label={t('integration.mode')}
                short="علامة للتذكير فقط: تجريبي أم فعلي. لا تغيّر طريقة الإرسال."
                info={'تظهر شارة على البطاقة لتعرف هل المفاتيح تجريبية أم حقيقية.\nالموقع لا يغيّر شيئًا في الإرسال بحسبها: الرسائل تُرسل فعلًا متى كان الربط «مفعّلًا» ومفاتيحه صحيحة.\nالقيمة الافتراضية «تجريبي».'} />
              <select id="integration-mode" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}
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
                {adapter.fields.map(f => {
                  const help = providerFieldHelp(form.type, f.key, f.sensitive);
                  return (
                  <div key={f.key}>
                    <HelpLabel htmlFor={`integration-cred-${f.key}`} className="block text-[12px] text-fg"
                      label={<>{localizedIntegrationText(f.label, lang)}{f.required && <span className="text-danger ms-1">*</span>}</>}
                      short={help.short} info={help.info} />
                    <input
                      id={`integration-cred-${f.key}`}
                      type={f.sensitive ? 'password' : 'text'}
                      autoComplete={f.sensitive ? 'new-password' : 'off'}
                      value={form.credentials[f.key] || ''}
                      onChange={(e) => setForm({ ...form, credentials: { ...form.credentials, [f.key]: e.target.value } })}
                      placeholder={editing && savedKeys.has(f.key) ? `✓ ${t('integration.saved_value')}` : ''}
                      className="w-full px-3 py-2 rounded border border-border bg-surface text-[13.5px] font-mono"
                    />
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {adapter && adapter.config_fields?.length > 0 && (
            <div>
              <div className="text-[11.5px] font-bold text-fg-muted uppercase tracking-wider mb-2">{t('integration.config')}</div>
              <div className="space-y-2">
                {adapter.config_fields.map(f => {
                  const help = configFieldHelp(f.key);
                  return (
                  <div key={f.key}>
                    <HelpLabel htmlFor={`integration-config-${f.key}`} className="block text-[12px] text-fg"
                      label={localizedIntegrationText(f.label, lang)} short={help.short} info={help.info} />
                    <input
                      id={`integration-config-${f.key}`}
                      value={form.config[f.key] || ''}
                      onChange={(e) => setForm({ ...form, config: { ...form.config, [f.key]: e.target.value } })}
                      className="w-full px-3 py-2 rounded border border-border bg-surface-alt text-[14px]"
                    />
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <HelpLabel htmlFor="integration-webhook" label="عنوان استقبال التنبيهات من المزوّد"
              short="يُحفظ فقط؛ الموقع لا يستعمله حاليًا. يمكن تركه فارغًا."
              info={'هو عنوان صفحة يرسل إليها المزوّد أخبارًا مثل «وصلت الرسالة».\nالكود الحالي يحفظه مع الربط ولا يستعمله في الإرسال ولا في الاستقبال، فملؤه أو تركه لا يغيّر شيئًا.\nإن ملأته فيبدأ بـ https.'} />
            <input id="integration-webhook" value={form.webhook_url} onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
              placeholder="https://…"
              className="w-full px-3 py-2 rounded-card border border-border bg-surface-alt text-[14px] font-mono" />
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[220px]">
              <HelpLabel className="inline-flex items-center gap-2 text-[13px]"
                label={<><input type="checkbox" checked={form.is_enabled}
                  onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })} />
                  <span>{t('integration.enabled')}</span></>}
                short="لا يُرسل الموقع عبر هذا الربط إلا وهو مفعّل."
                info={'مفعّل: يستعمله الموقع لإرسال الرموز من نوعه.\nموقوف: يبقى محفوظًا ولا يُستعمل، وزر «اختبار» يبقى يعمل.\nإن لم يكن هناك ربط مفعّل من نوع ما، تتوقف رسائل ذلك النوع وتظهر للمستخدم رسالة أن الخدمة غير مهيأة.'} />
            </div>
            <div className="flex-1 min-w-[220px]">
              <HelpLabel className="inline-flex items-center gap-2 text-[13px]"
                label={<><input type="checkbox" checked={form.is_primary}
                  onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} />
                  <span>★ {t('integration.primary')}</span></>}
                short="إن كان لديك أكثر من ربط مفعّل من النوع نفسه، يُقدَّم هذا."
                info={'يُستعمل ربط واحد فقط لكل نوع: الرئيسي المفعّل أولًا، وإلا الأقدم بين المفعّلة.\nتأشيره هنا يزيل «رئيسي» عن غيره من النوع نفسه تلقائيًا.\nالرئيسي الموقوف لا يُستعمل.'} />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
      <AdminFab onClick={openCreate} ariaLabel={t('admin.new')} />
    </div>
  );
}
