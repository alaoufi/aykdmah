import { localizedName } from '../../utils/localize';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, TouchSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  adminListCountries,
  adminListRegions, adminCreateRegion, adminUpdateRegion, adminDeleteRegion, adminReorderRegions,
  adminListCities, adminCreateCity, adminUpdateCity, adminDeleteCity, adminReorderCities,
  adminListDistricts, adminCreateDistrict, adminUpdateDistrict, adminDeleteDistrict,
} from '../../services/adminService';
import { apiError } from '../../services/api';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import EmptyState from '../../components/admin/EmptyState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import Modal from '../../components/common/Modal';

// Drill-down: country -> region -> city. Drag-and-drop reorders each
// level. Tap a row to drill in; the back arrow returns one level up.
export default function AdminLocationsPage() {
  const { t, i18n } = useTranslation();
  const [countries, setCountries] = useState([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [country, setCountry] = useState(null);
  const [region, setRegion] = useState(null);
  const [city, setCity] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    adminListCountries()
      .then((rows) => setCountries(rows || []))
      .catch((e) => { setCountries([]); setMsg({ type: 'error', text: apiError(e) }); })
      .finally(() => setLoadingCountries(false));
  }, []);

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000); };

  const crumbs = (
    <div className="flex items-center gap-1.5 text-[13px] flex-wrap">
      <button onClick={() => { setCountry(null); setRegion(null); setCity(null); }}
        className={`px-2.5 py-1 rounded-pill ${country ? 'bg-primary-soft text-primary hover:opacity-80' : 'bg-primary text-primary-fg'} font-semibold transition`}>
        🗺️ {t('admin.locations')}
      </button>
      {country && (
        <>
          <span className="text-fg-subtle">›</span>
          <button onClick={() => { setRegion(null); setCity(null); }}
            className={`px-2.5 py-1 rounded-pill ${region ? 'bg-primary-soft text-primary hover:opacity-80' : 'bg-primary text-primary-fg'} font-semibold transition`}>
            {country.flag_emoji || '🏳️'} {localizedName(country, i18n.resolvedLanguage)}
          </button>
        </>
      )}
      {region && (
        <>
          <span className="text-fg-subtle">›</span>
          <button onClick={() => setCity(null)}
            className={`px-2.5 py-1 rounded-pill ${city ? 'bg-primary-soft text-primary hover:opacity-80' : 'bg-primary text-primary-fg'} font-semibold transition`}>
            {localizedName(region, i18n.resolvedLanguage)}
          </button>
        </>
      )}
      {city && (
        <>
          <span className="text-fg-subtle">›</span>
          <span className="px-2.5 py-1 rounded-pill bg-primary text-primary-fg font-semibold">{localizedName(city, i18n.resolvedLanguage)}</span>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t('admin.locations')} />
      {crumbs}

      {msg && (
        <div className={`px-4 py-3 rounded-card text-[13.5px] font-semibold ${
          msg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'
        }`}>{msg.text}</div>
      )}

      {!country && (
        <CountryPicker
          countries={countries} loading={loadingCountries}
          onPick={(c) => setCountry(c)}
        />
      )}

      {country && !region && (
        <RegionsPanel
          country={country}
          onPick={(r) => setRegion(r)}
          onMsg={showMsg}
        />
      )}

      {country && region && !city && (
        <CitiesPanel
          country={country} region={region}
          onPick={(c) => setCity(c)}
          onMsg={showMsg}
        />
      )}

      {country && region && city && <DistrictsPanel city={city} onMsg={showMsg} />}
    </div>
  );
}

function CountryPicker({ countries, loading, onPick }) {
  const { t, i18n } = useTranslation();
  if (loading) return <Skeleton />;
  if (!countries.length) {
    return <div className="bg-surface rounded-card border border-border"><EmptyState icon="🌍" title={t('admin.no_results')} /></div>;
  }
  return (
    <div className="bg-surface rounded-card border border-border p-3">
      <p className="text-[12.5px] text-fg-muted mb-2 px-1">{t('admin.locations_pick_country')}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {countries.map((c) => (
          <button key={c.id} onClick={() => onPick(c)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-card border-2 transition text-start ${
              c.is_active ? 'border-border bg-surface-alt hover:border-primary' : 'border-rose-200 bg-rose-50/50 opacity-70'
            }`}>
            <span className="text-2xl shrink-0">{c.flag_emoji || '🏳️'}</span>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-ink text-[13.5px] truncate">{localizedName(c, i18n.resolvedLanguage)}</div>
              <div className="text-[11px] text-fg-subtle truncate">{c.code} • {c.currency_code}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Regions panel
// ─────────────────────────────────────────────────────────────────────

function RegionsPanel({ country, onPick, onMsg }) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name_ar: '', name_en: '', code: '' });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ open: false });

  const load = () => {
    setLoading(true);
    adminListRegions({ country_id: country.id })
      .then((rows) => setItems(rows || []))
      .catch((e) => { setItems([]); onMsg('error', apiError(e)); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [country.id]);

  const openCreate = () => { setEditing(null); setForm({ name_ar: '', name_en: '', code: '' }); setEditOpen(true); };
  const openEdit = (r) => { setEditing(r); setForm({ name_ar: r.name_ar || '', name_en: r.name_en || '', code: r.code || '' }); setEditOpen(true); };

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, country_id: country.id };
      if (editing) await adminUpdateRegion(editing.id, payload);
      else         await adminCreateRegion(payload);
      setEditOpen(false);
      load();
      onMsg('success', t('admin.saved'));
    } catch (err) { onMsg('error', apiError(err)); }
    finally { setSaving(false); }
  };

  const askDelete = (r) => setConfirm({
    open: true,
    title: t('admin.confirm_delete_title'),
    body: `${t('admin.confirm_delete_body')} (${localizedName(r, i18n.resolvedLanguage)})`,
    tone: 'danger',
    onConfirm: async () => {
      try {
        await adminDeleteRegion(r.id);
        setConfirm({ open: false });
        load();
        onMsg('success', t('admin.deleted'));
      } catch (err) {
        setConfirm({ open: false });
        onMsg('error', apiError(err));
      }
    },
  });

  const toggleActive = async (r) => {
    try {
      await adminUpdateRegion(r.id, { is_active: r.is_active ? 0 : 1 });
      load();
    } catch (err) { onMsg('error', apiError(err)); }
  };

  const onReorder = async (newOrder) => {
    setItems(newOrder);
    try {
      await adminReorderRegions(newOrder.map((r) => r.id));
    } catch (err) { onMsg('error', apiError(err)); load(); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-ink">{t('admin.regions')} ({items.length})</h2>
        <AdminButton variant="primary" icon="+" onClick={openCreate}>{t('admin.new')}</AdminButton>
      </div>

      {loading ? <Skeleton /> : items.length === 0 ? (
        <div className="bg-surface rounded-card border border-border"><EmptyState icon="🏞️" title={t('admin.no_results')} /></div>
      ) : (
        <SortableList
          items={items}
          onReorder={onReorder}
          renderRow={(r, dragProps) => (
            <LocationRow
              item={r}
              subtitle={r.code || ''}
              onTap={() => onPick(r)}
              onEdit={() => openEdit(r)}
              onDelete={() => askDelete(r)}
              onToggleActive={() => toggleActive(r)}
              dragProps={dragProps}
            />
          )}
        />
      )}

      <RegionEditModal
        open={editOpen}
        editing={editing}
        form={form}
        setForm={setForm}
        saving={saving}
        onClose={() => setEditOpen(false)}
        onSave={onSave}
      />
      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
    </div>
  );
}

function RegionEditModal({ open, editing, form, setForm, saving, onClose, onSave }) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose}
      title={editing ? t('admin.edit') : t('admin.new')} width={460}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-pill bg-surface hover:bg-surface-alt text-fg-muted text-[13px] font-semibold border border-border transition">{t('admin.cancel_btn')}</button>
          <button type="submit" form="admin-region-form" disabled={saving} className="px-4 py-2 rounded-pill text-primary-fg text-[13px] font-semibold shadow-soft disabled:opacity-60 transition bg-primary-grad">{saving ? t('admin.saving') : t('admin.save')}</button>
        </>
      }>
      <form id="admin-region-form" onSubmit={onSave} className="space-y-3">
        <Field label={t('admin.country_name_ar')} required value={form.name_ar} onChange={(v) => setForm({ ...form, name_ar: v })} />
        <Field label={t('admin.country_name_en')} value={form.name_en} onChange={(v) => setForm({ ...form, name_en: v })} />
        <Field label={t('admin.country_code')} value={form.code} onChange={(v) => setForm({ ...form, code: v })} placeholder="RIY" />
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Cities panel
// ─────────────────────────────────────────────────────────────────────

function CitiesPanel({ country, region, onPick, onMsg }) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name_ar: '', name_en: '' });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ open: false });

  const load = () => {
    setLoading(true);
    adminListCities({ region_id: region.id })
      .then((rows) => setItems(rows || []))
      .catch((e) => { setItems([]); onMsg('error', apiError(e)); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [region.id]);

  const openCreate = () => { setEditing(null); setForm({ name_ar: '', name_en: '' }); setEditOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ name_ar: c.name_ar || '', name_en: c.name_en || '' }); setEditOpen(true); };

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, region_id: region.id };
      if (editing) await adminUpdateCity(editing.id, payload);
      else         await adminCreateCity(payload);
      setEditOpen(false);
      load();
      onMsg('success', t('admin.saved'));
    } catch (err) { onMsg('error', apiError(err)); }
    finally { setSaving(false); }
  };

  const askDelete = (c) => setConfirm({
    open: true,
    title: t('admin.confirm_delete_title'),
    body: `${t('admin.confirm_delete_body')} (${localizedName(c, i18n.resolvedLanguage)})`,
    tone: 'danger',
    onConfirm: async () => {
      try {
        await adminDeleteCity(c.id);
        setConfirm({ open: false });
        load();
        onMsg('success', t('admin.deleted'));
      } catch (err) {
        setConfirm({ open: false });
        onMsg('error', apiError(err));
      }
    },
  });

  const toggleActive = async (c) => {
    try {
      await adminUpdateCity(c.id, { is_active: c.is_active ? 0 : 1 });
      load();
    } catch (err) { onMsg('error', apiError(err)); }
  };

  const onReorder = async (newOrder) => {
    setItems(newOrder);
    try {
      await adminReorderCities(newOrder.map((c) => c.id));
    } catch (err) { onMsg('error', apiError(err)); load(); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-ink">{t('admin.cities')} ({items.length})</h2>
        <AdminButton variant="primary" icon="+" onClick={openCreate}>{t('admin.new')}</AdminButton>
      </div>

      {loading ? <Skeleton /> : items.length === 0 ? (
        <div className="bg-surface rounded-card border border-border"><EmptyState icon="🏙️" title={t('admin.no_results')} /></div>
      ) : (
        <SortableList
          items={items}
          onReorder={onReorder}
          renderRow={(c, dragProps) => (
            <LocationRow
              item={c}
              subtitle={c.code || ''}
              onTap={() => onPick(c)}
              onEdit={() => openEdit(c)}
              onDelete={() => askDelete(c)}
              onToggleActive={() => toggleActive(c)}
              dragProps={dragProps}
            />
          )}
        />
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)}
        title={editing ? t('admin.edit') : t('admin.new')} width={460}
        footer={
          <>
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-pill bg-surface hover:bg-surface-alt text-fg-muted text-[13px] font-semibold border border-border transition">{t('admin.cancel_btn')}</button>
            <button type="submit" form="admin-city-form" disabled={saving} className="px-4 py-2 rounded-pill text-primary-fg text-[13px] font-semibold shadow-soft disabled:opacity-60 transition bg-primary-grad">{saving ? t('admin.saving') : t('admin.save')}</button>
          </>
        }>
        <form id="admin-city-form" onSubmit={onSave} className="space-y-3">
          <Field label={t('admin.country_name_ar')} required value={form.name_ar} onChange={(v) => setForm({ ...form, name_ar: v })} />
          <Field label={t('admin.country_name_en')} value={form.name_en} onChange={(v) => setForm({ ...form, name_en: v })} />
        </form>
      </Modal>

      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sortable primitives — dnd-kit
// ─────────────────────────────────────────────────────────────────────

// A city's districts (AYK-045): search, add, rename, switch off or delete. Districts
// come from the National Address dataset and OpenStreetMap; the admin completes them.
function DistrictsPanel({ city, onMsg }) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name_ar: '', name_en: '' });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ open: false });

  const load = () => {
    setLoading(true);
    adminListDistricts(city.id)
      .then((rows) => setItems(rows || []))
      .catch((e) => { setItems([]); onMsg('error', apiError(e)); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [city.id]);

  const shown = useMemo(() => {
    const q = search.trim();
    return q ? items.filter((d) => `${d.name_ar} ${d.name_en || ''}`.includes(q)) : items;
  }, [items, search]);

  const openCreate = () => { setEditing(null); setForm({ name_ar: '', name_en: '' }); setEditOpen(true); };
  const openEdit = (d) => { setEditing(d); setForm({ name_ar: d.name_ar || '', name_en: d.name_en || '' }); setEditOpen(true); };
  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) await adminUpdateDistrict(editing.id, form);
      else await adminCreateDistrict({ ...form, city_id: city.id });
      setEditOpen(false);
      load();
      onMsg('success', t('admin.saved'));
    } catch (err) { onMsg('error', apiError(err)); }
    finally { setSaving(false); }
  };
  const askDelete = (d) => setConfirm({
    open: true, title: t('admin.confirm_delete_title'), body: `${t('admin.confirm_delete_body')} (${d.name_ar})`, tone: 'danger',
    onConfirm: async () => {
      setConfirm({ open: false });
      try { await adminDeleteDistrict(d.id); load(); } catch (err) { onMsg('error', apiError(err)); }
    },
  });
  const toggleActive = async (d) => {
    try { await adminUpdateDistrict(d.id, { is_active: d.is_active ? 0 : 1 }); load(); }
    catch (err) { onMsg('error', apiError(err)); }
  };

  return (
    <div className="space-y-3" data-testid="admin-districts">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-[15px] font-extrabold text-ink">{t('admin.districts')} ({items.length})</h2>
        <AdminButton variant="primary" icon="+" onClick={openCreate}>{t('admin.new')}</AdminButton>
      </div>
      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('admin.search_districts')}
        className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-[13.5px]" />
      {!loading && items.length === 0 && <p className="text-[13px] text-amber-700 m-0">{t('admin.no_districts_hint')}</p>}
      {loading ? <Skeleton /> : shown.length === 0 ? (
        <div className="bg-surface rounded-card border border-border"><EmptyState icon="🏘️" title={t('admin.no_results')} /></div>
      ) : (
        <div className="space-y-1.5">
          {shown.map((d) => (
            <LocationRow key={d.id} item={d} subtitle={d.name_en || ''}
              onEdit={() => openEdit(d)} onDelete={() => askDelete(d)} onToggleActive={() => toggleActive(d)} />
          ))}
        </div>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={editing ? t('admin.edit') : t('admin.new')} width={460}
        footer={
          <>
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-pill bg-surface hover:bg-surface-alt text-fg-muted text-[13px] font-semibold border border-border transition">{t('admin.cancel_btn')}</button>
            <button type="submit" form="admin-district-form" disabled={saving} className="px-4 py-2 rounded-pill text-primary-fg text-[13px] font-semibold shadow-soft disabled:opacity-60 transition bg-primary-grad">{saving ? t('admin.saving') : t('admin.save')}</button>
          </>
        }>
        <form id="admin-district-form" onSubmit={onSave} className="space-y-3">
          <Field label={t('admin.country_name_ar')} required value={form.name_ar} onChange={(v) => setForm({ ...form, name_ar: v })} />
          <Field label={t('admin.country_name_en')} value={form.name_en} onChange={(v) => setForm({ ...form, name_en: v })} />
        </form>
      </Modal>
      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
    </div>
  );
}

function SortableList({ items, onReorder, renderRow }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,  { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = useMemo(() => items.map((i) => i.id), [items]);

  const handleEnd = (e) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1.5">
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id}>
              {(dragProps) => renderRow(item, dragProps)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };
  return (
    <li ref={setNodeRef} style={style} className="touch-manipulation">
      {children({ attributes, listeners })}
    </li>
  );
}

function LocationRow({ item, subtitle, onTap, onEdit, onDelete, onToggleActive, dragProps }) {
  const { t, i18n } = useTranslation();
  return (
    <div className={`flex items-center gap-2 bg-surface rounded-card border-2 px-2.5 py-2 ${item.is_active ? 'border-border' : 'border-rose-200 opacity-70'}`}>
      {/* Drag handle — listeners attach ONLY here so buttons stay tappable */}
      {dragProps && <span
        {...(dragProps?.attributes || {})}
        {...(dragProps?.listeners || {})}
        className="grid place-items-center w-8 h-9 text-fg-subtle cursor-grab active:cursor-grabbing select-none touch-none -ms-1"
        aria-label={t('admin.drag_to_reorder')}
      >⋮⋮</span>}

      <button onClick={onTap} disabled={!onTap} className="flex-1 min-w-0 text-start py-1 disabled:cursor-default">
        <div className="font-bold text-ink text-[13.5px] truncate">{localizedName(item, i18n.resolvedLanguage)}</div>
        {subtitle && <div className="text-[11px] text-fg-subtle truncate">{subtitle}</div>}
      </button>

      <button onClick={onToggleActive}
        role="switch" aria-checked={!!item.is_active}
        className={`relative w-10 h-6 rounded-full transition shrink-0 ${item.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
          style={{ insetInlineStart: item.is_active ? 'calc(100% - 22px)' : '2px' }} />
      </button>

      <button onClick={onEdit} className="px-2.5 py-1 rounded-pill text-[11.5px] font-semibold bg-primary-soft text-primary hover:opacity-80 transition shrink-0">
        {t('admin.edit')}
      </button>
      <button onClick={onDelete} className="px-2.5 py-1 rounded-pill text-[11.5px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition shrink-0">
        {t('admin.delete')}
      </button>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false, placeholder = '' }) {
  return (
    <div>
      <label className="block text-[12px] font-bold text-ink mb-1">{label}</label>
      <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-card border border-border bg-surface-alt focus:bg-surface focus:border-primary outline-none text-[14px]" />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-[54px] rounded-card bg-surface border border-border animate-pulse" />
      ))}
    </div>
  );
}
