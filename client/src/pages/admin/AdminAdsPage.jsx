import ScrollStrip from '../../components/common/ScrollStrip';
import { useAdminConfirmation } from '../../components/admin/confirmAdminChange';
import { localizedName } from '../../utils/localize';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listAds, createAd, updateAd, deleteAd, uploadAdMedia,
  approveAdAdmin, rejectAdAdmin, activateAdAdmin,
  pauseAdAdmin, resumeAdAdmin, cancelAdAdmin, getAdStatsAdmin,
  getAdsPlacementPricing, saveAdsPlacementPricing, adminPreviewLiveAds, diagnoseAd,
  waiveAdFee, messageAdvertiser, reactivateAdAdmin, getSettings, updateSettings,
} from '../../services/adminService';
import AdFeesExtras from '../../components/admin/AdFeesExtras';
import AdSparkline from '../../components/ads/AdSparkline';
import { listCities, listRegions } from '../../services/serviceService';
import { apiError } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import EmptyState from '../../components/admin/EmptyState';
import AdminFab from '../../components/admin/AdminFab';
import { formatRelativeTime } from '../../utils/formatters';
import { safeUrl } from '../../utils/urlSafety';
import { askText } from '../../components/common/AppDialog';
import AdPlacementMap from '../../components/ads/AdPlacementMap';

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
// An advertiser's ad keeps what it was priced on (AYK-155), unless its fees were waived.
const paidBoundsLocked = (ad) => Boolean(ad?.user_id) && Number(ad?.fee_waived) !== 1;

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
  const confirmAdminChange = useAdminConfirmation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  // AYK-407 (the owner: «وضّح الشرط الذي لم يتحقق، وحتى عند الحفظ يوضح الشرط ويحوّل عليه مباشرة
  // بمربع أحمر»): the fields that stop an ad, marked in red with the reason, scrolled to.
  const [fieldErr, setFieldErr] = useState({});
  const markFields = (errs) => {
    setFieldErr(errs);
    const first = Object.keys(errs)[0];
    if (first) setTimeout(() => document.getElementById(`ad-field-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
  };
  const redBox = (key) => (fieldErr[key] ? 'rounded-card ring-2 ring-rose-500 bg-rose-50/70 p-2' : '');
  const redNote = (key) => (fieldErr[key] ? <p className="text-rose-700 text-[12.5px] font-bold mt-1.5 mb-0" role="alert">⚠️ {fieldErr[key]}</p> : null);
  const [confirm, setConfirm] = useState({ open: false });
  const [uploading, setUploading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [search, setSearch] = useState('');
  const [openStats, setOpenStats] = useState({});
  // Two parts (AYK-153): "Ad fees" and "Ad management".
  const [section, setSection] = useState('manage');
  const [reply, setReply] = useState(null); // { ad, category, message, sending, error }
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
    if (!(await confirmAdminChange(t))) return;
    setBusy(a.id);
    try { await pauseAdAdmin(a.id); load(); }
    catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
    finally { setBusy(null); }
  };

  // AYK-403: «إلغاء الخدمة» from the control; a cancelled ad is never shown to anyone.
  const onCancelAd = async (a) => {
    if (!(await confirmAdminChange(t))) return;
    setBusy(a.id);
    try { await cancelAdAdmin(a.id); setMsg({ type: 'success', text: t('admin.ad_cancelled') }); load(); }
    catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
    finally { setBusy(null); }
  };

  const onResume = async (a) => {
    if (!(await confirmAdminChange(t))) return;
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
    if (!(await confirmAdminChange(t))) return;
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
      setDiag({ ...res, adId: a.id, ad: a, placement: res?.placement || placement, loading: false });
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

  // AYK-404 (the owner: «أريد تفعيل الإعلانات المدفوعة وإلغاء التفعيل»): people may subscribe to paid
  // ads (the «أعلن» page and its links) only while this is on. The ads already running, and the
  // administration's own, show either way.
  const [paidOn, setPaidOn] = useState(null);
  // AYK-406 (the owner: «وضّح الحالة بعد الإجراء»): the new state is written in the card itself.
  const [paidChanged, setPaidChanged] = useState(false);
  useEffect(() => {
    getSettings().then(rows => {
      const list = Array.isArray(rows) ? rows : Object.entries(rows || {}).map(([setting_key, setting_value]) => ({ setting_key, setting_value }));
      const row = list.find(r => (r.setting_key || r.key) === 'ads_user_requests_enabled');
      const value = row ? (row.parsed_value ?? row.setting_value ?? row.value) : true;
      setPaidOn(![false, 'false', 0, '0'].includes(value));
    }).catch(() => {
      // Without the settings permission, the public value still shows the state (AYK-405).
      import('../../hooks/usePublicSettings').then(({ fetchPublicSettings, paidAdsOn }) => fetchPublicSettings().then(s => setPaidOn(paidAdsOn(s)))).catch(() => setPaidOn(null));
    });
  }, []);
  const togglePaid = async () => {
    if (!(await confirmAdminChange(t))) return;
    const next = !paidOn;
    try { await updateSettings([{ key: 'ads_user_requests_enabled', value: next }]); setPaidOn(next); setPaidChanged(true); }
    catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
  };

  // AYK-395 (the owner: «ما فيه موافقة عرضه، والإعفاء من الرسوم، وإيقافه»): the ad's actions by its
  // status, on its card and at the top of its edit window (which closes after the action).
  const statusActions = (a, after = null) => {
    const run = async (handler, ad) => { await handler(ad); after?.(); };
    return (
      <>
                  {a.status === 'requested' && (
                    <>
                      <button onClick={() => run(onApprove, a)} disabled={busy === a.id} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-60">✓ {t('badge.approve')}</button>
                      <button onClick={() => run(onReject, a)}  disabled={busy === a.id} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition disabled:opacity-60">✗ {t('badge.reject')}</button>
                    </>
                  )}
                  {(['approved', 'awaiting_payment'].includes(a.status) || (Number(a.fee_waived) === 1 && a.status === 'requested')) && (
                    <button onClick={() => run(onActivate, a)} disabled={busy === a.id} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition disabled:opacity-60">▶ {t('promote.activate')}</button>
                  )}
                  {a.status === 'active' && (
                    <button onClick={() => run(onPause, a)} disabled={busy === a.id} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 transition disabled:opacity-60">⏸ {t('promote.pause')}</button>
                  )}
                  {a.status === 'expired' && (
                    <button onClick={() => run(onReactivate, a)} disabled={busy === a.id} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition disabled:opacity-60">🔄 {t('promote.reactivate')}</button>
                  )}
                  {a.status === 'paused' && (
                    <button onClick={() => run(onResume, a)} disabled={busy === a.id} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-60">▶ {t('promote.resume')}</button>
                  )}
                  {!['cancelled', 'rejected'].includes(a.status) && (
                    <button onClick={() => run(onCancelAd, a)} disabled={busy === a.id} data-testid="ad-admin-cancel" className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition disabled:opacity-60">⛔ {t('admin.ad_cancel_service')}</button>
                  )}
                  {['requested', 'approved', 'awaiting_payment'].includes(a.status) && Number(a.fee_waived) !== 1 && !a.payment_id && (
                    <button onClick={() => run(onWaive, a)} disabled={busy === a.id} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-60">🎁 {t('promote.waive_fee')}</button>
                  )}
      </>
    );
  };

  const closeEdit = () => {
    ++editVersion.current; ++uploadVersion.current;
    setUploading(false); setEditOpen(false); setEditing(null); setForm(EMPTY); setFormError(''); setFieldErr({});
  };
  const openCreate = () => {
    ++editVersion.current; ++uploadVersion.current;
    setUploading(false); setEditing(null); setForm(EMPTY); setFormError(''); setFieldErr({}); setEditOpen(true);
  };
  const openEdit = (a, focus = null) => {
    setFieldErr({});
    if (focus) setTimeout(() => markFields(focus), 300);
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
    if (editing && !(await confirmAdminChange(t, editing.name_ar || editing.full_name || editing.title || editing.provider || ''))) return;
    if (uploading || saveInFlight.current) return;
    if ((form.link && !safeUrl(form.link)) || (form.image && !safeUrl(form.image))) {
      setFormError(t('errors.generic')); return;
    }
    // AYK-407: what would stop the save, at its field.
    const blocking = {};
    if (!String(form.title || '').trim()) blocking.title = 'اكتب عنوان الإعلان.';
    if (!paidBoundsLocked(editing) && form.starts_at && form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) blocking.ends_at = 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.';
    if (Object.keys(blocking).length) { setFormError('لم يُحفظ: صحّح الخانة المعلّمة بالأحمر.'); markFields(blocking); return; }
    setFieldErr({});
    const version = editVersion.current;
    saveInFlight.current = true;
    setSaving(true);
    setFormError('');
    try {
      // The primary `placement` column still drives back-compat
      // queries — keep it set to the first checked placement. Send
      // the full multi-select as `placements` JSON.
      const primary = form.placements?.[0] || form.placement || 'home_top';
      // An advertiser's ad (AYK-155): its place, dates, views and targeting are what was priced, so
      // only its content changes here, unless its fees were waived.
      const contentOnly = paidBoundsLocked(editing);
      const full = {
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
      const payload = contentOnly
        ? Object.fromEntries(['title', 'description', 'image', 'media_type', 'link', 'sort_order', 'target_countries', 'target_regions', 'target_cities'].map((k) => [k, full[k]]))
        : full;
      const saved = editing ? await updateAd(editing.id, payload) : await createAd(payload);
      if (version !== editVersion.current) return;
      load();
      // AYK-407: saved, but would it show? If not, the window stays open on the field to fix.
      const savedId = editing?.id || saved?.data?.id || saved?.id;
      if (savedId) {
        try {
          const res = await diagnoseAd(savedId, primary);
          const failed = (res?.checks || []).filter(c => !c.pass && c.name !== 'geo_match');
          if (version === editVersion.current && failed.length) {
            const savedAd = { ...(editing || {}), ...full, id: savedId, status: (saved?.data || saved)?.status || editing?.status || 'active' };
            setEditing(savedAd);
            const errs = Object.fromEntries(failed.map(c => [CHECK_FIELD[c.name] || 'status', explainCheck(c, savedAd, t)]));
            setFormError('حُفظ الإعلان، لكنه لن يظهر الآن. السبب معلّم بالأحمر.');
            markFields(errs);
            return;
          }
        } catch (_) { /* the check is a help only */ }
      }
      closeEdit();
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
    if (!(await confirmAdminChange(t))) return;
    setBusy(a.id);
    try { await approveAdAdmin(a.id); setMsg({ type: 'success', text: t('promote.admin_approved') }); load(); }
    catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
    finally { setBusy(null); }
  };

  const onReject = async (a) => {
    if (!(await confirmAdminChange(t))) return;
    const reason = await askText({ title: t('badge.reject'), message: t('badge.reject_reason_prompt'), multiline: true, maxLength: 1000 });
    if (reason === null) return;
    setBusy(a.id);
    try { await rejectAdAdmin(a.id, reason); setMsg({ type: 'success', text: t('promote.admin_rejected') }); load(); }
    catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
    finally { setBusy(null); }
  };

  const onReactivate = async (a) => {
    if (!(await confirmAdminChange(t))) return;
    setBusy(a.id);
    try { await reactivateAdAdmin(a.id); setMsg({ type: 'success', text: t('promote.admin_activated') }); load(); }
    catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
    finally { setBusy(null); }
  };

  const onWaive = async (a) => {
    if (!(await confirmAdminChange(t))) return;
    const reason = await askText({ title: `🎁 ${t('promote.waive_fee')}`, message: t('promote.waive_reason_prompt'), multiline: true, maxLength: 500, confirmText: t('promote.waive_fee') });
    if (reason === null) return;
    setBusy(a.id);
    try { await waiveAdFee(a.id, reason); setMsg({ type: 'success', text: t('promote.waived_msg') }); load(); }
    catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
    finally { setBusy(null); }
  };

  const sendReply = async () => {
    if (!reply?.message?.trim()) { setReply((r) => ({ ...r, error: t('promote.message_required') })); return; }
    setReply((r) => ({ ...r, sending: true, error: '' }));
    try {
      await messageAdvertiser(reply.ad.id, reply.category, reply.message.trim());
      setReply(null);
      setMsg({ type: 'success', text: t('promote.message_sent') });
      load();
    } catch (e) { setReply((r) => ({ ...r, sending: false, error: apiError(e) })); }
  };

  // AYK-403 (the owner's screenshot: an «approved» ad with no way to start it). An ad that is neither
  // paid nor waived is waived first (the reason is asked and kept), then activated, in one step.
  const onActivate = async (a) => {
    const unpaid = Number(a.fee_waived) !== 1 && !a.payment_id && ['requested', 'approved', 'awaiting_payment'].includes(a.status);
    if (!(await confirmAdminChange(t))) return;
    let reason = null;
    if (unpaid) {
      reason = await askText({ title: `▶ ${t('promote.activate')}`, message: t('admin.ad_activate_unpaid'), multiline: true, maxLength: 500, confirmText: t('promote.activate') });
      if (reason === null) return;
    }
    setBusy(a.id);
    try {
      if (unpaid) await waiveAdFee(a.id, reason);
      await activateAdAdmin(a.id); setMsg({ type: 'success', text: t('promote.admin_activated') }); load();
    }
    catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
    finally { setBusy(null); }
  };

  // AYK-407: the button that fixes a failed check: the status by its own action, the rest in the
  // edit window, opened on that field in red.
  const checkFix = (c, ad) => {
    const reopen = () => setTimeout(() => openDiag(ad), 600);
    const field = CHECK_FIELD[c.name];
    if (c.name === 'status') {
      if (['requested', 'approved', 'awaiting_payment'].includes(ad.status)) return { label: '▶ تنشيط الإعلان الآن', run: async () => { closeDiag(); await onActivate(ad); reopen(); } };
      if (ad.status === 'paused') return { label: '▶ استئناف الإعلان', run: async () => { closeDiag(); await onResume(ad); reopen(); } };
      if (ad.status === 'expired') return { label: '🔄 إعادة تنشيط الإعلان', run: async () => { closeDiag(); await onReactivate(ad); reopen(); } };
      return null;
    }
    if (!field || field === 'targeting' && c.name !== 'geo_match') return null;
    return { label: '✏️ افتح الخانة وصحّحها', run: async () => { closeDiag(); openEdit(ad, { [field]: explainCheck(c, ad, t) }); } };
  };

  const STATUS_TABS = [
    { value: '',                  label: t('common.all') },
    { value: 'requested',         label: t('promote.status_requested') },
    { value: 'approved',          label: t('promote.status_approved') },
    { value: 'awaiting_payment',  label: t('promote.status_awaiting_payment') },
    { value: 'active',            label: t('promote.status_active') },
    { value: 'rejected',          label: t('promote.status_rejected') },
    { value: 'expired',           label: t('promote.status_expired') },
    { value: 'paused',            label: t('promote.status_paused') },
    { value: 'cancelled',         label: t('promote.status_cancelled') },
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
    <div className="space-y-3">
      <AdminPageHeader title={t('admin.ads')} count={meta?.pagination?.total ?? items.length}>
        {section === 'manage' && <AdminButton variant="primary" icon="+" onClick={openCreate}>{t('admin.new')}</AdminButton>}
      </AdminPageHeader>

      {paidOn !== null && (
        <div className={`rounded-card border-2 px-4 py-4 flex flex-wrap items-center justify-between gap-3 ${paidOn ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'}`} data-testid="paid-ads-switch">
          <div className="min-w-0">
            <span className="block text-[12.5px] text-slate-600">{t('admin.paid_ads_switch')}</span>
            <b className={`block text-[17px] mt-0.5 ${paidOn ? 'text-emerald-800' : 'text-rose-800'}`} data-testid="paid-ads-state" role="status">
              {paidOn ? '✅' : '⏸'} {t(paidOn ? 'admin.paid_ads_now_on' : 'admin.paid_ads_now_off')}
            </b>
            {paidChanged && <span className="block text-[12.5px] font-semibold mt-1">{t(paidOn ? 'admin.paid_ads_turned_on' : 'admin.paid_ads_turned_off')}</span>}
            <span className="block text-[12px] text-slate-600 mt-1">{t('admin.paid_ads_switch_hint')}</span>
          </div>
          <AdminButton variant={paidOn ? 'secondary' : 'primary'} onClick={togglePaid} data-testid="paid-ads-toggle">{t(paidOn ? 'admin.paid_ads_turn_off' : 'admin.paid_ads_turn_on')}</AdminButton>
        </div>
      )}

      {/* Two parts (AYK-153): what ads cost, and managing each ad. */}
      <div className="flex gap-2" role="tablist">
        {[['manage', '🗂️', 'promote.section_manage'], ['fees', '💰', 'promote.section_fees']].map(([key, icon, label]) => (
          <button key={key} type="button" role="tab" aria-selected={section === key} onClick={() => setSection(key)}
            className={`flex-1 md:flex-none px-4 py-2.5 rounded-card text-[13.5px] font-extrabold border-2 transition ${
              section === key ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}>{icon} {t(label)}</button>
        ))}
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-card text-[13.5px] font-semibold ${
          msg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'
        }`}>{msg.text}</div>
      )}

      {section === 'manage' && (<>
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

      </>)}

      {section === 'fees' && (<>
      {/* Per-placement pricing table */}
      <div className="bg-white rounded-card border border-slate-100 shadow-soft overflow-hidden">
        <div className="px-4 md:px-3 py-2 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2">
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
        <div className="p-3 border-t border-slate-100"><AdPlacementMap all /></div>
      </div>

      <AdFeesExtras regions={regions} onMessage={setMsg} />
      </>)}

      {section === 'manage' && (<>
      <div className="bg-white rounded-card border border-slate-100 p-3 shadow-soft space-y-3">
        <ScrollStrip className="flex gap-1.5">
          {STATUS_TABS.map((tab) => (
            <button key={tab.value} onClick={() => setStatusFilter(tab.value)}
              className={`shrink-0 px-3.5 py-1.5 rounded-pill text-[12.5px] font-semibold transition border ${
                statusFilter === tab.value
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
              }`}>{tab.label}</button>
          ))}
        </ScrollStrip>
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
                    {Number(a.fee_waived) === 1 && <span className="ms-1 px-2 py-0.5 rounded-pill bg-emerald-50 text-emerald-700 text-[10.5px] font-bold">🎁 {t('promote.fee_waived')}</span>}
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
                {/* Why it stopped (AYK-157): the end date, the view limit, or no payment. */}
                {a.status === 'expired' && a.stop_reason && (
                  <div className="mt-1 mb-2 p-2 rounded bg-amber-50 border border-amber-200 text-[12px] text-amber-800 font-semibold">
                    ⏱️ {t(`promote.stop_${a.stop_reason.code}`, { date: a.stop_reason.ends_at ? new Date(a.stop_reason.ends_at).toLocaleString(i18n.resolvedLanguage, { dateStyle: 'medium', timeStyle: 'short' }) : '' })}
                  </div>
                )}
                {a.rejection_reason && (
                  <div className="mt-1 mb-2 p-2 rounded bg-rose-50 text-[12px] text-rose-700">{t('badge.reason')}: {a.rejection_reason}</div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {statusActions(a)}
                  {(a.status === 'active' || a.status === 'paused' || a.status === 'expired') && (
                    <button onClick={() => toggleStats(a)} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition">📊 {openStats[a.id] ? t('promote.hide_stats') : t('promote.show_stats')}</button>
                  )}
                  {a.user_id && (
                    <button onClick={() => setReply({ ad: a, category: 'administrative', message: '' })} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 transition">✉️ {t('promote.reply_advertiser')}</button>
                  )}
                  <button onClick={() => openDiag(a)} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition" title={t('promote.diagnose_hint')}>🩺 {t('promote.diagnose')}</button>
                  <button onClick={() => openEdit(a)} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 transition">{t('admin.edit')}</button>
                  <button onClick={() => askDelete(a)} className="px-3 py-1 rounded-pill text-[11px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition">{t('admin.delete')}</button>
                </div>
                {Array.isArray(a.admin_messages) && a.admin_messages.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {a.admin_messages.slice(0, 3).map((m) => (
                      <div key={m.id} className="p-2 rounded bg-sky-50 text-[11.5px] text-sky-900">
                        <b>{t(`promote.message_${m.category}`)}</b> · {formatRelativeTime(m.created_at)}: {m.message}
                      </div>
                    ))}
                  </div>
                )}
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
      </>)}

      {/* Reply to the advertiser (AYK-153): a financial, administrative or legal matter. */}
      <Modal open={Boolean(reply)} onClose={() => setReply(null)} title={`✉️ ${t('promote.reply_title')}`} width={520}
        footer={
          <>
            <button onClick={() => setReply(null)} className="px-4 py-2 rounded-pill bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-semibold border border-slate-200 transition">{t('admin.cancel_btn')}</button>
            <button onClick={sendReply} disabled={reply?.sending} className="px-4 py-2 rounded-pill text-white text-[13px] font-semibold shadow-soft disabled:opacity-60 transition" style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}>{reply?.sending ? t('admin.saving') : t('promote.send_message')}</button>
          </>
        }>
        {reply && (
          <div className="space-y-3">
            <div className="text-[13px] text-slate-600">📣 <b>{reply.ad.title}</b>{reply.ad.user_name ? <> · 👤 {reply.ad.user_name}</> : null}</div>
            <div className="flex flex-wrap gap-2">
              {['financial', 'administrative', 'legal'].map((c) => (
                <button key={c} type="button" onClick={() => setReply((r) => ({ ...r, category: c }))}
                  className={`px-3 py-1.5 rounded-pill text-[12.5px] font-bold border-2 transition ${reply.category === c ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}>
                  {t(`promote.message_${c}`)}
                </button>
              ))}
            </div>
            <textarea rows={4} value={reply.message} maxLength={2000} onChange={(e) => setReply((r) => ({ ...r, message: e.target.value, error: '' }))}
              placeholder={t('promote.message_placeholder')}
              className={`w-full px-3 py-2 rounded-card border outline-none text-[14px] ${reply.error ? 'border-2 border-rose-500 bg-rose-50' : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500'}`} />
            {reply.error && <p role="alert" className="m-0 text-[12.5px] font-bold text-rose-600">⚠️ {reply.error}</p>}
          </div>
        )}
      </Modal>

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
          {formError && <div role="alert" className="px-3 py-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[13px] font-semibold">⚠️ {formError}</div>}
          {editing && (
            <div id="ad-field-status" className={`rounded-card border border-slate-200 bg-slate-50 p-2.5 ${redBox('status')}`} data-testid="ad-edit-actions">
              {redNote('status')}
              <div className="text-[12px] font-bold text-ink mb-1.5">الحالة: {t(`promote.status_${editing.status}`, editing.status)}{Number(editing.fee_waived) === 1 ? ' · 🎁 معفى من الرسوم' : ''}</div>
              <div className="flex flex-wrap gap-1.5">{statusActions(editing, closeEdit)}</div>
            </div>
          )}
          {paidBoundsLocked(editing) && (
            <div className="px-3 py-2.5 rounded-card bg-amber-50 border border-amber-200 text-amber-800 text-[12.5px] leading-relaxed">
              🔒 إعلان مدفوع: مكانه ومدته ومشاهداته مرتبطة بالمبلغ الذي دُفع، فلا تُعدَّل إلا بإعفائه من الرسوم. ويُعدَّل هنا محتواه (الصورة والنصوص والرابط) ومناطق عرضه.
            </div>
          )}
          <div id="ad-field-title" className={redBox('title')}><FieldA label={t('admin.ad_title')} value={form.title} onChange={(v) => setForm({ ...form, title: v })} required />{redNote('title')}</div>
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
          {!paidBoundsLocked(editing) && (<>
          <div id="ad-field-placements" className={redBox('placements')}>
            {redNote('placements')}
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
            <div className="mt-2"><AdPlacementMap selected={form.placements} /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div id="ad-field-starts_at" className={redBox('starts_at')}><FieldA label={t('admin.ad_starts_at')} type="datetime-local" value={form.starts_at} onChange={(v) => setForm({ ...form, starts_at: v })} />{redNote('starts_at')}</div>
            <div id="ad-field-ends_at" className={redBox('ends_at')}><FieldA label={t('admin.ad_ends_at')} type="datetime-local" value={form.ends_at} onChange={(v) => setForm({ ...form, ends_at: v })} />{redNote('ends_at')}</div>
            <div id="ad-field-max_views" className={redBox('max_views')}><FieldA label={t('promote.max_views')} type="number" value={form.max_views} onChange={(v) => setForm({ ...form, max_views: v })} placeholder="—" />{redNote('max_views')}</div>
          </div>
          </>)}
          <FieldA label={t('admin.ad_sort_order')} type="number" value={form.sort_order} onChange={(v) => setForm({ ...form, sort_order: Number(v) || 0 })} />
          {!paidBoundsLocked(editing) && (<>
          <div id="ad-field-is_active" className={`flex flex-wrap gap-4 ${redBox('is_active')}`}>
            {redNote('is_active')}
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
          </>)}

          {/* Geo targeting. AYK-388 (the owner: «إعلان منشّط لكن ما أستطيع تحديد مناطق عرضه»): open for
              a paid ad too; its price stays what was paid. */}
          <div id="ad-field-targeting" className={`rounded-card border border-slate-200 p-3 space-y-3 ${fieldErr.targeting ? 'ring-2 ring-rose-500 bg-rose-50/70' : ''}`} data-testid="ad-geo">
            {redNote('targeting')}
            <div className="text-[12.5px] font-bold text-ink">🌍 {t('promote.geo_targeting')}</div>
            <p className="text-[11.5px] text-slate-500 -mt-1">{t('promote.geo_targeting_hint')}</p>
            {paidBoundsLocked(editing) && <p className="text-[11.5px] text-amber-800 bg-amber-50 rounded px-2 py-1.5 m-0">💡 إعلان مدفوع: تحديد مناطق عرضه هنا لا يغيّر المبلغ الذي دُفع.</p>}
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
            {/* AYK-394 (the owner: «اختيار منطقة العرض المفروض يكون في نفس اختيار المناطق»): a region ticked
                opens its cities right under it; none chosen = the whole region. */}
            <RegionCityPicker regions={regions} cities={cities} form={form} setForm={setForm} />
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
                        {!c.pass && (() => {
                          // AYK-407: the reason in words, and the way to fix it at once.
                          const ad = items.find(x => x.id === diag.adId) || diag.ad || { id: diag.adId };
                          const fix = checkFix(c, ad);
                          return (
                            <div className="mt-1.5 space-y-2">
                              <p className="m-0 text-[13px] text-rose-800 leading-relaxed">{explainCheck(c, ad, t, diag.placement)}</p>
                              {fix && <button type="button" data-testid={`diag-fix-${c.name}`} onClick={async () => { await fix.run(); }}
                                className="px-3 py-1.5 rounded-pill text-[12.5px] font-bold bg-rose-600 text-white hover:bg-rose-700">{fix.label}</button>}
                            </div>
                          );
                        })()}
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

const cityKey = c => c.name_ar || c.name_en || c.name || '';
const regionOfCity = c => Number(c.in_region_id ?? c.region_id);

function RegionCityPicker({ regions, cities, form, setForm }) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const [q, setQ] = useState({});
  const chosen = form.target_regions.map(Number);
  const toggleRegion = id => setForm(f => {
    const on = f.target_regions.map(Number).includes(id);
    if (!on) return { ...f, target_regions: [...f.target_regions, id] };
    const drop = new Set(cities.filter(c => regionOfCity(c) === id).map(cityKey));
    return { ...f, target_regions: f.target_regions.filter(x => Number(x) !== id), target_cities: f.target_cities.filter(n => !drop.has(n)) };
  });
  const toggleCity = name => setForm(f => ({ ...f, target_cities: f.target_cities.includes(name) ? f.target_cities.filter(x => x !== name) : [...f.target_cities, name] }));
  const chip = on => `px-2.5 py-1 rounded-pill border text-[11.5px] font-semibold transition ${on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`;
  return (
    <div data-testid="region-city-picker">
      <div className="text-[11px] font-semibold text-slate-600 mb-1">المناطق والمدن</div>
      <p className="text-[11px] text-slate-500 mt-0 mb-2">اختر منطقة فتظهر مدنها تحتها. بلا اختيار مدينة يُعرض في كل المنطقة، ومع اختيار مدن يُعرض فيها فقط. وتحديد منطقة يجعل الدولة لا تُحسب.</p>
      {chosen.length > 0 && (
        <div className="space-y-2 mb-2">
          {regions.filter(r => chosen.includes(Number(r.id))).map(r => {
            const all = cities.filter(c => regionOfCity(c) === Number(r.id));
            const picked = all.filter(c => form.target_cities.includes(cityKey(c)));
            const term = (q[r.id] || '').trim().toLowerCase();
            const shown = all.filter(c => !term || [localizedName(c, lang), c.name_ar, c.name_en].filter(Boolean).join(' ').toLowerCase().includes(term));
            return (
              <div key={r.id} className="rounded-card border-2 border-brand-200 bg-brand-50/40 p-2" data-testid={`region-${r.id}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <button type="button" className={chip(true)} onClick={() => toggleRegion(Number(r.id))}>✓ {localizedName(r, lang)} ✕</button>
                  <span className="text-[11px] font-bold text-brand-700">{picked.length ? `${picked.length} من ${all.length} مدينة` : `كل المنطقة (${all.length} مدينة)`}</span>
                </div>
                {all.length > 8 && (
                  <input value={q[r.id] || ''} onChange={e => setQ(prev => ({ ...prev, [r.id]: e.target.value }))} placeholder="🔍 ابحث عن مدينة في هذه المنطقة"
                    className="w-full mt-2 px-3 py-1.5 rounded-card border border-slate-200 bg-white outline-none text-[12px]" />
                )}
                <div className="flex flex-wrap gap-1 mt-2 max-h-40 overflow-y-auto">
                  {shown.map(c => {
                    const on = form.target_cities.includes(cityKey(c));
                    return <button key={c.id} type="button" onClick={() => toggleCity(cityKey(c))} className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${on ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{on ? '✓ ' : ''}{localizedName(c, lang)}</button>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* Cities chosen earlier without their region (older ads): shown so they can be removed. */}
      {(() => {
        const loose = form.target_cities.filter(name => {
          const c = cities.find(x => cityKey(x) === name);
          return !c || !chosen.includes(regionOfCity(c));
        });
        return loose.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2" data-testid="loose-cities">
            <span className="text-[11px] text-slate-500">مدن مختارة:</span>
            {loose.map(name => <button key={name} type="button" onClick={() => toggleCity(name)} className="px-2 py-0.5 rounded bg-brand-500 text-white text-[11px] font-semibold">✓ {name} ✕</button>)}
          </div>
        );
      })()}
      <div className="flex flex-wrap gap-1.5">
        {regions.filter(r => !chosen.includes(Number(r.id))).map(r => (
          <button key={r.id} type="button" className={chip(false)} onClick={() => toggleRegion(Number(r.id))}>＋ {localizedName(r, lang)}</button>
        ))}
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

// AYK-407: each check of «لماذا الإعلان يظهر أو لا يظهر», its field in the edit window, and the
// reason in plain words (the administration is in Arabic).
const CHECK_FIELD = { status: 'status', is_active: 'is_active', starts_at: 'starts_at', ends_at: 'ends_at', view_cap: 'max_views', placement_match: 'placements', geo_match: 'targeting' };
const when = value => { try { return new Date(value).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }); } catch (_) { return String(value); } };
function explainCheck(c, ad, t, placement) {
  switch (c.name) {
    case 'status': {
      const now = t(`promote.status_${c.actual}`, c.actual);
      if (['requested', 'approved', 'awaiting_payment'].includes(c.actual)) return `حالة الإعلان «${now}» وليست «نشط». الإعلان لا يُعرض إلا بعد تنشيطه.`;
      if (c.actual === 'paused') return 'الإعلان موقوف مؤقتًا. استأنفه ليُعرض.';
      if (c.actual === 'expired') return 'انتهى الإعلان (مدته أو مشاهداته). أعد تنشيطه، أو مدّد تاريخ الانتهاء أو حد المشاهدات.';
      if (c.actual === 'cancelled') return 'الإعلان ملغى، ولا يُعرض لأحد.';
      if (c.actual === 'rejected') return 'الإعلان مرفوض، ولا يُعرض.';
      return `حالة الإعلان «${now}» وليست «نشط».`;
    }
    case 'is_active': return 'خانة «مفعّل» في الإعلان غير مؤشَّر عليها. أشّر عليها واحفظ.';
    case 'starts_at': return `لم يحن موعد بدايته: يبدأ ${when(c.actual)}. قدّم تاريخ البدء إن أردت عرضه الآن.`;
    case 'ends_at': return `انتهى موعده في ${when(c.actual)}. مدّد تاريخ الانتهاء.`;
    case 'view_cap': return `بلغ حد المشاهدات (${c.actual}). ارفع الحد أو اتركه فارغًا.`;
    case 'placement_match': return `الإعلان غير مضاف لمكان «${placement ? t(`admin.ad_placement_${placement}`) : c.expected}». أضِف المكان من «أماكن العرض».`;
    case 'geo_match': {
      const v = c.actual || {};
      const where = [v.visitor_city, v.visitor_region, v.visitor_country].filter(Boolean).join('، ') || 'غير معروف';
      return `مكان الزائر (${where}) خارج مناطق عرض الإعلان. وسّع مناطق العرض أو اتركها فارغة ليُعرض للجميع. (الفحص بمكانك أنت، والزوار في مناطق العرض يرونه.)`;
    }
    default: return 'شرط لم يتحقق.';
  }
}
