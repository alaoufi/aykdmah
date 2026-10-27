import { localizedName } from '../../utils/localize';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listCategoriesAdmin, createCategory, updateCategory, deleteCategory,
  listServicesAdmin,
} from '../../services/adminService';
import { apiError } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
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

  const openCreate = () => { setEditing(null); setForm(EMPTY); setFormError(''); setEditOpen(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      name_ar: c.name_ar || '',
      icon: c.icon || '', color: c.color || '', description: c.description || '',
      sort_order: c.sort_order || 0, is_active: !!c.is_active,
    });
    setFormError('');
    setEditOpen(true);
  };

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (editing) await updateCategory(editing.id, form);
      else await createCategory(form);
      setEditOpen(false);
      load();
    } catch (err) {
      setFormError(apiError(err) || t('errors.generic'));
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
    <div className="space-y-6">
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
              <div className="p-4">
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
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-1.5 px-4 pb-4 pt-3 border-t border-slate-100">
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
        <form id="AdminCategoriesPage-form" onSubmit={onSave} className="space-y-3">
          {formError && <div className="px-3 py-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[13px]">{formError}</div>}
          <Field label={t('admin.category_name_ar')} value={form.name_ar} onChange={(v) => setForm({ ...form, name_ar: v })} required />
          <div className="px-3 py-2 rounded-card bg-info-soft text-info text-[12px]">
            🌐 {t('admin.auto_translate_hint')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label={t('admin.category_icon')} value={form.icon} onChange={(v) => setForm({ ...form, icon: v })} placeholder="🏠" />
            <Field label={t('admin.category_color')} value={form.color} onChange={(v) => setForm({ ...form, color: v })} placeholder="#0ea5e9" />
            <Field label={t('admin.category_sort_order')} type="number" value={form.sort_order} onChange={(v) => setForm({ ...form, sort_order: Number(v) || 0 })} />
          </div>
          <Field label={t('admin.category_description')} value={form.description} onChange={(v) => setForm({ ...form, description: v })} multiline />
          {editing && (
            <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} />
              <span>{t('admin.is_active')}</span>
            </label>
          )}
        </form>
      </Modal>

      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
      <AdminFab onClick={openCreate} ariaLabel={t('admin.new')} />
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false, placeholder = '', multiline = false }) {
  const cls = 'w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]';
  return (
    <div>
      <label className="block text-[12px] font-bold text-ink mb-1">{label}</label>
      {multiline ? (
        <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      ) : (
        <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}
