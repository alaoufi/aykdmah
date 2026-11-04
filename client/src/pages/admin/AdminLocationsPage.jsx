import { validateAdminCatalogForm, catalogResponseErrors } from '../../utils/adminCatalogValidation';
import { useAdminConfirmation } from '../../components/admin/confirmAdminChange';
import { localizedName } from '../../utils/localize';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAdminBack } from '../../components/admin/AdminBackNavigation';
import { readAdminLocationState, writeAdminLocationState } from '../../utils/adminLocationState';
const locationStorage = () => { try { return window.sessionStorage; } catch { return null; } };
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
import ConfirmDialog from '../../components/admin/AdminConfirmDialog';
import Modal from '../../components/admin/AdminModal';

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

  const { user } = useAuth();
  const [contextUserId, setContextUserId] = useState(user?.id);
  const ownsContext = contextUserId === user?.id;
  const [restoring, setRestoring] = useState(true);
  const remembered = useRef(readAdminLocationState(locationStorage(), user?.id));
  const restoredPath = useRef(null);
  const locationPath = [country?.id || '', region?.id || '', city?.id || ''].join('/');
  const rememberScroll = () => {
    if (!ownsContext || restoredPath.current !== locationPath) return;
    remembered.current.scroll[locationPath] = window.scrollY;
    writeAdminLocationState(locationStorage(), user?.id, remembered.current);
  };
  useAdminBack(ownsContext && country ? () => {
    rememberScroll();
    if (city) setCity(null);
    else if (region) setRegion(null);
    else setCountry(null);
  } : null);
  useEffect(() => {
    let active = true;
    setRestoring(true); setLoadingCountries(true);
    setContextUserId(user?.id);
    setCountry(null); setRegion(null); setCity(null); restoredPath.current = null;
    remembered.current = readAdminLocationState(locationStorage(), user?.id);
    void (async () => {
      try {
        const rows = await adminListCountries();
        if (!active) return;
        setCountries(rows || []);
        const selectedCountry = rows?.find(row => Number(row.id) === remembered.current.countryId);
        if (!selectedCountry) return;
        setCountry(selectedCountry);
        const regions = await adminListRegions({ country_id: selectedCountry.id });
        if (!active) return;
        const selectedRegion = regions?.find(row => Number(row.id) === remembered.current.regionId);
        if (!selectedRegion) return;
        setRegion(selectedRegion);
        const cities = await adminListCities({ region_id: selectedRegion.id });
        if (!active) return;
        const selectedCity = cities?.find(row => Number(row.id) === remembered.current.cityId);
        if (selectedCity) setCity(selectedCity);
      } catch (e) { if (active) setMsg({ type: 'error', text: apiError(e) }); }
      finally { if (active) { setLoadingCountries(false); setRestoring(false); } }
    })();
    return () => { active = false; };
  }, [user?.id]);
  useEffect(() => {
    if (restoring || !ownsContext) return;
    const state = remembered.current;
    state.countryId = country?.id || null; state.regionId = region?.id || null; state.cityId = city?.id || null;
    const save = () => {
      if (restoredPath.current !== locationPath) return;
      state.scroll[locationPath] = window.scrollY;
      writeAdminLocationState(locationStorage(), user?.id, state);
    };
    writeAdminLocationState(locationStorage(), user?.id, state);
    window.addEventListener('scroll', save, { passive: true });
    return () => { window.removeEventListener('scroll', save); };
  }, [user?.id, locationPath, restoring, ownsContext]);
  const restoreScroll = () => {
    if (restoring || !ownsContext || restoredPath.current === locationPath) return;
    const y = remembered.current.scroll[locationPath] || 0;
    restoredPath.current = locationPath;
    requestAnimationFrame(() => { if (restoredPath.current === locationPath) window.scrollTo({ top: y, behavior: 'instant' }); });
  };
  useEffect(() => { if (!loadingCountries && !country) restoreScroll(); }, [loadingCountries, restoring, country]);

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000); };

  const crumbs = (
    <div className="flex items-center gap-1.5 text-[13px] flex-wrap">
      <button onClick={() => { rememberScroll(); setCountry(null); setRegion(null); setCity(null); }}
        className={`px-2.5 py-1 rounded-pill ${country ? 'bg-primary-soft text-primary hover:opacity-80' : 'bg-primary text-primary-fg'} font-semibold transition`}>
        🗺️ {t('admin.locations')}
      </button>
      {country && (
        <>
          <span className="text-fg-subtle">›</span>
          <button onClick={() => { rememberScroll(); setRegion(null); setCity(null); }}
            className={`px-2.5 py-1 rounded-pill ${region ? 'bg-primary-soft text-primary hover:opacity-80' : 'bg-primary text-primary-fg'} font-semibold transition`}>
            {country.flag_emoji || '🏳️'} {localizedName(country, i18n.resolvedLanguage)}
          </button>
        </>
      )}
      {region && (
        <>
          <span className="text-fg-subtle">›</span>
          <button onClick={() => { rememberScroll(); setCity(null); }}
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
      {ownsContext && crumbs}

      {msg && (
        <div role="status" aria-live="polite" className={`fixed top-20 inset-x-4 max-w-xl mx-auto z-40 px-4 py-3 rounded-card shadow-soft text-[13.5px] font-semibold ${
          msg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'
        }`}>{msg.text}</div>
      )}

      {!restoring && ownsContext && !country && (
        <CountryPicker
          countries={countries} loading={loadingCountries}
          onPick={(c) => { rememberScroll(); setCountry(c); }}
        />
      )}

      {!restoring && ownsContext && country && !region && (
        <RegionsPanel
          key={country.id}
          country={country}
          onPick={(r) => { rememberScroll(); setRegion(r); }}
          onMsg={showMsg} onReady={restoreScroll}
        />
      )}

      {!restoring && ownsContext && country && region && !city && (
        <CitiesPanel
          key={region.id}
          country={country} region={region}
          onPick={(c) => { rememberScroll(); setCity(c); }}
          onMsg={showMsg} onReady={restoreScroll}
        />
      )}

      {!restoring && ownsContext && country && region && city && <DistrictsPanel key={city.id} city={city} onMsg={showMsg} onReady={restoreScroll}
        initialSearch={remembered.current.search} onSearchChange={(search) => { remembered.current.search = search; writeAdminLocationState(locationStorage(), user?.id, remembered.current); }} />}
      {(restoring || !ownsContext) && <Skeleton />}
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

function RegionsPanel({ country, onPick, onMsg, onReady }) {
  const { t, i18n } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const modalScroll = useRef(null);
  const captureModalScroll = () => { modalScroll.current = { x: window.scrollX, y: window.scrollY }; };
  const [form, setForm] = useState({ name_ar: '', name_en: '', code: '' });
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const updateForm = next => { setForm(next); setFieldErrors(prev => Object.fromEntries(Object.entries(prev).filter(([field]) => next[field] === form[field]))); };
  const [confirm, setConfirm] = useState({ open: false });

  const loadVersion = useRef(0);
  const loadedOnce = useRef(false);
  useEffect(() => { if (!loading) onReady?.(); }, [loading]);
  const load = () => {
    const version = ++loadVersion.current;
    if (!loadedOnce.current) setLoading(true);
    adminListRegions({ country_id: country.id })
      .then((rows) => { if (version === loadVersion.current) { loadedOnce.current = true; setItems(rows || []); } })
      .catch((e) => { if (version === loadVersion.current) onMsg('error', apiError(e)); })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };
  useEffect(load, [country.id]);

  const openCreate = () => { captureModalScroll(); setEditing(null); setForm({ name_ar: '', name_en: '', code: '' }); setFieldErrors({}); setEditOpen(true); };
  const openEdit = (r) => { captureModalScroll(); setEditing(r); setForm({ name_ar: r.name_ar || '', name_en: r.name_en || '', code: r.code || '' }); setFieldErrors({}); setEditOpen(true); };

  const onSave = async (e) => {
    e.preventDefault();
    const found = validateAdminCatalogForm('region', form, t);
    if (Object.keys(found).length) { setFieldErrors(found); return; }
    if (editing && !(await confirmAdminChange(t, editing.name_ar || editing.full_name || editing.title || editing.provider || ''))) return;
    setSaving(true);
    try {
      const payload = { ...form, country_id: country.id };
      if (editing) await adminUpdateRegion(editing.id, payload);
      else         await adminCreateRegion(payload);
      setEditOpen(false);
      load();
      onMsg('success', t('admin.saved'));
     } catch (err) {
      const found = catalogResponseErrors('region', err, t);
      if (Object.keys(found).length) setFieldErrors(found);
      else onMsg('error', apiError(err));
    }
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
    if (!(await confirmAdminChange(t))) return;
    try {
      await adminUpdateRegion(r.id, { is_active: r.is_active ? 0 : 1 });
      load();
    } catch (err) { onMsg('error', apiError(err)); }
  };

  const onReorder = async (newOrder) => {
    if (!(await confirmAdminChange(t))) return;
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
        scrollOrigin={modalScroll.current}
        open={editOpen}
        editing={editing}
        form={form}
        setForm={updateForm}
        errors={fieldErrors}
        saving={saving}
        onClose={() => setEditOpen(false)}
        onSave={onSave}
      />
      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
    </div>
  );
}

function RegionEditModal({ open, editing, form, setForm, saving, onClose, onSave, errors = {}, scrollOrigin }) {
  const { t } = useTranslation();
  return (
    <Modal scrollOrigin={scrollOrigin} open={open} onClose={onClose}
      title={editing ? t('admin.edit') : t('admin.new')} width={460}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-pill bg-surface hover:bg-surface-alt text-fg-muted text-[13px] font-semibold border border-border transition">{t('admin.cancel_btn')}</button>
          <button type="submit" form="admin-region-form" disabled={saving} className="px-4 py-2 rounded-pill text-primary-fg text-[13px] font-semibold shadow-soft disabled:opacity-60 transition bg-primary-grad">{saving ? t('admin.saving') : t('admin.save')}</button>
        </>
      }>
      <form noValidate id="admin-region-form" onSubmit={onSave} className="space-y-3">
        <Field label={t('admin.country_name_ar')} required error={errors.name_ar} value={form.name_ar} onChange={(v) => setForm({ ...form, name_ar: v })} />
        <Field label={t('admin.country_name_en')} error={errors.name_en} value={form.name_en} onChange={(v) => setForm({ ...form, name_en: v })} />
        <Field label={t('admin.country_code')} error={errors.code} value={form.code} onChange={(v) => setForm({ ...form, code: v })} placeholder="RIY" />
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Cities panel
// ─────────────────────────────────────────────────────────────────────

function CitiesPanel({ country, region, onPick, onMsg, onReady }) {
  const { t, i18n } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const modalScroll = useRef(null);
  const captureModalScroll = () => { modalScroll.current = { x: window.scrollX, y: window.scrollY }; };
  const [form, setForm] = useState({ name_ar: '', name_en: '' });
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const updateForm = next => { setForm(next); setFieldErrors(prev => Object.fromEntries(Object.entries(prev).filter(([field]) => next[field] === form[field]))); };
  const [confirm, setConfirm] = useState({ open: false });

  const loadVersion = useRef(0);
  const loadedOnce = useRef(false);
  useEffect(() => { if (!loading) onReady?.(); }, [loading]);
  const load = () => {
    const version = ++loadVersion.current;
    if (!loadedOnce.current) setLoading(true);
    adminListCities({ region_id: region.id })
      .then((rows) => { if (version === loadVersion.current) { loadedOnce.current = true; setItems(rows || []); } })
      .catch((e) => { if (version === loadVersion.current) onMsg('error', apiError(e)); })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };
  useEffect(load, [region.id]);

  const openCreate = () => { captureModalScroll(); setEditing(null); setForm({ name_ar: '', name_en: '' }); setFieldErrors({}); setEditOpen(true); };
  const openEdit = (c) => { captureModalScroll(); setEditing(c); setForm({ name_ar: c.name_ar || '', name_en: c.name_en || '' }); setFieldErrors({}); setEditOpen(true); };

  const onSave = async (e) => {
    e.preventDefault();
    const found = validateAdminCatalogForm('city', form, t);
    if (Object.keys(found).length) { setFieldErrors(found); return; }
    if (editing && !(await confirmAdminChange(t, editing.name_ar || editing.full_name || editing.title || editing.provider || ''))) return;
    setSaving(true);
    try {
      const payload = { ...form, region_id: region.id };
      if (editing) await adminUpdateCity(editing.id, payload);
      else         await adminCreateCity(payload);
      setEditOpen(false);
      load();
      onMsg('success', t('admin.saved'));
     } catch (err) {
      const found = catalogResponseErrors('city', err, t);
      if (Object.keys(found).length) setFieldErrors(found);
      else onMsg('error', apiError(err));
    }
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
    if (!(await confirmAdminChange(t))) return;
    try {
      await adminUpdateCity(c.id, { is_active: c.is_active ? 0 : 1 });
      load();
    } catch (err) { onMsg('error', apiError(err)); }
  };

  const onReorder = async (newOrder) => {
    if (!(await confirmAdminChange(t))) return;
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
      {/* Districts are managed inside each city (AYK-045). */}
      <p className="text-[12.5px] text-fg-muted m-0" data-testid="cities-districts-hint">🏘️ {t('admin.districts_hint')}</p>

      {loading ? <Skeleton /> : items.length === 0 ? (
        <div className="bg-surface rounded-card border border-border"><EmptyState icon="🏙️" title={t('admin.no_results')} /></div>
      ) : (
        <SortableList
          items={items}
          onReorder={onReorder}
          renderRow={(c, dragProps) => (
            <LocationRow
              item={c}
              subtitle={`🏘️ ${t('admin.districts')} ›`}
              onTap={() => onPick(c)}
              onEdit={() => openEdit(c)}
              onDelete={() => askDelete(c)}
              onToggleActive={() => toggleActive(c)}
              dragProps={dragProps}
            />
          )}
        />
      )}

      <Modal scrollOrigin={modalScroll.current} open={editOpen} onClose={() => setEditOpen(false)}
        title={editing ? t('admin.edit') : t('admin.new')} width={460}
        footer={
          <>
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-pill bg-surface hover:bg-surface-alt text-fg-muted text-[13px] font-semibold border border-border transition">{t('admin.cancel_btn')}</button>
            <button type="submit" form="admin-city-form" disabled={saving} className="px-4 py-2 rounded-pill text-primary-fg text-[13px] font-semibold shadow-soft disabled:opacity-60 transition bg-primary-grad">{saving ? t('admin.saving') : t('admin.save')}</button>
          </>
        }>
        <form noValidate id="admin-city-form" onSubmit={onSave} className="space-y-3">
          <Field label={t('admin.country_name_ar')} required error={fieldErrors.name_ar} value={form.name_ar} onChange={(v) => updateForm({ ...form, name_ar: v })} />
          <Field label={t('admin.country_name_en')} error={fieldErrors.name_en} value={form.name_en} onChange={(v) => updateForm({ ...form, name_en: v })} />
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
function DistrictsPanel({ city, onMsg, onReady, initialSearch, onSearchChange }) {
  const { t, i18n } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch || '');
  const [editing, setEditing] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const modalScroll = useRef(null);
  const captureModalScroll = () => { modalScroll.current = { x: window.scrollX, y: window.scrollY }; };
  const [form, setForm] = useState({ name_ar: '', name_en: '' });
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const updateForm = next => { setForm(next); setFieldErrors(prev => Object.fromEntries(Object.entries(prev).filter(([field]) => next[field] === form[field]))); };
  const [confirm, setConfirm] = useState({ open: false });

  const loadVersion = useRef(0);
  const loadedOnce = useRef(false);
  useEffect(() => { if (!loading) onReady?.(); }, [loading]);
  const load = () => {
    const version = ++loadVersion.current;
    if (!loadedOnce.current) setLoading(true);
    adminListDistricts(city.id)
      .then((rows) => { if (version === loadVersion.current) { loadedOnce.current = true; setItems(rows || []); } })
      .catch((e) => { if (version === loadVersion.current) onMsg('error', apiError(e)); })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };
  useEffect(load, [city.id]);

  const shown = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return q ? items.filter((d) => `${d.name_ar} ${d.name_en || ''}`.toLocaleLowerCase().includes(q)) : items;
  }, [items, search]);

  const openCreate = () => { captureModalScroll(); setEditing(null); setForm({ name_ar: '', name_en: '' }); setFieldErrors({}); setEditOpen(true); };
  const openEdit = (d) => { captureModalScroll(); setEditing(d); setForm({ name_ar: d.name_ar || '', name_en: d.name_en || '' }); setFieldErrors({}); setEditOpen(true); };
  const onSave = async (e) => {
    e.preventDefault();
    const found = validateAdminCatalogForm('district', form, t);
    if (Object.keys(found).length) { setFieldErrors(found); return; }
    if (editing && !(await confirmAdminChange(t, editing.name_ar || editing.full_name || editing.title || editing.provider || ''))) return;
    setSaving(true);
    try {
      if (editing) await adminUpdateDistrict(editing.id, form);
      else await adminCreateDistrict({ ...form, city_id: city.id });
      setEditOpen(false);
      load();
      onMsg('success', t('admin.saved'));
     } catch (err) {
      const found = catalogResponseErrors('district', err, t);
      if (Object.keys(found).length) setFieldErrors(found);
      else onMsg('error', apiError(err));
    }
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
    if (!(await confirmAdminChange(t))) return;
    try { await adminUpdateDistrict(d.id, { is_active: d.is_active ? 0 : 1 }); load(); }
    catch (err) { onMsg('error', apiError(err)); }
  };

  return (
    <div className="space-y-3" data-testid="admin-districts">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-[15px] font-extrabold text-ink">{t('admin.districts')} ({items.length})</h2>
        <AdminButton variant="primary" icon="+" onClick={openCreate}>{t('admin.new')}</AdminButton>
      </div>
      <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); onSearchChange?.(e.target.value); }} placeholder={t('admin.search_districts')}
        className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-[13.5px]" />
      {!loading && items.length === 0 && <p className="text-[13px] text-amber-700 m-0">{t('admin.no_districts_hint')}</p>}
      {loading ? <Skeleton /> : shown.length === 0 ? (
        <div className="bg-surface rounded-card border border-border"><EmptyState icon="🏘️" title={t('admin.no_results')} /></div>
      ) : (
        <div className="space-y-1.5">
          {shown.map((d) => (
            <LocationRow key={d.id} item={d} subtitle={localizedName(d, i18n.resolvedLanguage) === d.name_en ? '' : d.name_en || ''}
              onEdit={() => openEdit(d)} onDelete={() => askDelete(d)} onToggleActive={() => toggleActive(d)} />
          ))}
        </div>
      )}

      <Modal scrollOrigin={modalScroll.current} open={editOpen} onClose={() => setEditOpen(false)} title={editing ? t('admin.edit') : t('admin.new')} width={460}
        footer={
          <>
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-pill bg-surface hover:bg-surface-alt text-fg-muted text-[13px] font-semibold border border-border transition">{t('admin.cancel_btn')}</button>
            <button type="submit" form="admin-district-form" disabled={saving} className="px-4 py-2 rounded-pill text-primary-fg text-[13px] font-semibold shadow-soft disabled:opacity-60 transition bg-primary-grad">{saving ? t('admin.saving') : t('admin.save')}</button>
          </>
        }>
        <form noValidate id="admin-district-form" onSubmit={onSave} className="space-y-3">
          <Field label={t('admin.country_name_ar')} required error={fieldErrors.name_ar} value={form.name_ar} onChange={(v) => updateForm({ ...form, name_ar: v })} />
          <Field label={t('admin.country_name_en')} error={fieldErrors.name_en} value={form.name_en} onChange={(v) => updateForm({ ...form, name_en: v })} />
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
        aria-label={`${t('admin.status')} ${localizedName(item, i18n.resolvedLanguage)}`}
        className="w-11 h-11 grid place-items-center shrink-0">
        <span aria-hidden="true" className={`relative block w-10 h-6 rounded-full transition ${item.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
          <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
            style={{ insetInlineStart: item.is_active ? 'calc(100% - 22px)' : '2px' }} />
        </span>
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

function Field({ label, value, onChange, type = 'text', required = false, placeholder = '', error }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={`block text-[12px] font-bold mb-1 ${error ? 'text-rose-600' : 'text-ink'}`}>{label}</label>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full px-3 py-2 rounded-card border outline-none text-[14px] ${error ? 'border-2 border-rose-500 bg-rose-50' : 'border-border bg-surface-alt focus:bg-surface focus:border-primary'}`} />
      {error && <span id={`${id}-error`} role="alert" className="block mt-1 text-[12px] font-bold text-rose-600">{error}</span>}
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
