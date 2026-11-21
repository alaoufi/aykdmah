import { validateAdminCatalogForm, catalogResponseErrors } from '../../utils/adminCatalogValidation';
import { useAuth } from '../../hooks/useAuth';
import ServiceEditorModal from '../../components/admin/ServiceEditorModal';
import { useAdminConfirmation } from '../../components/admin/confirmAdminChange';
import { localizedName } from '../../utils/localize';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listCategoriesAdmin, createCategory, updateCategory, deleteCategory,
  listServicesAdmin, deleteService, updateService,
} from '../../services/adminService';
import { apiError } from '../../services/api';
import Modal from '../../components/admin/AdminModal';
import ConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import EmptyState from '../../components/admin/EmptyState';
import AdminFab from '../../components/admin/AdminFab';
import { formatCurrency } from '../../utils/formatters';
import RowMenu from '../../components/admin/RowMenu';
import { InfoButton, InfoPanel } from '../../components/common/InfoTip';

// Admin form is intentionally minimal: name_en + slug are derived
// server-side from the Arabic name (auto-translation + transliteration).
// AYK-415: a short line under each field of the profession form, and (i) for the full explanation.
const HELP = {
  name_ar: {
    short: 'اسم المهنة كما يراه الزوار، ويُترجم تلقائيًا إلى لغات الموقع.',
    info: 'الاسم الذي يظهر للزوار في قوائم المهن وعند طلب خدمة أو اختيار مهنة مقدم الخدمة.\nبعد الحفظ يترجمه الموقع تلقائيًا إلى لغاته الإحدى عشرة. تغيير الاسم لاحقًا يعيد الترجمة وقد يغيّر رابط صفحة المهنة.\nحقل إلزامي، حتى 150 حرفًا. مثال: سباكة.',
  },
  icon: {
    short: 'رمز تعبيري (إيموجي) يظهر بجانب اسم المهنة، مثل 🔧.',
    info: 'يظهر بجانب اسم المهنة في قوائم المهن واختيارها في الموقع وفي هذه القائمة.\nالصق رمزًا تعبيريًا واحدًا، مثل 🔧 أو 🏠.\nإن تُرك فارغًا يظهر الرمز 🗂️ في لوحة الإدارة ولا يظهر رمز للزوار.',
  },
  color: {
    short: 'لون خلفية أيقونة المهنة في قائمة المهن هنا، مثل ‎#0ea5e9.',
    info: 'يلوّن المربع الذي خلف أيقونة المهنة في قائمة المهن بلوحة الإدارة.\nاكتبه بصيغة # وبعدها 6 خانات من أرقام وحروف إنجليزية، مثل ‎#0ea5e9 للأزرق. الصيغ الأخرى تُحفظ لكن لا تُلوِّن.\nإن تُرك فارغًا تظهر الخلفية رمادية.',
  },
  sort_order: {
    short: 'مكان المهنة في القوائم: الرقم الأصغر يظهر أولًا.',
    info: 'تُرتب المهن في الموقع تصاعديًا حسب هذا الرقم، ثم أبجديًا عند التساوي. ويُستعمل هنا عند اختيار «الترتيب المحدد».\nرقم صحيح، مثال: 1 لأول مهنة. إن تُرك فارغًا يُحفظ 0.',
  },
  description: {
    short: 'وصف مختصر للمهنة، يُحفظ ويُترجم تلقائيًا إلى لغات الموقع.',
    info: 'نص يشرح المهنة وما تشمله. يترجمه الموقع تلقائيًا إلى لغاته الإحدى عشرة عند الحفظ.\nلا يظهر حاليًا للزوار في صفحات الموقع.\nاختياري. مثال: إصلاح تسربات المياه وتركيب الأدوات الصحية.',
  },
  is_active: {
    short: 'عند إلغائه تختفي المهنة عن الزوار، وتبقى محفوظة هنا.',
    info: 'المهنة النشطة فقط تظهر للزوار ويمكن اختيارها. إلغاء التفعيل لا يحذف المهنة ولا خدماتها، ويمكن إعادتها في أي وقت.\nيمكن أيضًا الإخفاء والتنشيط من قائمة الخيارات ⋮ بجانب المهنة.',
  },
};

const EMPTY = { name_ar: '', icon: '', color: '', description: '', sort_order: 0, is_active: true };

export default function AdminCategoriesPage() {
  const { t, i18n } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const { hasPermission } = useAuth();
  const canManageServices = hasPermission('services.manage');
  const [serviceEditor, setServiceEditor] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [servicesByCat, setServicesByCat] = useState({}); // {catId: [services]}
  const [loadingCat, setLoadingCat] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const updateForm = next => { setForm(next); setFieldErrors(prev => Object.fromEntries(Object.entries(prev).filter(([field]) => next[field] === form[field]))); };
  const [confirm, setConfirm] = useState({ open: false });
  const [error, setError] = useState('');
  const loadVersion = useRef(0);
  // AYK-416: alphabetical, most active (requests then providers), or the set order.
  const [sortBy, setSortBy] = useState(() => { try { return localStorage.getItem('ayk_admin_cat_sort') || 'name'; } catch (_) { return 'name'; } });
  const chooseSort = value => { setSortBy(value); try { localStorage.setItem('ayk_admin_cat_sort', value); } catch (_) { /* private mode */ } };

  const toggleExpand = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!servicesByCat[id]) {
      setLoadingCat(id);
      try {
        const list = await listServicesAdmin({ category_id: id });
        setServicesByCat((prev) => ({ ...prev, [id]: list || [] }));
      } catch (e) {
        setError(apiError(e));
        setServicesByCat((prev) => ({ ...prev, [id]: [] }));
      } finally { setLoadingCat((current) => current === id ? null : current); }
    }
  };

  const load = () => {
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    listCategoriesAdmin()
      .then((rows) => { if (version === loadVersion.current) setItems(rows || []); })
      .catch((e) => { if (version === loadVersion.current) { setItems([]); setError(apiError(e)); } })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const refreshServices = async categoryId => {
    try {
      const [services, categories] = await Promise.all([listServicesAdmin({ category_id: categoryId }), listCategoriesAdmin()]);
      setServicesByCat(prev => ({ ...prev, [categoryId]: services || [] }));
      setItems(categories || []);
    } catch (error) {
      // The write already succeeded. A failed refresh must not leave an add
      // dialog inviting a duplicate retry of the successful operation.
      setError(apiError(error));
      setServicesByCat(prev => { const next = { ...prev }; delete next[categoryId]; return next; });
    }
  };
  const askDeleteService = (service, category) => setConfirm({
    open: true, title: t('admin.confirm_delete_title'),
    body: `${t('admin.confirm_delete_body')} (${localizedName(service, i18n.resolvedLanguage)})`, tone: 'danger',
    onConfirm: async () => { await deleteService(service.id); setConfirm({ open: false }); await refreshServices(category.id); },
  });

  const openCreate = () => { setEditing(null); setForm(EMPTY); setFormError(''); setFieldErrors({}); setEditOpen(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      name_ar: c.name_ar || '',
      icon: c.icon || '', color: c.color || '', description: c.description || '',
      sort_order: c.sort_order || 0, is_active: !!c.is_active,
    });
    setFormError('');
    setFieldErrors({}); setEditOpen(true);
  };

  const onSave = async (e) => {
    e.preventDefault();
    const found = validateAdminCatalogForm('category', form, t);
    if (Object.keys(found).length) { setFieldErrors(found); return; }
    if (editing && !(await confirmAdminChange(t, editing.name_ar || editing.full_name || editing.title || editing.provider || ''))) return;
    setSaving(true);
    setFormError('');
    try {
      if (editing) await updateCategory(editing.id, form);
      else await createCategory(form);
      setEditOpen(false);
      load();
    } catch (err) {
      const found = catalogResponseErrors('category', err, t);
      if (Object.keys(found).length) setFieldErrors(found);
      else setFormError(apiError(err) || t('errors.generic'));
    } finally { setSaving(false); }
  };

  // AYK-416: show or hide a profession / service straight from its ⋮ menu.
  const toggleCategory = async c => {
    setError('');
    try { await updateCategory(c.id, { is_active: c.is_active ? 0 : 1 }); load(); } catch (err) { setError(apiError(err)); }
  };
  const toggleService = async (s, c) => {
    setError('');
    try { await updateService(s.id, { is_active: s.is_active ? 0 : 1 }); await refreshServices(c.id); } catch (err) { setError(apiError(err)); }
  };
  const lang = i18n.resolvedLanguage;
  const sorted = [...items].sort((a, b) => {
    if (sortBy === 'activity') return (Number(b.requests_count) || 0) - (Number(a.requests_count) || 0)
      || (Number(b.providers_count) || 0) - (Number(a.providers_count) || 0)
      || localizedName(a, lang).localeCompare(localizedName(b, lang), lang);
    if (sortBy === 'order') return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || Number(a.id) - Number(b.id);
    return localizedName(a, lang).localeCompare(localizedName(b, lang), lang);
  });

  const askDelete = (c) => {
    setConfirm({
      open: true,
      title: t('admin.confirm_delete_title'),
      body: `${t('admin.confirm_delete_body')} (${localizedName(c, i18n.resolvedLanguage)})`,
      tone: 'danger',
      onConfirm: async () => {
        await deleteCategory(c.id);
        setConfirm({ open: false });
        load();
      },
    });
  };

  return (
    <div className="space-y-3">
      <AdminPageHeader title={t('admin.categories')} count={items.length}>
        <AdminButton variant="primary" icon="+" onClick={openCreate}>
          {t('admin.new')}
        </AdminButton>
      </AdminPageHeader>

      {error && <div role="alert" className="text-rose-700 text-[13px]">{error}</div>}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[88px] rounded-card bg-white border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-card border border-slate-100">
          <EmptyState icon="🗂️" title={t('admin.no_results')} />
        </div>
      ) : (
        <>
        <div className="flex items-center gap-2 text-[12.5px]" data-testid="category-sort">
          <span className="text-slate-500">ترتيب:</span>
          {[['name', 'أبجدي'], ['activity', 'الأكثر نشاطًا'], ['order', 'الترتيب المحدد']].map(([value, text]) => (
            <button key={value} type="button" onClick={() => chooseSort(value)} aria-pressed={sortBy === value}
              className={`px-2.5 py-1 rounded-pill border font-semibold ${sortBy === value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600'}`}>{text}</button>
          ))}
        </div>
        <div className="bg-white rounded-card border border-slate-100 shadow-soft divide-y divide-slate-100" data-testid="category-list">
          {sorted.map((c) => {
            const expanded = expandedId === c.id;
            const services = servicesByCat[c.id];
            const color = /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '';
            return (
            <div key={c.id} className={expanded ? 'bg-brand-50/40' : ''} data-testid="category-row">
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <button type="button" onClick={() => toggleExpand(c.id)} aria-expanded={expanded}
                  className="flex-1 min-w-0 text-start flex items-center gap-2.5 group">
                  <span className="w-9 h-9 rounded-card grid place-items-center text-lg shrink-0"
                    style={{ background: color ? `${color}22` : '#f1f5f9', color: color || '#475569' }}>{c.icon || '🗂️'}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-bold text-[14px] truncate ${c.is_active ? 'text-ink' : 'text-slate-400 line-through'}`}>{localizedName(c, lang)}</span>
                    <span className="block text-[11px] text-slate-500 truncate">
                      {[
                        t('admin.category_count_services', { count: Number(c.services_count) || 0 }),
                        c.requests_count != null ? `${c.requests_count} طلب` : null,
                        c.providers_count != null ? `${c.providers_count} مقدم خدمة` : null,
                        c.is_active ? null : t('admin.inactive'),
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="text-slate-400 shrink-0 text-lg transition-transform duration-200"
                    style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0)' }} aria-hidden="true">›</span>
                </button>
                <RowMenu label={`خيارات ${localizedName(c, lang)}`} items={[
                  { label: t('admin.edit'), icon: '✏️', onClick: () => openEdit(c) },
                  { label: c.is_active ? 'إخفاء' : 'تنشيط', icon: c.is_active ? '🙈' : '✅', onClick: () => toggleCategory(c) },
                  { label: t('admin.delete'), icon: '🗑️', danger: true, onClick: () => askDelete(c) },
                ]} />
              </div>

              {expanded && (
                <div className="px-3 pb-2.5 animate-[slideDown_.18s_ease]">
                  {canManageServices && <button type="button" onClick={() => setServiceEditor({ category: c, service: null })}
                    className="btn btn-primary btn-sm mb-1.5">+ {t('admin.services')}</button>}
                  {loadingCat === c.id ? (
                    <div className="space-y-1">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 rounded-card bg-slate-50 animate-pulse" />)}</div>
                  ) : !services || services.length === 0 ? (
                    <div className="text-center py-3 text-slate-400 text-[12.5px]">{t('admin.no_results')}</div>
                  ) : (
                    <div className="rounded-card bg-slate-50 divide-y divide-slate-100">
                      {[...services].sort((a, b) => localizedName(a, lang).localeCompare(localizedName(b, lang), lang)).map((s) => (
                        <div key={s.id} className="flex items-center gap-2 ps-3 pe-1 py-1" data-testid="service-row">
                          <span className="text-base shrink-0">{s.icon || '🛠️'}</span>
                          <span className="min-w-0 flex-1">
                            <span className={`block font-semibold text-[13px] truncate ${s.is_active ? 'text-ink' : 'text-slate-400 line-through'}`}>{localizedName(s, lang)}</span>
                            {(s.base_price || !s.is_active) && <span className="block text-[10.5px] text-slate-500">{[s.base_price ? formatCurrency(s.base_price) : null, s.is_active ? null : t('admin.inactive')].filter(Boolean).join(' · ')}</span>}
                          </span>
                          {canManageServices && <RowMenu label={`خيارات ${localizedName(s, lang)}`} testId="service-menu" items={[
                            { label: t('admin.edit'), icon: '✏️', onClick: () => setServiceEditor({ category: c, service: s }) },
                            { label: s.is_active ? 'إخفاء' : 'تنشيط', icon: s.is_active ? '🙈' : '✅', onClick: () => toggleService(s, c) },
                            { label: t('admin.delete'), icon: '🗑️', danger: true, onClick: () => askDeleteService(s, c) },
                          ]} />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
        </>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={editing ? t('admin.edit') : t('admin.new')}
        footer={
          <>
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-pill bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-semibold border border-slate-200 transition">{t('admin.cancel_btn')}</button>
            <button type="submit" form="AdminCategoriesPage-form" disabled={saving} className="px-4 py-2 rounded-pill text-white text-[13px] font-semibold shadow-soft disabled:opacity-60 transition" style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}>{saving ? t('admin.saving') : t('admin.save')}</button>
          </>
        }
      >
        <form noValidate id="AdminCategoriesPage-form" onSubmit={onSave} className="space-y-3">
          {formError && <div className="px-3 py-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[13px]">{formError}</div>}
          <Field label={t('admin.category_name_ar')} hint={HELP.name_ar.short} info={HELP.name_ar.info} error={fieldErrors.name_ar} value={form.name_ar} onChange={(v) => updateForm({ ...form, name_ar: v })} required />
          <div className="px-3 py-2 rounded-card bg-info-soft text-info text-[12px]">
            🌐 سيُترجم الاسم والوصف تلقائيًا إلى كل لغات الموقع عند الحفظ.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label={t('admin.category_icon')} hint={HELP.icon.short} info={HELP.icon.info} error={fieldErrors.icon} value={form.icon} onChange={(v) => updateForm({ ...form, icon: v })} placeholder="🏠" />
            <Field label={t('admin.category_color')} hint={HELP.color.short} info={HELP.color.info} error={fieldErrors.color} value={form.color} onChange={(v) => updateForm({ ...form, color: v })} placeholder="#0ea5e9" />
            <Field label={t('admin.category_sort_order')} hint={HELP.sort_order.short} info={HELP.sort_order.info} type="number" error={fieldErrors.sort_order} value={form.sort_order} onChange={(v) => updateForm({ ...form, sort_order: Number(v) || 0 })} />
          </div>
          <Field label={t('admin.category_description')} hint={HELP.description.short} info={HELP.description.info} error={fieldErrors.description} value={form.description} onChange={(v) => updateForm({ ...form, description: v })} multiline />
          {editing && (
            <CheckHelp label={t('admin.is_active')} hint={HELP.is_active.short} info={HELP.is_active.info}>
              <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} />
                <span>{t('admin.is_active')}</span>
              </label>
            </CheckHelp>
          )}
        </form>
      </Modal>

      {serviceEditor && canManageServices && <ServiceEditorModal key={`${serviceEditor.category.id}:${serviceEditor.service?.id || 'new'}`} {...serviceEditor} categories={items} onClose={() => setServiceEditor(null)} onSaved={refreshServices} />}
      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
      <AdminFab onClick={openCreate} ariaLabel={t('admin.new')} />
    </div>
  );
}

// A checkbox with its (i), the short line under it, and the opened explanation.
function CheckHelp({ label, hint, info, children }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div>
      <span className="flex items-center gap-1.5">
        {children}
        {info && <InfoButton open={open} onToggle={() => setOpen(v => !v)} controls={panelId} label={label} />}
      </span>
      {hint && <div className="text-[12px] text-slate-500 mt-0.5 leading-snug" data-testid="field-short">{hint}</div>}
      {info && <InfoPanel id={panelId} open={open}>{info}</InfoPanel>}
    </div>
  );
}

function Field({ label, hint, info, value, onChange, type = 'text', required = false, placeholder = '', multiline = false, error }) {
  const id = useId();
  const [infoOpen, setInfoOpen] = useState(false);
  const cls = `w-full px-3 py-2 rounded-card border outline-none text-[14px] ${error ? 'border-2 border-rose-500 bg-rose-50' : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500'}`;
  const a11y = { id, 'aria-invalid': Boolean(error), 'aria-describedby': [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined };
  return (
    <div>
      <div className="mb-1">
        <span className="flex items-center gap-1.5">
          <label htmlFor={id} className={`block text-[12px] font-bold ${error ? 'text-rose-600' : 'text-ink'}`}>{label}</label>
          {info && <InfoButton open={infoOpen} onToggle={() => setInfoOpen(v => !v)} controls={`${id}-info`} label={label} />}
        </span>
        {hint && <div id={`${id}-hint`} className="text-[12px] text-slate-500 mt-0.5 leading-snug" data-testid="field-short">{hint}</div>}
        {info && <InfoPanel id={`${id}-info`} open={infoOpen}>{info}</InfoPanel>}
      </div>
      {multiline ? (
        <textarea {...a11y} rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      ) : (
        <input {...a11y} type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
      {error && <span id={`${id}-error`} role="alert" className="block mt-1 text-[12px] font-bold text-rose-600">{error}</span>}
    </div>
  );
}
