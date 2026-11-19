import { validateAdminCatalogForm, catalogResponseErrors } from '../../utils/adminCatalogValidation';
import { useAuth } from '../../hooks/useAuth';
import ServiceEditorModal from '../../components/admin/ServiceEditorModal';
import { useAdminConfirmation } from '../../components/admin/confirmAdminChange';
import { localizedName } from '../../utils/localize';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listCategoriesAdmin, createCategory, updateCategory, deleteCategory,
  listServicesAdmin, deleteService,
} from '../../services/adminService';
import { apiError } from '../../services/api';
import Modal from '../../components/admin/AdminModal';
import ConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import EmptyState from '../../components/admin/EmptyState';
import AdminFab from '../../components/admin/AdminFab';
import { formatCurrency } from '../../utils/formatters';

// Admin form is intentionally minimal: name_en + slug are derived
// server-side from the Arabic name (auto-translation + transliteration).
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
        <div className="space-y-3">
          {items.map((c) => {
            const expanded = expandedId === c.id;
            const services = servicesByCat[c.id];
            const color = /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '';
            return (
            <div key={c.id} className={`bg-white rounded-card border shadow-soft transition ${expanded ? 'border-brand-300 shadow-card' : 'border-slate-100 hover:shadow-card hover:border-brand-200'}`}>
              <div className="p-3">
                {/* Tap the top area to expand the category */}
                <button
                  type="button"
                  onClick={() => toggleExpand(c.id)}
                  className="w-full text-start flex items-start gap-3 group"
                  aria-expanded={expanded}
                >
                  <span
                    className="w-12 h-12 rounded-card grid place-items-center text-xl shrink-0"
                    style={{ background: color ? `${color}22` : '#f1f5f9', color: color || '#475569' }}
                  >
                    {c.icon || '🗂️'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="cat-name-track">
                      <div className="cat-name-inner font-bold text-ink text-[14.5px] group-hover:text-brand-700">{localizedName(c, i18n.resolvedLanguage)}</div>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[11px] text-slate-400">#{c.id}</span>
                      {c.services_count != null && (
                        <span className="px-2 py-0.5 rounded-pill bg-brand-50 text-brand-700 text-[10.5px] font-bold">
                          🛠️ {t('admin.category_count_services', { count: c.services_count })}
                        </span>
                      )}
                      {c.is_active ? (
                        <span className="px-2 py-0.5 rounded-pill bg-emerald-50 text-emerald-600 text-[10.5px] font-bold">{t('admin.active')}</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-pill bg-slate-100 text-slate-500 text-[10.5px] font-bold">{t('admin.inactive')}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className="text-slate-400 group-hover:text-brand-500 shrink-0 self-center text-lg transition-transform duration-200"
                    style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0)' }}
                    aria-hidden="true"
                  >›</span>
                </button>

                {/* Inline services list — slides open when category is tapped */}
                {expanded && (
                  <div className="mt-3 pt-3 border-t border-slate-100 animate-[slideDown_.18s_ease]">
                    {canManageServices && <button type="button" onClick={() => setServiceEditor({ category: c, service: null })}
                      className="btn btn-primary btn-sm mb-2">+ {t('admin.services')}</button>}
                    {loadingCat === c.id ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="h-10 rounded-card bg-slate-50 animate-pulse" />
                        ))}
                      </div>
                    ) : !services || services.length === 0 ? (
                      <div className="text-center py-4 text-slate-400 text-[12.5px]">
                        {t('admin.no_results')}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {services.map((s) => (
                          <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-card bg-slate-50">
                            <span className="text-base shrink-0">{s.icon || '🛠️'}</span>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-ink text-[13px] truncate">{localizedName(s, i18n.resolvedLanguage)}</div>
                              {s.base_price && (
                                <div className="text-[10.5px] text-slate-500">{formatCurrency(s.base_price)}</div>
                              )}
                            </div>
                            {s.is_active ? (
                              <span className="px-1.5 py-0.5 rounded-pill bg-emerald-50 text-emerald-600 text-[10px] font-bold shrink-0">✓</span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded-pill bg-slate-200 text-slate-500 text-[10px] font-bold shrink-0">⏸</span>
                            )}
                            {canManageServices && <span className="flex gap-1 shrink-0">
                              <button type="button" className="btn btn-ghost btn-sm" aria-label={t('admin.edit') + ' ' + localizedName(s, i18n.resolvedLanguage)} onClick={() => setServiceEditor({ category: c, service: s })}>{t('admin.edit')}</button>
                              <button type="button" className="btn btn-ghost btn-sm text-rose-700" aria-label={t('admin.delete') + ' ' + localizedName(s, i18n.resolvedLanguage)} onClick={() => askDeleteService(s, c)}>{t('admin.delete')}</button>
                            </span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-1.5 px-3 pb-3 pt-2 border-t border-slate-100">
                <button onClick={() => openEdit(c)} className="flex-1 px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 transition">{t('admin.edit')}</button>
                <button onClick={() => askDelete(c)} className="flex-1 px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition">{t('admin.delete')}</button>
              </div>
            </div>
            );
          })}
        </div>
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
          <Field label={t('admin.category_name_ar')} error={fieldErrors.name_ar} value={form.name_ar} onChange={(v) => updateForm({ ...form, name_ar: v })} required />
          <div className="px-3 py-2 rounded-card bg-info-soft text-info text-[12px]">
            🌐 {t('admin.auto_translate_hint')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label={t('admin.category_icon')} error={fieldErrors.icon} value={form.icon} onChange={(v) => updateForm({ ...form, icon: v })} placeholder="🏠" />
            <Field label={t('admin.category_color')} error={fieldErrors.color} value={form.color} onChange={(v) => updateForm({ ...form, color: v })} placeholder="#0ea5e9" />
            <Field label={t('admin.category_sort_order')} type="number" error={fieldErrors.sort_order} value={form.sort_order} onChange={(v) => updateForm({ ...form, sort_order: Number(v) || 0 })} />
          </div>
          <Field label={t('admin.category_description')} error={fieldErrors.description} value={form.description} onChange={(v) => updateForm({ ...form, description: v })} multiline />
          {editing && (
            <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} />
              <span>{t('admin.is_active')}</span>
            </label>
          )}
        </form>
      </Modal>

      {serviceEditor && canManageServices && <ServiceEditorModal key={`${serviceEditor.category.id}:${serviceEditor.service?.id || 'new'}`} {...serviceEditor} categories={items} onClose={() => setServiceEditor(null)} onSaved={refreshServices} />}
      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
      <AdminFab onClick={openCreate} ariaLabel={t('admin.new')} />
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false, placeholder = '', multiline = false, error }) {
  const id = useId();
  const cls = `w-full px-3 py-2 rounded-card border outline-none text-[14px] ${error ? 'border-2 border-rose-500 bg-rose-50' : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500'}`;
  const a11y = { id, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined };
  return (
    <div>
      <label htmlFor={id} className={`block text-[12px] font-bold mb-1 ${error ? 'text-rose-600' : 'text-ink'}`}>{label}</label>
      {multiline ? (
        <textarea {...a11y} rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      ) : (
        <input {...a11y} type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
      {error && <span id={`${id}-error`} role="alert" className="block mt-1 text-[12px] font-bold text-rose-600">{error}</span>}
    </div>
  );
}
