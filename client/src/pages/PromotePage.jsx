import { localizedName } from '../utils/localize';
import { safeUrl } from '../utils/urlSafety';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMyAds, previewQuote, submitAdRequest, payAd, cancelAd, getAdStats, pauseAd, resumeAd, getMyGeo } from '../services/adService';
import { listCities, listRegions } from '../services/serviceService';
import { uploadAdMedia } from '../services/adminService';
import AdSparkline from '../components/ads/AdSparkline';
import { formatCurrency, formatRelativeTime } from '../utils/formatters';
import { LoadingState } from '../components/common/Spinner';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { apiError } from '../services/api';
import useCountry from '../hooks/useCountry';

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

function AdMedia({ url, type, className = '' }) {
  url = safeUrl(url);
  if (!url) return null;
  if (type === 'video') return <video src={url} autoPlay muted loop playsInline className={className} />;
  return <img src={url} referrerPolicy="no-referrer" alt="" className={className} />;
}

const EMPTY = {
  title: '', description: '', image: '', media_type: 'image', link: '',
  placements: ['home_top'],
  starts_at: '', duration_days: 7, max_views: 1000, notes: '',
  exclusive: false,
  target_countries: [],
  target_regions: [],
  target_cities: [],
};

const COUNTRY_OPTIONS = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'EG', 'JO', 'YE', 'IQ'].map(code => ({ code }));

export default function PromotePage() {
  const { t, i18n } = useTranslation();
  const { country } = useCountry();
  const [data, setData] = useState(null);
  const [cities, setCities] = useState([]);
  const [regions, setRegions] = useState([]);
  const [myGeo, setMyGeo] = useState(null);
  useEffect(() => {
    listCities().then(setCities).catch(() => setCities([]));
    getMyGeo().then((r) => setMyGeo(r?.geo || null)).catch(() => setMyGeo(null));
  }, []);

  // Region targeting picker — scope to the advertiser's country.
  useEffect(() => {
    if (!country?.id) { setRegions([]); return; }
    let current = true;
    setRegions([]);
    listRegions({ countryId: country.id }).then(rows => { if (current) setRegions(rows); }).catch(() => { if (current) setRegions([]); });
    return () => { current = false; };
  }, [country?.id]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [quote, setQuote] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [confirm, setConfirm] = useState({ open: false });
  const [openStats, setOpenStats] = useState({});

  const load = () => {
    setLoading(true);
    getMyAds().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // Refresh price quote whenever any input that affects the total
  // changes. The server returns the per-placement breakdown so we
  // can render row-by-row pricing alongside the grand total.
  useEffect(() => {
    let current = true;
    setQuote(null);
    if (!form.duration_days || !form.max_views || !form.placements?.length) { setQuote(null); return; }
    const handle = setTimeout(() => {
      previewQuote({
        duration_days: form.duration_days,
        max_views: form.max_views,
        placements: form.placements,
        exclusive: form.exclusive,
      })
        .then((res) => { if (current) setQuote(res.quote); })
        .catch(() => { if (current) setQuote(null); });
    }, 250);
    return () => { current = false; clearTimeout(handle); };
  }, [form.duration_days, form.max_views, form.placements, form.exclusive]);

  const config = data?.config;
  // Fall back to the full catalog if /me hasn't reported it (older API)
  const PLACEMENTS = config?.placements || [
    'home_top', 'home_hero', 'home_middle', 'home_bottom',
    'services_top', 'services_bottom',
    'category_top', 'category_bottom',
    'request_details_top', 'request_details_bottom',
    'sidebar', 'search',
    'profile_top', 'chat_sidebar', 'footer',
  ];

  const togglePlacement = (p) => {
    setForm((f) => {
      const set = new Set(f.placements);
      if (set.has(p)) set.delete(p); else set.add(p);
      return { ...f, placements: Array.from(set) };
    });
  };

  const onPickFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const res = await uploadAdMedia(file);
      setForm((f) => ({ ...f, image: res.url, media_type: res.media_type }));
    } catch (e) {
      setMsg({ type: 'error', text: apiError(e) });
    } finally { setUploading(false); }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (uploading || busy) return;
    if (!safeUrl(form.image)) { setMsg({ type: 'error', text: t('promote.need_media') }); return; }
    if (form.link && !safeUrl(form.link)) { setMsg({ type: 'error', text: t('errors.generic') }); return; }
    if (form.placements.length === 0) { setMsg({ type: 'error', text: t('promote.need_placement') }); return; }
    setBusy('submit');
    try {
      const payload = {
        ...form,
        starts_at: form.starts_at ? form.starts_at.replace('T', ' ') + ':00' : null,
      };
      await submitAdRequest(payload);
      setForm(EMPTY);
      setMsg({ type: 'success', text: t('promote.submitted') });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: apiError(e) });
    } finally { setBusy(null); }
  };

  const onPay = async (ad) => {
    setBusy(ad.id);
    try {
      await payAd(ad.id);
      setMsg({ type: 'success', text: t('promote.paid_msg') });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: apiError(e) });
    } finally { setBusy(null); }
  };

  const toggleStats = async (ad) => {
    if (openStats[ad.id]) {
      const next = { ...openStats }; delete next[ad.id];
      setOpenStats(next);
      return;
    }
    setOpenStats((s) => ({ ...s, [ad.id]: { loading: true } }));
    try {
      const res = await getAdStats(ad.id, 14);
      setOpenStats((s) => ({ ...s, [ad.id]: { loading: false, daily: res.daily } }));
    } catch (_) {
      setOpenStats((s) => ({ ...s, [ad.id]: { loading: false, daily: [] } }));
    }
  };

  const onPause = async (ad) => {
    setBusy(ad.id);
    try { await pauseAd(ad.id); load(); }
    catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
    finally { setBusy(null); }
  };

  const onResume = async (ad) => {
    setBusy(ad.id);
    try { await resumeAd(ad.id); load(); }
    catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
    finally { setBusy(null); }
  };

  const onCancel = (ad) => {
    setConfirm({
      open: true,
      title: t('admin.confirm_delete_title'),
      body: t('promote.confirm_cancel'),
      tone: 'danger',
      onConfirm: async () => {
        setBusy(ad.id);
        try { await cancelAd(ad.id); load(); }
        catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
        finally { setBusy(null); setConfirm({ open: false }); }
      },
    });
  };

  if (loading) return <LoadingState />;
  if (!data) return <p role="alert" className="form-error">{t('errors.generic')}</p>;

  if (!config.enabled) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto p-4">
        <h1 className="text-[20px] font-extrabold text-ink">{t('promote.page_title')}</h1>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-card">
          {t('promote.disabled')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto p-4">
      <div>
        <h1 className="text-[20px] font-extrabold text-ink">{t('promote.page_title')}</h1>
        <p className="text-slate-500 text-[13px] mt-1">{t('promote.page_hint')}</p>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-card text-[13.5px] font-semibold ${
          msg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'
        }`}>{msg.text}</div>
      )}

      {/* New request form */}
      <form onSubmit={onSubmit} className="bg-white rounded-card border border-slate-100 shadow-soft p-5 space-y-4">
        <h2 className="font-extrabold text-ink text-[16px]">{t('promote.new_request')}</h2>

        <Field label={t('promote.title')} required value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
        <Field label={t('promote.description')} value={form.description} onChange={(v) => setForm({ ...form, description: v })} multiline />

        {/* Media — upload-from-device primary */}
        <div>
          <label className="block text-[12px] font-bold text-ink mb-1">{t('promote.media')}</label>
          <label className="block cursor-pointer">
            <div className={`rounded-card border-2 border-dashed p-5 text-center transition ${
              uploading ? 'border-brand-400 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50'
            }`}>
              <div className="text-3xl mb-1">{uploading ? '⏳' : '📁'}</div>
              <div className="font-bold text-[13.5px] text-ink">{uploading ? t('admin.uploading') : t('admin.ad_pick_file_primary')}</div>
              <div className="text-[11.5px] text-slate-500 mt-1">{t('admin.ad_media_hint')}</div>
            </div>
            <input type="file" hidden
              accept="image/jpeg,image/png,image/webp,image/gif,image/apng,video/mp4,video/webm,video/ogg"
              onChange={(e) => onPickFile(e.target.files?.[0])} />
          </label>
          {form.image && (
            <div className="mt-2 p-2 rounded-card bg-slate-50 border border-slate-200">
              <AdMedia url={form.image} type={form.media_type} className="max-h-40 w-auto mx-auto rounded object-contain" />
            </div>
          )}
        </div>

        <Field label={t('admin.ad_link')} value={form.link} onChange={(v) => setForm({ ...form, link: v })} placeholder="https://…" hint={t('admin.ad_link_hint')} />

        {/* Placements — multi-select */}
        <div>
          <label className="block text-[12px] font-bold text-ink mb-2">{t('promote.placements')}</label>
          <div className="flex flex-wrap gap-2">
            {PLACEMENTS.map((p) => {
              const active = form.placements.includes(p);
              const price  = config.pricing?.[p];
              return (
                <button key={p} type="button" onClick={() => togglePlacement(p)}
                  className={`px-3 py-2 rounded-card border-2 text-[12.5px] font-semibold transition ${
                    active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {active && <span>✓</span>}
                    <span>{t(`admin.ad_placement_${p}`)}</span>
                  </div>
                  {price && (
                    <div className="text-[10.5px] text-slate-400 font-normal mt-0.5">
                      {price.price_per_day}/d · {price.price_per_1k_views}/1k
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date + duration + max views */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label={t('promote.starts_at')} type="datetime-local" value={form.starts_at} onChange={(v) => setForm({ ...form, starts_at: v })} hint={t('promote.starts_at_hint')} />
          <Field label={t('promote.duration_days')} type="number" required value={form.duration_days} onChange={(v) => setForm({ ...form, duration_days: Number(v) || 0 })} hint={`${config.min_duration_days}–${config.max_duration_days}`} />
          <Field label={t('promote.max_views')} type="number" required value={form.max_views} onChange={(v) => setForm({ ...form, max_views: Number(v) || 0 })} hint={`${config.min_views.toLocaleString(i18n.resolvedLanguage)}–${config.max_views.toLocaleString(i18n.resolvedLanguage)}`} />
        </div>
        <p className="text-[12px] text-slate-500 -mt-2">⏱ {t('promote.end_condition_hint')}</p>

        {/* Geo targeting — optional. Leave both empty to serve everywhere. */}
        <div className="rounded-card border border-slate-200 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[13px] font-bold text-ink">🌍 {t('promote.geo_targeting')}</div>
              <p className="text-[11.5px] text-slate-500 mt-0.5">{t('promote.geo_targeting_hint')}</p>
            </div>
            {myGeo && (
              <div className="text-[11px] text-slate-400 text-end shrink-0">
                <div>{t('promote.your_location')}:</div>
                <div className="font-semibold text-slate-600">{myGeo.city || '—'} • {myGeo.country || '—'}</div>
              </div>
            )}
          </div>
          <div>
            <div className="text-[11.5px] font-semibold text-slate-600 mb-1">{t('promote.target_countries')}</div>
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
                    className={`px-2.5 py-1 rounded-pill border text-[11.5px] font-semibold transition ${
                      on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}>{on ? '✓ ' : ''}{t(`geo.country_names.${c.code}`)}</button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-[11.5px] font-semibold text-slate-600 mb-1">{t('promote.target_regions')}</div>
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
                    className={`px-2.5 py-1 rounded-pill border text-[11.5px] font-semibold transition ${
                      on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}>{on ? '✓ ' : ''}{localizedName(r, i18n.resolvedLanguage)}</button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-[11.5px] font-semibold text-slate-600 mb-1">{t('promote.target_cities')}</div>
            <CityPicker cities={cities} selected={form.target_cities}
              onChange={(next) => setForm({ ...form, target_cities: next })} />
          </div>
        </div>

        {/* Exclusive vs shared toggle */}
        <div className="rounded-card border border-slate-200 p-3 flex items-start gap-3">
          <span className="text-2xl">{form.exclusive ? '🔒' : '🔀'}</span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[13.5px] text-ink">{t(form.exclusive ? 'promote.exclusive_mode' : 'promote.shared_mode')}</div>
            <p className="text-[12px] text-slate-500 mt-0.5">{t(form.exclusive ? 'promote.exclusive_desc' : 'promote.shared_desc')}</p>
          </div>
          <button type="button" onClick={() => setForm({ ...form, exclusive: !form.exclusive })}
            role="switch" aria-checked={form.exclusive}
            className={`relative w-14 h-8 rounded-full transition shrink-0 ${form.exclusive ? 'bg-amber-500' : 'bg-slate-300'}`}>
            <span className="absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all"
              style={{ insetInlineStart: form.exclusive ? 'calc(100% - 1.75rem)' : '0.25rem' }} />
          </button>
        </div>

        {/* Live quote — per-placement breakdown */}
        {quote && (
          <div className="rounded-card border border-brand-200 bg-brand-50 p-4 space-y-2">
            <div className="text-[12px] font-bold text-ink mb-1">{t('promote.cost_breakdown')}</div>
            {(quote.breakdown || []).map((b) => (
              <div key={b.placement} className="flex items-center justify-between text-[12.5px]">
                <span className="flex items-center gap-1 truncate">
                  <span className="text-slate-600 truncate">{t(`admin.ad_placement_${b.placement}`)}</span>
                  {b.multiplier !== 1 && <span className="text-amber-600">×{b.multiplier}</span>}
                </span>
                <span className="font-bold tabular-nums">{formatCurrency(b.subtotal)}</span>
              </div>
            ))}
            <div className="border-t border-brand-200 pt-2 flex items-center justify-between">
              <div className="text-[12px] text-slate-600">
                {t('promote.day_cost')}: <b>{formatCurrency(quote.day_cost)}</b>
                <span className="mx-2">·</span>
                {t('promote.view_cost')}: <b>{formatCurrency(quote.view_cost)}</b>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-bold text-ink">{t('promote.total')}</span>
              <span className="text-[20px] font-extrabold text-brand-700">{formatCurrency(quote.total)}</span>
            </div>
          </div>
        )}

        <Field label={t('promote.notes')} value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} multiline placeholder={t('promote.notes_placeholder')} />

        <button type="submit" disabled={Boolean(busy) || uploading}
          className="w-full px-6 py-3 rounded-pill text-white text-[14.5px] font-bold shadow-soft hover:shadow-lift disabled:opacity-60 transition"
          style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}>
          {busy === 'submit' ? t('admin.saving') : `✨ ${t('promote.submit_button')}`}
        </button>
        <p className="text-[12px] text-slate-500 text-center">{t('promote.workflow_hint')}</p>
      </form>

      {/* My ads */}
      <div className="bg-white rounded-card border border-slate-100 shadow-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 font-extrabold text-[14.5px] text-ink">
          {t('promote.my_ads')}
        </div>
        {data.ads.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-[13px]">{t('promote.no_ads')}</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.ads.map((ad) => {
              const ctr = ad.views_count > 0 ? ((ad.clicks_count / ad.views_count) * 100).toFixed(1) : '0.0';
              const viewPct = ad.max_views ? Math.min(100, Math.round((ad.views_count / ad.max_views) * 100)) : null;
              return (
                <li key={ad.id} className="p-4">
                  <div className="flex items-start gap-3">
                    {ad.image && (
                      <div className="w-20 h-20 rounded bg-slate-100 overflow-hidden shrink-0 grid place-items-center">
                        <AdMedia url={ad.image} type={ad.media_type} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-ink text-[14.5px] truncate">{ad.title}</span>
                        <span className={`px-2 py-0.5 rounded-pill text-[11px] font-bold ${STATUS_COLOR[ad.status]}`}>
                          {t(`promote.status_${ad.status}`)}
                        </span>
                      </div>
                      <div className="text-[11.5px] text-slate-500 mt-0.5">
                        {(ad.placements && ad.placements.length > 0 ? ad.placements : [ad.placement]).map((p) => t(`admin.ad_placement_${p}`)).join(' • ')}
                      </div>
                    </div>
                    <div className="text-end shrink-0">
                      <div className="text-[11px] text-slate-400">{t('promote.total')}</div>
                      <div className="text-[14px] font-extrabold text-ink">{formatCurrency(ad.amount)}</div>
                    </div>
                  </div>

                  {/* Analytics tiles */}
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <StatTile icon="👁" label={t('promote.stat_views')} value={(ad.views_count || 0).toLocaleString(i18n.resolvedLanguage)}
                      sub={ad.max_views ? `/ ${ad.max_views.toLocaleString(i18n.resolvedLanguage)}` : ''} />
                    <StatTile icon="🖱" label={t('promote.stat_clicks')} value={(ad.clicks_count || 0).toLocaleString(i18n.resolvedLanguage)} />
                    <StatTile icon="📈" label={t('promote.stat_ctr')} value={`${ctr}%`} />
                    <StatTile icon={ad.status === 'active' ? '🟢' : '⏸'} label={t('promote.stat_lifetime')}
                      value={ad.activated_at ? formatRelativeTime(ad.activated_at) : '—'} />
                  </div>

                  {/* Schedule + view-cap bar */}
                  <div className="mt-3 text-[11.5px] text-slate-500 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      🗓 {ad.starts_at ? new Date(ad.starts_at).toLocaleDateString(i18n.resolvedLanguage) : '—'}
                      {' → '}
                      {ad.ends_at ? new Date(ad.ends_at).toLocaleDateString(i18n.resolvedLanguage) : '∞'}
                    </div>
                    {viewPct !== null && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span>{t('promote.views_progress')}</span>
                          <span className="font-bold">{viewPct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${viewPct}%` }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {ad.rejection_reason && (
                    <div className="mt-2 text-[12px] bg-rose-50 text-rose-700 rounded p-2">
                      {t('badge.reason')}: {ad.rejection_reason}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {ad.status === 'approved' && (
                      <button onClick={() => onPay(ad)} disabled={busy === ad.id}
                        className="px-4 py-1.5 rounded-pill text-white text-[12.5px] font-bold shadow-soft disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}>
                        💳 {busy === ad.id ? t('admin.saving') : `${t('promote.pay_now')} (${formatCurrency(ad.amount)})`}
                      </button>
                    )}
                    {ad.status === 'active' && (
                      <button onClick={() => onPause(ad)} disabled={busy === ad.id}
                        className="px-3 py-1.5 rounded-pill bg-amber-50 text-amber-700 hover:bg-amber-100 text-[12.5px] font-semibold transition disabled:opacity-60">
                        ⏸ {t('promote.pause')}
                      </button>
                    )}
                    {ad.status === 'paused' && (
                      <button onClick={() => onResume(ad)} disabled={busy === ad.id}
                        className="px-3 py-1.5 rounded-pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[12.5px] font-semibold transition disabled:opacity-60">
                        ▶ {t('promote.resume')}
                      </button>
                    )}
                    {(ad.status === 'active' || ad.status === 'paused' || ad.status === 'expired') && (
                      <button onClick={() => toggleStats(ad)}
                        className="px-3 py-1.5 rounded-pill bg-slate-100 text-slate-700 hover:bg-slate-200 text-[12.5px] font-semibold transition">
                        📊 {openStats[ad.id] ? t('promote.hide_stats') : t('promote.show_stats')}
                      </button>
                    )}
                    {['requested', 'approved', 'awaiting_payment'].includes(ad.status) && (
                      <button onClick={() => onCancel(ad)} disabled={busy === ad.id}
                        className="px-3 py-1.5 rounded-pill bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-[12.5px] font-semibold transition disabled:opacity-60">
                        {t('admin.cancel_btn')}
                      </button>
                    )}
                  </div>

                  {openStats[ad.id] && (
                    <div className="mt-3 p-3 rounded-card border border-slate-100 bg-white">
                      <div className="text-[12px] font-bold text-ink mb-2">{t('promote.last_14_days')}</div>
                      {openStats[ad.id].loading ? (
                        <div className="h-24 rounded bg-slate-100 animate-pulse" />
                      ) : (
                        <AdSparkline daily={openStats[ad.id].daily} />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
    </div>
  );
}

function StatTile({ icon, label, value, sub = '' }) {
  return (
    <div className="rounded-card bg-slate-50 border border-slate-100 p-3">
      <div className="text-[18px]">{icon}</div>
      <div className="text-[11px] text-slate-500 mt-1">{label}</div>
      <div className="font-extrabold text-ink text-[15px] mt-0.5">
        {value} {sub && <span className="text-slate-400 text-[11px] font-normal">{sub}</span>}
      </div>
    </div>
  );
}

function CityPicker({ cities, selected, onChange }) {
  const { t, i18n } = useTranslation();
  const cityValue = city => city.name_ar || city.name_en || city.name || '';
  const cityLabel = value => {
    const row = (cities || []).find(city => cityValue(city) === value);
    return row ? localizedName(row, i18n.resolvedLanguage) : value;
  };
  const [query, setQuery] = useState('');
  const filtered = (cities || []).filter((c) => {
    const name = [localizedName(c, i18n.resolvedLanguage), c.name_ar, c.name_en, ...Object.values(c.name_translations || {})].filter(Boolean).join(' ').toLowerCase();
    return !query.trim() || name.includes(query.trim().toLowerCase());
  }).slice(0, 60);
  const toggle = (name) => {
    if (selected.includes(name)) onChange(selected.filter((x) => x !== name));
    else onChange([...selected, name]);
  };
  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder={`🔍 ${t('admin.search_city')}`} aria-label={t('admin.search_city')}
        className="w-full mb-2 px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[13px]" />
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((s) => (
            <span key={s} className="px-2 py-0.5 rounded-pill bg-brand-50 text-brand-700 text-[11px] font-semibold flex items-center gap-1">
              {cityLabel(s)}
              <button type="button" onClick={() => toggle(s)} className="opacity-70 hover:opacity-100">✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto p-1 border border-slate-100 rounded">
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

function Field({ label, value, onChange, type = 'text', required = false, placeholder = '', multiline = false, hint = '' }) {
  const cls = 'w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]';
  return (
    <div>
      <label className="block text-[12px] font-bold text-ink mb-1">{label}</label>
      {multiline ? (
        <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      ) : (
        <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
      {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}
