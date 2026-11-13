import { useAdminConfirmation } from './confirmAdminChange';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAdsFees, saveAdsFees } from '../../services/adminService';
import { apiError } from '../../services/api';
import { localizedName } from '../../utils/localize';

const input = 'w-24 px-2 py-1.5 rounded border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-end';

// "Ad fees" besides the place (AYK-153): the price factor of the covered area (the whole country,
// or each region it targets, added together), and the duration and views limits.
export default function AdFeesExtras({ regions, onMessage }) {
  const { t, i18n } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const [fees, setFees] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getAdsFees().then(setFees).catch(() => setFees(null)); }, []);
  if (!fees) return null;

  const setAll = (value) => { setFees((f) => ({ ...f, coverage: { ...f.coverage, all: value } })); setDirty(true); };
  const setRegion = (id, value) => { setFees((f) => ({ ...f, coverage: { ...f.coverage, regions: { ...f.coverage.regions, [id]: value } } })); setDirty(true); };
  const setLimit = (key, value) => { setFees((f) => ({ ...f, limits: { ...f.limits, [key]: value } })); setDirty(true); };

  const save = async () => {
    if (!(await confirmAdminChange(t))) return;
    setSaving(true);
    try {
      const regionsBody = {};
      for (const [id, value] of Object.entries(fees.coverage.regions || {})) if (value !== '' && value != null) regionsBody[id] = Number(value);
      const limits = Object.fromEntries(Object.entries(fees.limits).map(([k, v]) => [k, Number(v)]));
      setFees(await saveAdsFees({ coverage: { all: Number(fees.coverage.all), regions: regionsBody }, limits }));
      setDirty(false);
      onMessage?.({ type: 'success', text: t('admin.saved') });
    } catch (e) { onMessage?.({ type: 'error', text: apiError(e) }); }
    finally { setSaving(false); }
  };

  const saveButton = (
    <button onClick={save} disabled={!dirty || saving}
      className={`px-4 py-1.5 rounded-pill text-[12.5px] font-bold transition shrink-0 ${dirty && !saving ? 'text-white shadow-soft' : 'text-slate-400 bg-slate-100 cursor-not-allowed'}`}
      style={dirty && !saving ? { background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' } : undefined}>
      {saving ? '⏳ ' + t('admin.saving') : `✓ ${t('admin.save')}`}
    </button>
  );

  return (
    <>
      <div className="bg-white rounded-card border border-slate-100 shadow-soft overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2">
          <h3 className="text-ink font-extrabold text-[14px]">🗺️ {t('promote.coverage_title')}</h3>
          {saveButton}
        </div>
        <div className="p-4 space-y-3">
          <p className="m-0 text-[12px] text-slate-500">{t('promote.coverage_hint')}</p>
          <label className="flex items-center justify-between gap-3 p-2 rounded bg-brand-50">
            <span className="font-bold text-[13px] text-ink">🌍 {t('promote.coverage_all')}</span>
            <span className="flex items-center gap-1">× <input type="number" step="0.1" min="0.1" value={fees.coverage.all} onChange={(e) => setAll(e.target.value)} className={input} /></span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {regions.map((r) => (
              <label key={r.id} className="flex items-center justify-between gap-3 px-2 py-1.5 rounded border border-slate-100">
                <span className="text-[13px] text-ink">{localizedName(r, i18n.resolvedLanguage)}</span>
                <span className="flex items-center gap-1">× <input type="number" step="0.1" min="0.1" placeholder="1"
                  value={fees.coverage.regions?.[r.id] ?? ''} onChange={(e) => setRegion(r.id, e.target.value)} className={input} /></span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-card border border-slate-100 shadow-soft overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2">
          <h3 className="text-ink font-extrabold text-[14px]">⏱️ {t('promote.limits_title')}</h3>
          {saveButton}
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {['min_duration_days', 'max_duration_days', 'min_views', 'max_views'].map((key) => (
            <label key={key} className="block">
              <span className="block text-[12px] font-bold text-ink mb-1">{t(`promote.limit_${key}`)}</span>
              <input type="number" min="1" value={fees.limits[key]} onChange={(e) => setLimit(key, e.target.value)}
                className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]" />
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
