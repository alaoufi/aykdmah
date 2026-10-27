import { localizedName } from '../../utils/localize';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listAds, createAd, updateAd, deleteAd, uploadAdMedia,
  approveAdAdmin, rejectAdAdmin, activateAdAdmin,
  pauseAdAdmin, resumeAdAdmin, getAdStatsAdmin,
  getAdsPlacementPricing, saveAdsPlacementPricing, adminPreviewLiveAds, diagnoseAd,
} from '../../services/adminService';
import AdSparkline from '../../components/ads/AdSparkline';
import { listCities, listRegions } from '../../services/serviceService';
import { apiError } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import EmptyState from '../../components/admin/EmptyState';
import AdminFab from '../../components/admin/AdminFab';
import { formatRelativeTime } from '../../utils/formatters';
import { safeUrl } from '../../utils/urlSafety';

// All 15 placements supported by the renderer. Keep in sync with
// server/services/adRequestService.js ALLOWED_PLACEMENTS.
const PLACEMENTS = [
  'home_top', 'home_hero', 'home_middle', 'home_bottom',
  'services_top', 'services_bottom',
  'category_top', 'category_bottom',
  'request_details_top', 'request_details_bottom',
  'sidebar', 'search',
  'profile_top', 'chat_sidebar', 'footer',
];

const EMPTY = {
  title: '', description: '', image: '', media_type: 'image', link: '',
  placement: 'home_top', placements: ['home_top'],
  starts_at: '', ends_at: '', max_views: '', sort_order: 0,
  is_active: true, exclusive: false,
  target_countries: [], target_regions: [], target_cities: [],
};

const COUNTRY_OPTIONS = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'EG', 'JO', 'YE', 'IQ'].map(code => ({ code }));

// Browser-detectable media type from URL extension — used when an admin
// pastes a URL instead of uploading. Server detects mime from the file
// on upload, so this is only a fallback for raw URLs.
function guessMediaTypeFromUrl(url) {
  const ext = String(url || '').split('?')[0].split('#')[0].split('.').pop().toLowerCase();
  if (['mp4', 'webm', 'ogv', 'ogg', 'mov', 'm4v'].includes(ext)) return 'video';
  return 'image';
}

// Single component that renders the right tag for whatever ad media
// the admin saved. Reused in the list card and the modal preview.
function AdMedia({ url, type, className = '' }) {
  const src = safeUrl(url);
  if (!src) return null;
  if (type === 'video') {
    return (
      <video src={src} autoPlay muted loop playsInline className={className} />
    );
  }
  return <img src={src} alt="" referrerPolicy="no-referrer" className={className} />;
}

export default function AdminAdsPage() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirm, setConfirm] = useState({ open: false });
  const [uploading, setUploading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [search, setSearch] = useState('');
  const [openStats, setOpenStats] = useState({});
  const editVersion = useRef(0);
  const uploadVersion = useRef(0);
  const loadVersion = useRef(0);
  const diagVersion = useRef(0);
  const previewVersion = useRef(0);
  const saveInFlight = useRef(false);

  const toggleStats = async (a) => {
    if (openStats[a.id]) {
      const next = { ...openStats }; delete next[a.id];
      setOpenStats(next);
      return;
    }
    setOpenStats((s) => ({ ...s, [a.id]: { loading: true } }));
    try {
      const res = await getAdStatsAdmin(a.id, 14);
      setOpenStats((s) => ({ ...s, [a.id]: { loading: false, daily: res.daily } }));
    } catch (_) { setOpenStats((s) => ({ ...s, [a.id]: { loading: false, daily: [] } })); }
  };

  const onPause = async (a) => {
    setBusy(a.id);
    try { await pauseAdAdmin(a.id); load(); }
    catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
    finally { setBusy(null); }
  };

  const onResume = async (a) => {
    setBusy(a.id);
    try { await resumeAdAdmin(a.id); load(); }
    catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
    finally { setBusy(null); }
  };

  // --- Placement pricing table ---
  const [cities, setCities] = useState([]);
  const [regions, setRegions] = useState([]);
  useEffect(() => {
    listCities().then(setCities).catch(() => setCities([]));
    listRegions().then(setRegions).catch(() => setRegions([]));
  }, []);
  const [pricing, setPricing] = useState([]);
  const [pricingDirty, setPricingDirty] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);
  useEffect(() => {
    getAdsPlacementPricing().then((rows) => setPricing(rows || [])).catch(() => setPricing([]));
  }, []);
  const updatePricing = (idx, field, value) => {
    setPricing((rows) => rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    setPricingDirty(true);
  };
  const savePricing = async () => {
    setPricingSaving(true);
    try {
      const rows = await saveAdsPlacementPricing(pricing.map((r) => ({
        placement: r.placement,
        price_per_day: Number(r.price_per_day) || 0,
        price_per_1k_views: Number(r.price_per_1k_views) || 0,
        exclusive_multiplier: Number(r.exclusive_multiplier) || 1,
        is_active: r.is_active,
      })));
      setPricing(rows || []);
      setPricingDirty(false);
      setMsg({ type: 'success', text: t('admin.saved') });
    } catch (e) {
      setMsg({ type: 'error', text: apiError(e) });
    } finally { setPricingSaving(false); }
  };

  // --- Per-ad diagnostic ---
  const [diag, setDiag] = useState(null); // { ad, checks, live, geo, placement, loading }
  const openDiag = async (a) => {
    const version = ++diagVersion.current;
    const placement = (Array.isArray(a.placements) && a.placements[0]) || a.placement || 'home_top';
    setDiag({ loading: true, placement, adId: a.id });
    try {
      const res = await diagnoseAd(a.id, placement);
      if (version !== diagVersion.current) return;
      setDiag({ ...res, loading: false });
    } catch (_) { if (version === diagVersion.current) setDiag({ loading: false, error: true, adId: a.id, placement }); }
  };
  const closeDiag = () => { ++diagVersion.current; setDiag(null); };

  // --- Preview live ads (diagnostic) ---
  const [preview, setPreview] = useState(null); // { placement, items, loading }
  const openPreview = async (placement) => {
    const version = ++previewVersion.current;
    setPreview({ placement, loading: true, items: [] });
    try {
      const items = await adminPreviewLiveAds(placement);
      if (version !== previewVersion.current) return;
      setPreview({ placement, loading: false, items: items || [] });
    } catch (_) { if (version === previewVersion.current) setPreview({ placement, loading: false, items: [] }); }
  };
  const closePreview = () => { ++previewVersion.current; setPreview(null); };

  const onPickFile = async (file) => {
    if (!file) return;
    const version = ++uploadVersion.current;
    setUploading(true);
    setFormError('');
    try {
      const res = await uploadAdMedia(file);
      if (version !== uploadVersion.current) return;
      setForm((f) => ({ ...f, image: res.url, media_type: res.media_type }));
    } catch (err) {
      if (version === uploadVersion.current) setFormError(apiError(err) || t('errors.generic'));
    } finally { if (version === uploadVersion.current) setUploading(false); }
  };

  const load = () => {
    const version = ++loadVersion.current;
    setLoading(true);
    listAds({ status: statusFilter, limit: 50 })
      .then((res) => { if (version === loadVersion.current) { setItems(res.data || []); setMeta(res.meta); } })
      .catch((e) => { if (version === loadVersion.current) { setItems([]); setMeta(null); setMsg({ type: 'error', text: apiError(e) }); } })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

  const closeEdit = () => {
    ++editVersion.current; ++uploadVersion.current;
    setUploading(false); setEditOpen(false); setEditing(null); setForm(EMPTY); setFormError('');
  };
  const openCreate = () => {
    ++editVersion.current; ++uploadVersion.current;
    setUploading(false); setEditing(null); setForm(EMPTY); setFormError(''); setEditOpen(true);
  };
  const openEdit = (a) => {
    ++editVersion.current; ++uploadVersion.current; setUploading(false);
    setEditing(a);
    const placements = Array.isArray(a.placements) && a.placements.length
      ? a.placements
      : [a.placement || 'home_top'];
    setForm({
      title: a.title || '', description: a.description || '', image: a.image || '',
      media_type: a.media_type || guessMediaTypeFromUrl(a.image),
      link: a.link || '',
      placement: placements[0],
      placements,
      starts_at: a.starts_at ? a.starts_at.slice(0, 16) : '',
      ends_at: a.ends_at ? a.ends_at.slice(0, 16) : '',
      max_views: a.max_views || '',
      sort_order: a.sort_order || 0,
      is_active: !!a.is_active,
      exclusive: !!a.exclusive,
      target_countries: Array.isArray(a.target_countries) ? a.target_countries : [],
      target_regions:   Array.isArray(a.target_regions)   ? a.target_regions   : [],
      target_cities:    Array.isArray(a.target_cities)    ? a.target_cities    : [],
    });
    setFormError('');
    setEditOpen(true);
  };

  const onSave = async (e) => {
    e.preventDefault();
    if (uploading || saveInFlight.current) return;
    if ((form.link && !safeUrl(form.link)) || (form.image && !safeUrl(form.image))) {
      setFormError(t('errors.generic')); return;
    }
    const version = editVersion.current;
    saveInFlight.current = true;
    setSaving(true);
    setFormError('');
    try {
      // The primary `placement` column still drives back-compat
      // queries — keep it set to the first checked placement. Send
      // the full multi-select as `placements` JSON.
      const primary = form.placements?.[0] || form.placement || 'home_top';
      const payload = {
        ...form,
        link: safeUrl(form.link),
        image: safeUrl(form.image),
        is_active: form.is_active ? 1 : 0,
        exclusive: form.exclusive ? 1 : 0,
        placement: primary,
        placements: form.placements && form.placements.length ? form.placements : [primary],
        max_views: form.max_views === '' || form.max_views == null ? null : Number(form.max_views),
        starts_at: form.starts_at ? form.starts_at.replace('T', ' ') + ':00' : null,
        ends_at: form.ends_at ? form.ends_at.replace('T', ' ') + ':00' : null,
        target_countries: form.target_countries?.length ? form.target_countries : null,
        target_regions:   form.target_regions?.length   ? form.target_regions   : null,
        target_cities:    form.target_cities?.length    ? form.target_cities    : null,
      };
      if (editing) await updateAd(editing.id, payload);
      else await createAd(payload);
      if (version !== editVersion.current) return;
      closeEdit();
      load();
    } catch (err) {
      if (version === editVersion.current) setFormError(apiError(err) || t('errors.generic'));
    } finally { saveInFlight.current = false; setSaving(false); }
  };

  const askDelete = (a) => {
    setConfirm({
      open: true,
      title: t('admin.confirm_delete_title'),
      body: `${t('admin.confirm_delete_body')} (${a.title})`,
      tone: 'danger',
      onConfirm: async () => {
        await deleteAd(a.id);
        setConfirm({ open: false });
        load();
      },
    });
  };

  const onApprove = async (a) => {
    setBusy(a.id);
    try { await approveAdAdmin(a.id); setMsg({ type: 'success', text: t('promote.admin_approved') }); load(); }
    catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
    finally { setBusy(null); }
  };

  const onReject = async (a) => {
    const reason = window.prompt(t('badge.reject_reason_prompt'), '');
    if (reason === null) return;
    setBusy(a.id);
    try { await rejectAdAdmin(a.id, reason); setMsg({ type: 'success', text: t('promote.admin_rejected') }); load(); }
    catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
    finally { setBusy(null); }
  };

  const onActivate = async (a) => {
    setBusy(a.id);
    try { await activateAdAdmin(a.id); setMsg({ type: 'success', text: t('promote.admin_activated') }); load(); }
    catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
    finally { setBusy(null); }
  };

  const STATUS_TABS = [
    { value: '',                  label: t('common.all') },
    { value: 'requested',         label: t('promote.status_requested') },
    { value: 'approved',          label: t('promote.status_approved') },
    { value: 'awaiting_payment',  label: t('promote.status_awaiting_payment') },
    { value: 'active',            label: t('promote.status_active') },
    { value: 'rejected',          label: t('promote.status_rejected') },
    { value: 'expired',           label: t('promote.status_expired') },
  ];

  const STATUS_COLOR = {
    requested:        'bg-blue-50 text-blue-700',
    approved:         'bg-emerald-50 text-emerald-700',
    awaiting_payment: 'bg-amber-50 text-amber-700',
    active:           'bg-emerald-100 text-emerald-800',
    rejected:         'bg-rose-50 text-rose-700',
    expired:          'bg-slate-100 text-slate-600',
    cancelled:        'bg-slate-100 text-slate-500',
    paused:           'bg-slate-100 text-slate-500',
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('admin.ads')} count={meta?.pagination?.total ?? items.length}>
        <AdminButton variant="primary" icon="+" onClick={openCreate}>{t('admin.new')}</AdminButton>
      </AdminPageHeader>

      {msg && (
        <div className={`px-4 py-3 rounded-card text-[13.5px] font-semibold ${
          msg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'
        }`}>{msg.text}</div>
      )}

      {/* Live placement breakdown — counts ACTIVE ads in each zone so
          the admin can quickly verify that an ad is actually going
          out where they intended. Click a chip to preview exactly
          what /api/ads/live would return for that placement. */}
      <div className="bg-white rounded-card border border-slate-100 shadow-soft p-4">
        <div className="text-[13px] font-extrabold text-ink mb-2">📍 {t('promote.live_breakdown')}</div>
        <p className="text-[11.5px] text-slate-500 mb-2">{t('promote.click_to_preview')}</p>
        <div className="flex flex-wrap gap-2">
          {PLACEMENTS.map((p) => {
            const count = items.filter((a) =>
              a.status === 'active' && a.is_active &&
              ((a.placement === p) || (Array.isArray(a.placements) && a.placements.includes(p)))
            ).length;
            return (
              <button key={p}
                onClick={() => openPreview(p)}
                type="button"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11.5px] font-semibold transition hover:scale-105 ${
                  count > 0 ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                }`}>
                {t(`admin.ad_placement_${p}`)} <b>{count}</b>
              </button>
            );
          })}
        </div>
      </div>

      {/* Per-placement pricing table */}
      <div className="bg-white rounded-card border border-slate-100 shadow-soft overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2">
          <h3 className="text-ink font-extrabold text-[14px]">💰 {t('promote.placement_pricing_title')}</h3>
          <button onClick={savePricing} disabled={!pricingDirty || pricingSaving}
            className={`px-4 py-1.5 rounded-pill text-[12.5px] font-bold transition shrink-0 ${
              pricingDirty && !pricingSaving
                ? 'text-white shadow-soft'
                : 'text-slate-400 bg-slate-100 cursor-not-allowed'
            }`}
            style={pricingDirty && !pricingSaving ? { background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' } : undefined}>
            {pricingSaving ? '⏳ ' + t('admin.saving') : `✓ ${t('admin.save')}`}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="bg-slate-50 text-[11.5px] font-bold text-slate-500 uppercase">
              <tr>
                <th className="text-start px-4 py-2">{t('promote.placement')}</th>
                <th className="text-end px-3 py-2">{t('promote.price_per_day_short')}</th>
                <th className="text-end px-3 py-2">{t('promote.price_per_1k_views_short')}</th>
                <th className="text-end px-3 py-2">🔒 ×</th>
                <th className="text-center px-3 py-2">{t('admin.active')}</th>
              </tr>
            </thead>
            <tbody>
              {pricing.map((row, i) => (
                <tr key={row.placement} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <div className="font-semibold text-ink">{t(`admin.ad_placement_${row.placement}`)}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{row.placement}</div>
                  </td>
                  <td className="px-3 py-2 text-end">
                    <input type="number" value={row.price_per_day}
                      onChange={(e) => updatePricing(i, 'price_per_day', e.target.value)}
                      className="w-24 px-2 py-1.5 rounded border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-end" />
                  </td>
                  <td className="px-3 py-2 text-end">
                    <input type="number" value={row.price_per_1k_views}
                      onChange={(e) => updatePricing(i, 'price_per_1k_views', e.target.value)}
                      className="w-24 px-2 py-1.5 rounded border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-end" />
                  </td>
                  <td className="px-3 py-2 text-end">
                    <input type="number" step="0.1" value={row.exclusive_multiplier}
                      onChange={(e) => updatePricing(i, 'exclusive_multiplier', e.target.value)}
                      className="w-16 px-2 py-1.5 rounded border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-end" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={!!row.is_active}
                      onChange={(e) => updatePricing(i, 'is_active', e.target.checked ? 1 : 0)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11.5px] text-slate-500 border-t border-slate-100">{t('promote.placement_pricing_hint')}</p>
      </div>

      <div className="bg-white rounded-card border border-slate-100 p-3 shadow-soft space-y-3">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {STATUS_TABS.map((tab) => (
            <button key={tab.value} onClick={() => setStatusFilter(tab.value)}
              className={`shrink-0 px-3.5 py-1.5 rounded-pill text-[12.5px] font-semibold transition border ${
                statusFilter === tab.value
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
              }`}>{tab.label}</button>
          ))}
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.search_placeholder')}
          className="w-full px-3 py-2 rounded-pill border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[13px]" />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[100px] rounded-card bg-white border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : (() => {
        const q = search.trim().toLowerCase();
        const filtered = q
          ? items.filter((a) =>
              (a.title || '').toLowerCase().includes(q) ||
              (a.description || '').toLowerCase().includes(q) ||
              (a.user_name || '').toLowerCase().includes(q))
          : items;
        if (filtered.length === 0) {
          return <div className="bg-white rounded-card border border-slate-100"><EmptyState icon="📣" title={t('admin.no_results')} /></div>;
        }
        return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((a) => (
            <div key={a.id} className="bg-white rounded-card border border-slate-100 p-4 flex gap-3 shadow-soft hover:shadow-card transition">
              {a.image ? (
                <div className="w-20 h-20 rounded-card overflow-hidden bg-slate-100 shrink-0 grid place-items-center">
                  <AdMedia url={a.image} type={a.media_type || guessMediaTypeFromUrl(a.image)}
                    className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-card bg-slate-100 grid place-items-center text-2xl shrink-0">📣</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="font-bold text-ink text-[14px] truncate flex-1">{a.title}</div>
                  <span className={`px-2 py-0.5 rounded-pill text-[10.5px] font-bold shrink-0 ${STATUS_COLOR[a.status] || 'bg-slate-100 text-slate-500'}`}>
                    {t(`promote.status_${a.status}`)}
                  </span>
                </div>
                {a.user_name && (
                  <div className="text-[11.5px] text-slate-600 mb-1">
                    👤 <b>{a.user_name}</b>
                    {a.amount > 0 && <span className="text-slate-400"> • {Number(a.amount).toFixed(2)} {t('common.currency')}</span>}
                  </div>
                )}
                <div className="text-[11.5px] text-slate-500 mb-1">
                  {(Array.isArray(a.placements) && a.placements.length ? a.placements : [a.placement]).map((p) => t(`admin.ad_placement_${p}`)).join(' • ')}
                </div>
                <div className="text-[11.5px] text-slate-500 mb-1">
                  {t('admin.ad_views')} {a.views_count || 0}{a.max_views ? `/${a.max_views.toLocaleString(i18n.resolvedLanguage)}` : ''} · {t('admin.ad_clicks')} {a.clicks_count || 0}
                </div>
                {safeUrl(a.link) && (
                  <a href={safeUrl(a.link)} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-brand-700 hover:underline mb-1 max-w-full">
                    🔗 <span className="truncate">{a.link}</span>
                  </a>
                )}
                {a.description && <p className="text-[12px] text-slate-600 line-clamp-2 mb-2">{a.description}</p>}
                {a.notes && (
                  <div className="mt-1 mb-2 p-2 rounded bg-slate-50 text-[12px] text-slate-700">«{a.notes}»</div>
                )}
                {a.rejection_reason && (
                  <div className="mt-1 mb-2 p-2 rounded bg-rose-50 text-[12px] text-rose-700">{t('badge.reason')}: {a.rejection_reason}</div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {a.status === 'requested' && (
                    <>
                      <button onClick={() => onApprove(a)} disabled={busy === a.id} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-60">✓ {t('badge.approve')}</button>
                      <button onClick={() => onReject(a)}  disabled={busy === a.id} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition disabled:opacity-60">✗ {t('badge.reject')}</button>
                    </>
                  )}
                  {a.status === 'awaiting_payment' && (
                    <button onClick={() => onActivate(a)} disabled={busy === a.id} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition disabled:opacity-60">▶ {t('promote.activate')}</button>
                  )}
                  {a.status === 'active' && (
                    <button onClick={() => onPause(a)} disabled={busy === a.id} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 transition disabled:opacity-60">⏸ {t('promote.pause')}</button>
                  )}
                  {a.status === 'paused' && (
                    <button onClick={() => onResume(a)} disabled={busy === a.id} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-60">▶ {t('promote.resume')}</button>
                  )}
                  {(a.status === 'active' || a.status === 'paused' || a.status === 'expired') && (
                    <button onClick={() => toggleStats(a)} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition">📊 {openStats[a.id] ? t('promote.hide_stats') : t('promote.show_stats')}</button>
                  )}
                  <button onClick={() => openDiag(a)} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition" title={t('promote.diagnose_hint')}>🩺 {t('promote.diagnose')}</button>
                  <button onClick={() => openEdit(a)} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 transition">{t('admin.edit')}</button>
                  <button onClick={() => askDelete(a)} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition">{t('admin.delete')}</button>
                </div>
                {openStats[a.id] && (
                  <div className="mt-3 p-3 rounded-card border border-slate-100 bg-white">
                    {openStats[a.id].loading ? (
                      <div className="h-24 rounded bg-slate-100 animate-pulse" />
                    ) : (
                      <AdSparkline daily={openStats[a.id].daily} />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        );
      })()}

      <Modal
        open={editOpen}
        onClose={closeEdit}
        title={editing ? t('admin.edit') : t('admin.new')}
        width={620}
        footer={
          <>
            <button onClick={closeEdit} className="px-4 py-2 rounded-pill bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-semibold border border-slate-200 transition">{t('admin.cancel_btn')}</button>
            <button type="submit" form="AdminAdsPage-form" disabled={saving || uploading} className="px-4 py-2 rounded-pill text-white text-[13px] font-semibold shadow-soft disabled:opacity-60 transition" style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}>{saving ? t('admin.saving') : t('admin.save')}</button>
          </>
        }
      >
        <form id="AdminAdsPage-form" onSubmit={onSave} className="space-y-3">
          {formError && <div className="px-3 py-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[13px]">{formError}</div>}
          <FieldA label={t('admin.ad_title')} value={form.title} onChange={(v) => setForm({ ...form, title: v })} required />
          <FieldA label={t('admin.ad_description')} value={form.description} onChange={(v) => setForm({ ...form, description: v })} multiline />
          <div>
            <label className="block text-[12px] font-bold text-ink mb-1">{t('admin.ad_media')}</label>

            {/* Primary: device upload — big drop zone */}
            <label className="block cursor-pointer">
              <div className={`rounded-card border-2 border-dashed p-5 text-center transition ${
                uploading ? 'border-brand-400 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50'
              }`}>
                <div className="text-3xl mb-1">{uploading ? '⏳' : '📁'}</div>
                <div className="font-bold text-[13.5px] text-ink">
                  {uploading ? t('admin.uploading') : t('admin.ad_pick_file_primary')}
                </div>
                <div className="text-[11.5px] text-slate-500 mt-1">{t('admin.ad_media_hint')}</div>
              </div>
              <input type="file" hidden
                accept="image/jpeg,image/png,image/webp,image/gif,image/apng,video/mp4,video/webm,video/ogg"
                onChange={(e) => onPickFile(e.target.files?.[0])} />
            </label>

            {/* Secondary: paste a URL — collapsible-ish accent line */}
            <details className="mt-2 group">
              <summary className="text-[12px] text-slate-500 cursor-pointer hover:text-brand-700 select-none">
                🔗 {t('admin.ad_use_url_instead')}
              </summary>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-[1fr_140px] gap-2">
                <input value={form.image}
                  onChange={(e) => setForm({ ...form, image: e.target.value, media_type: guessMediaTypeFromUrl(e.target.value) })}
                  placeholder="https://…"
                  className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]" />
                <select value={form.media_type}
                  onChange={(e) => setForm({ ...form, media_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]">
                  <option value="image">🖼️ {t('admin.ad_media_image')}</option>
                  <option value="video">🎬 {t('admin.ad_media_video')}</option>
                </select>
              </div>
            </details>

            {form.image && (
              <div className="mt-3 p-2 rounded-card bg-slate-50 border border-slate-200">
                {safeUrl(form.link) ? (
                  <a href={safeUrl(form.link)} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90 transition" title={form.link}>
                    <AdMedia url={form.image} type={form.media_type}
                      className="max-h-40 w-auto mx-auto rounded object-contain" />
                  </a>
                ) : (
                  <AdMedia url={form.image} type={form.media_type}
                    className="max-h-40 w-auto mx-auto rounded object-contain" />
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-[12px] font-bold text-ink mb-1">{t('admin.ad_link')}</label>
            <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })}
              placeholder="https://…"
              className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]" />
            <p className="text-[11.5px] text-slate-500 mt-1">{t('admin.ad_link_hint')}</p>
          </div>
          <div>
            <label className="block text-[12px] font-bold text-ink mb-2">{t('promote.placements')}</label>
            <div className="flex flex-wrap gap-2">
              {PLACEMENTS.map((p) => {
                const active = form.placements.includes(p);
                return (
                  <button key={p} type="button"
                    onClick={() => setForm((f) => {
                      const set = new Set(f.placements);
                      if (set.has(p)) set.delete(p); else set.add(p);
                      const next = Array.from(set);
                      return { ...f, placements: next.length ? next : [p], placement: next[0] || p };
                    })}
                    className={`px-3 py-1.5 rounded-pill border-2 text-[12.5px] font-semibold transition ${
                      active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >{active ? '✓ ' : ''}{t(`admin.ad_placement_${p}`)}</button>
                );
              })}
            </div>
            <p className="text-[11.5px] text-slate-500 mt-2">{t('promote.placements_admin_hint')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FieldA label={t('admin.ad_starts_at')} type="datetime-local" value={form.starts_at} onChange={(v) => setForm({ ...form, starts_at: v })} />
            <FieldA label={t('admin.ad_ends_at')} type="datetime-local" value={form.ends_at} onChange={(v) => setForm({ ...form, ends_at: v })} />
            <FieldA label={t('promote.max_views')} type="number" value={form.max_views} onChange={(v) => setForm({ ...form, max_views: v })} placeholder="—" />
          </div>
          <FieldA label={t('admin.ad_sort_order')} type="number" value={form.sort_order} onChange={(v) => setForm({ ...form, sort_order: Number(v) || 0 })} />
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              <span>{t('admin.is_active')}</span>
            </label>
            <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" checked={!!form.exclusive} onChange={(e) => setForm({ ...form, exclusive: e.target.checked })} />
              <span>🔒 {t('promote.exclusive_mode')}</span>
            </label>
          </div>
          <p className="text-[11.5px] text-slate-500 -mt-2">{t('promote.exclusive_hint')}</p>

          {/* Geo targeting */}
          <div className="rounded-card border border-slate-200 p-3 space-y-3">
            <div className="text-[12.5px] font-bold text-ink">🌍 {t('promote.geo_targeting')}</div>
            <p className="text-[11.5px] text-slate-500 -mt-1">{t('promote.geo_targeting_hint')}</p>
            <div>
              <div className="text-[11px] font-semibold text-slate-600 mb-1">{t('promote.target_countries')}</div>
              <div className="flex flex-wrap gap-1.5">
                {COUNTRY_OPTIONS.map((c) => {
                  const on = form.target_countries.includes(c.code);
                  return (
                    <button key={c.code} type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        target_countries: on
                          ? f.target_countries.filter((x) => x !== c.code)
                          : [...f.target_countries, c.code],
                      }))}
                      className={`px-2.5 py-1 rounded-pill border text-[11px] font-semibold transition ${
                        on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                      }`}>{on ? '✓ ' : ''}{t(`geo.country_names.${c.code}`)}</button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-600 mb-1">{t('promote.target_regions')}</div>
              <div className="flex flex-wrap gap-1.5">
                {regions.map((r) => {
                  const on = form.target_regions.includes(r.id);
                  return (
                    <button key={r.id} type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        target_regions: on
                          ? f.target_regions.filter((x) => x !== r.id)
                          : [...f.target_regions, r.id],
                      }))}
                      className={`px-2.5 py-1 rounded-pill border text-[11px] font-semibold transition ${
                        on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                      }`}>{on ? '✓ ' : ''}{localizedName(r, i18n.resolvedLanguage)}</button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-600 mb-1">{t('promote.target_cities')}</div>
              <AdminCityPicker cities={cities} selected={form.target_cities}
                onChange={(next) => setForm({ ...form, target_cities: next })} />
            </div>
          </div>
        </form>
      </Modal>

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={closePreview}>
          <div className="bg-white rounded-card max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-lift" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <div className="font-extrabold text-ink text-[15px]">{t('promote.preview_live_title')}</div>
                <div className="text-[12px] text-slate-500 mt-0.5">{t(`admin.ad_placement_${preview.placement}`)}</div>
              </div>
              <button onClick={closePreview} className="px-3 py-1 rounded-pill bg-slate-100 hover:bg-slate-200 text-[12px] font-semibold">✕</button>
            </div>
            <div className="p-5 space-y-3">
              {preview.loading ? (
                <div className="h-32 rounded bg-slate-100 animate-pulse" />
              ) : preview.items.length === 0 ? (
                <div className="text-center py-6">
                  <div className="text-4xl mb-2">🎯</div>
                  <p className="font-semibold text-ink">{t('promote.preview_empty_title')}</p>
                  <p className="text-[12.5px] text-slate-500 mt-1">{t('promote.preview_empty_hint')}</p>
                </div>
              ) : (
                preview.items.map((ad) => (
                  <div key={ad.id} className="rounded-card border border-slate-200 overflow-hidden">
                    {ad.image && <AdMedia url={ad.image} type={ad.media_type || guessMediaTypeFromUrl(ad.image)} className="w-full max-h-40 object-cover" />}
                    <div className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink text-[13.5px] truncate">{ad.title}</span>
                        {ad.exclusive ? <span className="px-1.5 py-0.5 rounded-pill bg-amber-50 text-amber-700 text-[10px] font-bold">🔒 {t('promote.exclusive_short')}</span> : null}
                      </div>
                      {ad.link && <div className="text-[11px] text-brand-700 truncate mt-0.5">🔗 {ad.link}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {diag && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={closeDiag}>
          <div className="bg-white rounded-card max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-lift" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <div className="font-extrabold text-ink text-[15px]">🩺 {t('promote.diagnose_title')}</div>
                <div className="text-[12px] text-slate-500 mt-0.5">{diag.placement && t(`admin.ad_placement_${diag.placement}`)}</div>
              </div>
              <button onClick={closeDiag} className="px-3 py-1 rounded-pill bg-slate-100 hover:bg-slate-200 text-[12px] font-semibold">✕</button>
            </div>
            <div className="p-5 space-y-3">
              {diag.loading ? (
                <div className="h-32 rounded bg-slate-100 animate-pulse" />
              ) : diag.error ? (
                <div className="text-rose-700 text-[13px]">{t('errors.generic')}</div>
              ) : (
                <>
                  <div className={`rounded-card p-3 text-[13.5px] font-bold ${diag.live ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    {diag.live ? '✓ ' + t('promote.diagnose_live') : '✗ ' + t('promote.diagnose_blocked')}
                  </div>
                  <ul className="space-y-1.5">
                    {diag.checks.map((c) => (
                      <li key={c.name} className={`rounded-card border p-2.5 text-[12.5px] ${c.pass ? 'border-emerald-100 bg-emerald-50/40' : 'border-rose-200 bg-rose-50/60'}`}>
                        <div className="flex items-center gap-2 font-bold">
                          <span>{c.pass ? '✓' : '✗'}</span>
                          <span>{t(`promote.check_${c.name}`)}</span>
                        </div>
                        {!c.pass && (
                          <pre className="text-[11px] text-slate-600 mt-1 whitespace-pre-wrap font-mono">{JSON.stringify({ actual: c.actual, expected: c.expected }, null, 2)}</pre>
                        )}
                      </li>
                    ))}
                  </ul>
                  {diag.geo && (
                    <div className="rounded-card bg-slate-50 border border-slate-100 p-3 text-[12.5px]">
                      <div className="font-bold text-ink mb-1">🌍 {t('promote.visitor_geo')}</div>
                      <div className="text-slate-600">
                        {diag.geo.city || '—'} • {diag.geo.region || '—'} • {diag.geo.country || '—'}
                        {' '}<span className="text-slate-400">({diag.geo.source})</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
      <AdminFab onClick={openCreate} ariaLabel={t('admin.new')} />
    </div>
  );
}

function AdminCityPicker({ cities, selected, onChange }) {
  const { t, i18n } = useTranslation();
  const cityValue = city => city.name_ar || city.name_en || city.name || '';
  const cityLabel = value => {
    const row = (cities || []).find(city => cityValue(city) === value);
    return row ? localizedName(row, i18n.resolvedLanguage) : value;
  };
  const [q, setQ] = useState('');
  const filtered = (cities || []).filter((c) => {
    const name = [localizedName(c, i18n.resolvedLanguage), c.name_ar, c.name_en, ...Object.values(c.name_translations || {})].filter(Boolean).join(' ').toLowerCase();
    return !q.trim() || name.includes(q.trim().toLowerCase());
  }).slice(0, 80);
  const toggle = (name) => {
    if (selected.includes(name)) onChange(selected.filter((x) => x !== name));
    else onChange([...selected, name]);
  };
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`🔍 ${t('admin.search_city')}`} aria-label={t('admin.search_city')}
        className="w-full mb-2 px-3 py-1.5 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[12.5px]" />
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selected.map((s) => (
            <span key={s} className="px-2 py-0.5 rounded-pill bg-brand-50 text-brand-700 text-[11px] font-semibold flex items-center gap-1">
              {cityLabel(s)}
              <button type="button" onClick={() => toggle(s)} className="opacity-70 hover:opacity-100">✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-1 border border-slate-100 rounded">
        {filtered.map((c) => {
          const name = cityValue(c);
          const on = selected.includes(name);
          return (
            <button key={c.id || name} type="button" onClick={() => toggle(name)}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                on ? 'bg-brand-500 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}>{localizedName(c, i18n.resolvedLanguage)}</button>
          );
        })}
      </div>
    </div>
  );
}

function FieldA({ label, value, onChange, type = 'text', required = false, placeholder = '', multiline = false }) {
  const cls = 'w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]';
  return (
    <div>
      <label className="block text-[12px] font-bold text-ink mb-1">{label}</label>
      {multiline ? (
        <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      ) : (
        <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}
