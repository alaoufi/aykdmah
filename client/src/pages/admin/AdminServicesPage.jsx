import { localizedJoinedName } from '../../utils/localizeJoined';
import { localizedName } from '../../utils/localize';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  listServicesAdmin, createService, updateService, deleteService, listCategoriesAdmin,
} from '../../services/adminService';
import { apiError } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import EmptyState from '../../components/admin/EmptyState';
import AdminFab from '../../components/admin/AdminFab';
import { formatCurrency } from '../../utils/formatters';

// name_en + slug are derived server-side from the Arabic name
// (auto-translation + transliteration).
const EMPTY = {
  name_ar: '', description: '', icon: '',
  base_price: '', category_id: '', is_active: true, is_urgent_supported: true, sort_order: 0,
};

export default function AdminServicesPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  // ?category_id= in the URL pre-selects the filter so links from the
  // category list land here already scoped to that category.
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilterState] = useState(params.get('category_id') || '');
  const setCategoryFilter = (v) => {
    setCategoryFilterState(v);
    if (v) setParams({ category_id: v }, { replace: true });
    else setParams({}, { replace: true });
  };
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirm, setConfirm] = useState({ open: false });
  const [error, setError] = useState('');
  const loadVersion = useRef(0);

  const load = () => {
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    Promise.all([
      listServicesAdmin(categoryFilter ? { category_id: categoryFilter } : {}),
      listCategoriesAdmin(),
    ])
      .then(([s, c]) => { if (version === loadVersion.current) { setItems(s || []); setCategories(c || []); } })
      .catch((e) => { if (version === loadVersion.current) { setItems([]); setCategories([]); setError(apiError(e)); } })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [categoryFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY, category_id: categories[0]?.id || '' });
    setFormError('');
    setEditOpen(true);
  };
  const openEdit = (s) => {
    setEditing(s);
    setForm({
      name_ar: s.name_ar || '',
      description: s.description || '', icon: s.icon || '',
      base_price: s.base_price ?? '', category_id: s.category_id,
      is_active: !!s.is_active, is_urgent_supported: !!s.is_urgent_supported,
      sort_order: s.sort_order || 0,
    });
    setFormError('');
    setEditOpen(true);
  };

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        ...form,
        base_price: form.base_price === '' ? null : Number(form.base_price),
        is_active: form.is_active ? 1 : 0,
        is_urgent_supported: form.is_urgent_supported ? 1 : 0,
      };
      if (editing) await updateService(editing.id, payload);
      else await createService(payload);
      setEditOpen(false);
      load();
    } catch (err) {
      setFormError(apiError(err) || t('errors.generic'));
    } finally { setSaving(false); }
  };

  const askDelete = (s) => {
    setConfirm({
      open: true,
      title: t('admin.confirm_delete_title'),
      body: `${t('admin.confirm_delete_body')} (${localizedName(s, i18n.resolvedLanguage)})`,
      tone: 'danger',
      onConfirm: async () => {
        await deleteService(s.id);
        setConfirm({ open: false });
        load();
      },
    });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('admin.services')} count={items.length}>
        <AdminButton variant="primary" icon="+" onClick={openCreate}>{t('admin.new')}</AdminButton>
      </AdminPageHeader>

      {error && <div role="alert" className="text-rose-700 text-[13px]">{error}</div>}

      <div className="bg-white rounded-card border border-slate-100 p-4 flex flex-wrap items-center gap-3 shadow-soft">
        <button
          onClick={() => setCategoryFilter('')}
          className={`px-4 py-1.5 rounded-pill text-[13px] font-semibold transition border ${
            categoryFilter === ''
              ? 'bg-ink text-white border-ink'
              : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
          }`}
        >
          {t('common.all')}
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryFilter(String(c.id))}
            className={`px-4 py-1.5 rounded-pill text-[13px] font-semibold transition border ${
              categoryFilter === String(c.id)
                ? 'bg-ink text-white border-ink'
                : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
            }`}
          >
            {c.icon} {localizedName(c, i18n.resolvedLanguage)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[70px] rounded-card bg-white border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-card border border-slate-100"><EmptyState icon="🛠️" title={t('admin.no_results')} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((s) => (
            <div key={s.id} className="bg-white rounded-card border border-slate-100 p-4 shadow-soft hover:shadow-card transition">
              <div className="flex items-start gap-3">
                <span className="w-12 h-12 rounded-card grid place-items-center text-xl shrink-0 bg-slate-100">{s.icon || '🛠️'}</span>
                <div className="min-w-0 flex-1">
                  <div className="cat-name-track">
                    <div className="cat-name-inner font-bold text-ink text-[14.5px]">{localizedName(s, i18n.resolvedLanguage)}</div>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[11px] text-slate-400">#{s.id}</span>
                    {s.category_name && (
                      <span className="px-2 py-0.5 rounded-pill bg-slate-100 text-slate-600 text-[10.5px] font-bold">
                        🗂️ {localizedJoinedName(s, 'category', i18n.resolvedLanguage)}
                      </span>
                    )}
                    {s.base_price && (
                      <span className="px-2 py-0.5 rounded-pill bg-brand-50 text-brand-700 text-[10.5px] font-bold">
                        💰 {formatCurrency(s.base_price)}
                      </span>
                    )}
                    {s.is_urgent_supported ? (
                      <span className="px-2 py-0.5 rounded-pill bg-amber-50 text-amber-700 text-[10.5px] font-bold">⚡ {t('admin.is_urgent')}</span>
                    ) : null}
                    {s.is_active ? (
                      <span className="px-2 py-0.5 rounded-pill bg-emerald-50 text-emerald-600 text-[10.5px] font-bold">{t('admin.active')}</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-pill bg-slate-100 text-slate-500 text-[10.5px] font-bold">{t('admin.inactive')}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 mt-3 pt-3 border-t border-slate-100">
                <button onClick={() => openEdit(s)} className="flex-1 px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 transition">{t('admin.edit')}</button>
                <button onClick={() => askDelete(s)} className="flex-1 px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition">{t('admin.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={editing ? t('admin.edit') : t('admin.new')}
        width={600}
        footer={
          <>
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-pill bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-semibold border border-slate-200 transition">{t('admin.cancel_btn')}</button>
            <button type="submit" form="AdminServicesPage-form" disabled={saving} className="px-4 py-2 rounded-pill text-white text-[13px] font-semibold shadow-soft disabled:opacity-60 transition" style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}>{saving ? t('admin.saving') : t('admin.save')}</button>
          </>
        }
      >
        <form id="AdminServicesPage-form" onSubmit={onSave} className="space-y-3">
          {formError && <div className="px-3 py-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[13px]">{formError}</div>}
          <div>
            <label className="block text-[12px] font-bold text-ink mb-1">{t('admin.service_category')}</label>
            <select required value={form.category_id} onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]">
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{localizedName(c, i18n.resolvedLanguage)}</option>)}
            </select>
          </div>
          <FieldS label={t('admin.service_name_ar')} value={form.name_ar} onChange={(v) => setForm({ ...form, name_ar: v })} required />
          <div className="px-3 py-2 rounded-card bg-info-soft text-info text-[12px]">
            🌐 {t('admin.auto_translate_hint')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FieldS label={t('admin.category_icon')} value={form.icon} onChange={(v) => setForm({ ...form, icon: v })} placeholder="🛠️" />
            <FieldS label={t('admin.service_base_price')} type="number" value={form.base_price} onChange={(v) => setForm({ ...form, base_price: v })} />
            <FieldS label={t('admin.category_sort_order')} type="number" value={form.sort_order} onChange={(v) => setForm({ ...form, sort_order: Number(v) || 0 })} />
          </div>
          <FieldS label={t('admin.category_description')} value={form.description} onChange={(v) => setForm({ ...form, description: v })} multiline />
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              <span>{t('admin.is_active')}</span>
            </label>
            <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" checked={!!form.is_urgent_supported} onChange={(e) => setForm({ ...form, is_urgent_supported: e.target.checked })} />
              <span>{t('admin.service_urgent_supported')}</span>
            </label>
          </div>
        </form>
      </Modal>

      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
      <AdminFab onClick={openCreate} ariaLabel={t('admin.new')} />
    </div>
  );
}

function FieldS({ label, value, onChange, type = 'text', required = false, placeholder = '', multiline = false }) {
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
