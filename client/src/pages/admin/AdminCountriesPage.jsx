import { useAdminConfirmation } from '../../components/admin/confirmAdminChange';
import { localizedName } from '../../utils/localize';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  adminListCountries, adminCreateCountry, adminUpdateCountry, adminDeleteCountry,
} from '../../services/adminService';
import { apiError } from '../../services/api';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import EmptyState from '../../components/admin/EmptyState';
import ConfirmDialog from '../../components/admin/AdminConfirmDialog';
import Modal from '../../components/common/Modal';
import AdminFab from '../../components/admin/AdminFab';
import { InfoButton, InfoPanel } from '../../components/common/InfoTip';

const SUPPORTED_LANGS = [
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
  { code: 'ur', label: 'اردو' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ml', label: 'മലയാളം' },
  { code: 'fil', label: 'Filipino' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'ne', label: 'नेपाली' },
  { code: 'am', label: 'አማርኛ' },
  { code: 'tr', label: 'Türkçe' },
];

// AYK-415: a short line under each field's name, and (i) for the full explanation.
const HELP = {
  code: {
    short: 'حرفان إنجليزيان بالترميز الدولي يميّزان الدولة، مثل SA للسعودية.',
    info: 'رمز الدولة الدولي من حرفين إنجليزيين. يستعمله الموقع ليتعرّف على دولة الزائر من موقعه أو من اتصاله بالإنترنت ويربطه بمناطقها.\nيُكتب بحروف كبيرة تلقائيًا، ولا يُقبل إلا حرفان. مثال: SA للسعودية، AE للإمارات.\nحقل إلزامي، ولا يتكرر لدولتين.',
  },
  flag: {
    short: 'رمز علم الدولة (إيموجي) يظهر بجانب اسمها، مثل 🇸🇦.',
    info: 'يظهر بجانب اسم الدولة في بطاقتها هنا وعند تحديد الموقع على الخريطة.\nانسخ رمز العلم والصقه هنا، مثل 🇸🇦.\nإن تُرك فارغًا يظهر علم أبيض في بطاقة الدولة.',
  },
  name_ar: {
    short: 'اسم الدولة كما يراه الزوار، ويُترجم تلقائيًا إلى لغات الموقع.',
    info: 'الاسم الأساسي للدولة. بعد الحفظ يترجمه الموقع تلقائيًا إلى لغاته الإحدى عشرة، وتُعاد الترجمة كلما غيّرته.\nحقل إلزامي، حتى 80 حرفًا. مثال: المملكة العربية السعودية.',
  },
  name_en: {
    short: 'الاسم بالإنجليزية، احتياطي يظهر إذا لم تتوفر ترجمة بلغة الزائر.',
    info: 'الترجمة التلقائية من الاسم العربي تتقدم عادة على هذا الاسم، فيُستعمل هو حين لا تتوفر ترجمة بلغة الزائر.\nحقل إلزامي، حتى 80 حرفًا. مثال: Saudi Arabia.',
  },
  dial: {
    short: 'مفتاح الاتصال الدولي للدولة، مثل ‎+966.',
    info: 'يُحفظ مع بيانات الدولة ويظهر في بطاقتها في هذه الصفحة بجانب رمز الهاتف.\nلا يغيّر حاليًا طريقة كتابة أرقام الجوال في الموقع.\nحتى 8 خانات، مثال: ‎+966. يمكن تركه فارغًا.',
  },
  currency_code: {
    short: 'رمز العملة الدولي من 3 أحرف إنجليزية، مثل SAR.',
    info: 'تظهر الأسعار في الموقع باسم عملة دولة الزائر. لمن يتصفح بغير العربية يظهر هذا الرمز بجانب السعر (والريال السعودي يظهر باسمه المترجم).\nلا يحوّل المبالغ بين العملات، بل يغيّر اسم العملة الظاهر فقط.\nحقل إلزامي، 3 أحرف تُكتب كبيرة تلقائيًا. مثال: SAR، AED.',
  },
  currency_symbol: {
    short: 'الرمز المختصر للعملة بجانب الأسعار بالعربية، مثل ر.س.',
    info: 'يظهر بجانب كل سعر لمن يتصفح الموقع بالعربية من هذه الدولة.\nإن تُرك فارغًا يستعمل الموقع الرمز المعروف لعملات المنطقة (مثل ر.س، د.إ)، وإلا يظهر رمز العملة الإنجليزي.\nحتى 16 حرفًا.',
  },
  languages: {
    short: 'اللغات التي يراها زوار هذه الدولة في قائمة اختيار اللغة.',
    info: 'قائمة تغيير اللغة، وشاشة اختيار اللغة أول التسجيل، تعرضان لزوار هذه الدولة اللغات المختارة هنا فقط.\nاضغط على اللغة لاختيارها، واضغط مرة أخرى لإلغائها.\nإن لم تختر أي لغة تظهر كل لغات الموقع.',
  },
  sort_order: {
    short: 'مكان الدولة في القوائم: الرقم الأصغر يظهر أولًا.',
    info: 'تُرتب الدول تصاعديًا حسب هذا الرقم، ثم أبجديًا عند التساوي.\nأول دولة مفعّلة في الترتيب هي الدولة التي يبدأ بها الزائر الذي لم يحدد دولته.\nمثال: 1 للدولة الرئيسية. إن تُرك فارغًا أو كان صفرًا يُحفظ 99.',
  },
  is_active: {
    short: 'عند إلغائه تختفي الدولة عن الزوار، وتبقى محفوظة هنا.',
    info: 'الدولة المفعّلة فقط تظهر للزوار ويمكن اختيارها والتعرف عليها من موقع الزائر.\nإلغاء التفعيل لا يحذف الدولة ولا مناطقها، ويمكن إعادتها في أي وقت، أيضًا من المفتاح في بطاقتها.',
  },
};

const EMPTY = {
  code: '', name_ar: '', name_en: '', flag_emoji: '',
  dial_code: '', currency_code: '', currency_symbol: '',
  languages_enabled: ['ar', 'en'],
  is_active: true, sort_order: 99,
};

export default function AdminCountriesPage() {
  const { t, i18n } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirm, setConfirm] = useState({ open: false });
  const [msg, setMsg] = useState(null);
  const loadVersion = useRef(0);

  const load = () => {
    const version = ++loadVersion.current;
    setLoading(true);
    adminListCountries().then((rows) => { if (version === loadVersion.current) setItems(rows || []); })
      .catch((e) => { if (version === loadVersion.current) { setItems([]); setMsg({ type: 'error', text: apiError(e) }); } })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setFormError(''); setEditOpen(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      code: c.code || '', name_ar: c.name_ar || '', name_en: c.name_en || '',
      flag_emoji: c.flag_emoji || '', dial_code: c.dial_code || '',
      currency_code: c.currency_code || '', currency_symbol: c.currency_symbol || '',
      languages_enabled: Array.isArray(c.languages_enabled) ? c.languages_enabled : ['ar'],
      is_active: !!c.is_active, sort_order: c.sort_order || 99,
    });
    setFormError(''); setEditOpen(true);
  };

  const toggleLang = (code) => {
    setForm((f) => {
      const set = new Set(f.languages_enabled);
      if (set.has(code)) set.delete(code); else set.add(code);
      return { ...f, languages_enabled: Array.from(set) };
    });
  };

  const toggleActive = async (c) => {
    if (!(await confirmAdminChange(t))) return;
    try {
      await adminUpdateCountry(c.id, { is_active: !c.is_active });
      load();
    } catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
  };

  const onSave = async (e) => {
    e.preventDefault();
    if (editing && !(await confirmAdminChange(t, editing.name_ar || editing.full_name || editing.title || editing.provider || ''))) return;
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        ...form,
        is_active: form.is_active ? 1 : 0,
        sort_order: Number(form.sort_order) || 99,
      };
      if (editing) await adminUpdateCountry(editing.id, payload);
      else        await adminCreateCountry(payload);
      setEditOpen(false);
      load();
    } catch (err) { setFormError(apiError(err) || t('errors.generic')); }
    finally { setSaving(false); }
  };

  const askDelete = (c) => {
    setConfirm({
      open: true,
      title: t('admin.confirm_delete_title'),
      body: `${t('admin.confirm_delete_body')} (${localizedName(c, i18n.resolvedLanguage)})`,
      tone: 'danger',
      onConfirm: async () => {
        await adminDeleteCountry(c.id);
        setConfirm({ open: false });
        load();
      },
    });
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title={t('admin.countries')} count={items.length}>
        <AdminButton variant="primary" icon="+" onClick={openCreate}>{t('admin.new')}</AdminButton>
      </AdminPageHeader>

      {msg && (
        <div className={`px-4 py-3 rounded-card text-[13.5px] font-semibold ${
          msg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'
        }`}>{msg.text}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[120px] rounded-card bg-surface border border-border animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-surface rounded-card border border-border"><EmptyState icon="🌍" title={t('admin.no_results')} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((c) => (
            <div key={c.id} className={`bg-surface rounded-card border-2 p-3 shadow-soft ${
              c.is_active ? 'border-border' : 'border-rose-200 opacity-70'
            }`}>
              <div className="flex items-start gap-3">
                <span className="text-3xl shrink-0">{c.flag_emoji || '🏳️'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-ink text-[15px] truncate">{localizedName(c, i18n.resolvedLanguage)}</div>
                  <div className="text-[11.5px] text-fg-subtle">{c.code}</div>
                  <div className="text-[11.5px] text-fg-muted mt-1">
                    💰 <b>{c.currency_symbol || c.currency_code}</b>
                    {c.dial_code && <span className="ms-2">📞 {c.dial_code}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(c.languages_enabled || []).map((l) => (
                      <span key={l} className="px-1.5 py-0.5 rounded bg-primary-soft text-primary text-[10px] font-bold">
                        {SUPPORTED_LANGS.find((s) => s.code === l)?.label || l}
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={() => toggleActive(c)}
                  role="switch" aria-checked={!!c.is_active}
                  className={`relative w-12 h-7 rounded-full transition shrink-0 ${c.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <span className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all"
                    style={{ insetInlineStart: c.is_active ? 'calc(100% - 26px)' : '2px' }} />
                </button>
              </div>
              <div className="flex gap-1.5 mt-3 pt-3 border-t border-border">
                <button onClick={() => openEdit(c)} className="flex-1 px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-primary-soft text-primary hover:opacity-80 transition">
                  {t('admin.edit')}
                </button>
                <button onClick={() => askDelete(c)} className="flex-1 px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition">
                  {t('admin.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)}
        title={editing ? t('admin.edit') : t('admin.new')} width={560}
        footer={
          <>
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-pill bg-surface hover:bg-surface-alt text-fg-muted text-[13px] font-semibold border border-border transition">{t('admin.cancel_btn')}</button>
            <button type="submit" form="AdminCountriesPage-form" disabled={saving} className="px-4 py-2 rounded-pill text-primary-fg text-[13px] font-semibold shadow-soft disabled:opacity-60 transition bg-primary-grad">{saving ? t('admin.saving') : t('admin.save')}</button>
          </>
        }>
        <form id="AdminCountriesPage-form" onSubmit={onSave} className="space-y-3">
          {formError && <div className="px-3 py-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[13px]">{formError}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label={t('admin.country_code')} hint={HELP.code.short} info={HELP.code.info} value={form.code} onChange={(v) => setForm({ ...form, code: v.toUpperCase().slice(0, 2) })} required placeholder="SA" />
            <Field label={t('admin.country_flag')} hint={HELP.flag.short} info={HELP.flag.info} value={form.flag_emoji} onChange={(v) => setForm({ ...form, flag_emoji: v })} placeholder="🇸🇦" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label={t('admin.country_name_ar')} hint={HELP.name_ar.short} info={HELP.name_ar.info} value={form.name_ar} onChange={(v) => setForm({ ...form, name_ar: v })} required />
            <Field label={t('admin.country_name_en')} hint={HELP.name_en.short} info={HELP.name_en.info} value={form.name_en} onChange={(v) => setForm({ ...form, name_en: v })} required />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label={t('admin.country_dial')} hint={HELP.dial.short} info={HELP.dial.info} value={form.dial_code} onChange={(v) => setForm({ ...form, dial_code: v })} placeholder="+966" />
            <Field label={t('admin.country_currency_code')} hint={HELP.currency_code.short} info={HELP.currency_code.info} value={form.currency_code} onChange={(v) => setForm({ ...form, currency_code: v.toUpperCase() })} required placeholder="SAR" />
            <Field label={t('admin.country_currency_symbol')} hint={HELP.currency_symbol.short} info={HELP.currency_symbol.info} value={form.currency_symbol} onChange={(v) => setForm({ ...form, currency_symbol: v })} placeholder="ر.س" />
          </div>
          <div>
            <div className="mb-2">
              <FieldHelp name={t('admin.country_languages')} hint={HELP.languages.short} info={HELP.languages.info}>
                <span className="block text-[12px] font-bold text-ink">{t('admin.country_languages')}</span>
              </FieldHelp>
            </div>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_LANGS.map((l) => {
                const on = form.languages_enabled.includes(l.code);
                return (
                  <button key={l.code} type="button" onClick={() => toggleLang(l.code)}
                    className={`px-3 py-1.5 rounded-pill border-2 text-[12.5px] font-semibold transition ${
                      on ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-fg-muted hover:border-fg-subtle'
                    }`}>
                    {on ? '✓ ' : ''}{l.label}
                  </button>
                );
              })}
            </div>
          </div>
          <Field label={t('admin.category_sort_order')} hint={HELP.sort_order.short} info={HELP.sort_order.info} type="number" value={form.sort_order} onChange={(v) => setForm({ ...form, sort_order: v })} />
          <div>
            <FieldHelp name={t('admin.is_active')} hint={HELP.is_active.short} info={HELP.is_active.info}>
              <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                <span>{t('admin.is_active')}</span>
              </label>
            </FieldHelp>
          </div>
        </form>
      </Modal>

      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
      <AdminFab onClick={openCreate} ariaLabel={t('admin.new')} />
    </div>
  );
}

// The field's name (children) with its (i), the short line under it, and the opened explanation.
function FieldHelp({ name, hint, info, children }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <span className="flex items-center gap-1.5">
        {children}
        {info && <InfoButton open={open} onToggle={() => setOpen(v => !v)} controls={panelId} label={typeof name === 'string' ? name : ''} />}
      </span>
      {hint && <div className="text-[12px] text-slate-500 mt-0.5 leading-snug" data-testid="field-short">{hint}</div>}
      {info && <InfoPanel id={panelId} open={open}>{info}</InfoPanel>}
    </>
  );
}

function Field({ label, hint, info, value, onChange, type = 'text', required = false, placeholder = '' }) {
  const id = useId();
  return (
    <div>
      <div className="mb-1">
        <FieldHelp name={label} hint={hint} info={info}>
          <label htmlFor={id} className="block text-[12px] font-bold text-ink">{label}</label>
        </FieldHelp>
      </div>
      <input id={id} type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-card border border-border bg-surface-alt focus:bg-surface focus:border-primary outline-none text-[14px]" />
    </div>
  );
}
