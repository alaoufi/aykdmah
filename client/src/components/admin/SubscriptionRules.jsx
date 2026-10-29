import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listSubscriptionRules, setSubscriptionsEnabled, createSubscriptionRule, updateSubscriptionRule, deleteSubscriptionRule,
} from '../../services/adminService';
import { listCountries, listRegions, listCities, listCategories } from '../../services/serviceService';
import { apiError } from '../../services/api';
import { localizedName } from '../../utils/localize';

const EMPTY = { region_id: '', city_id: '', category_id: '', is_free: false, note: '' };

// Where monthly subscriptions apply (AYK-042). Sign-up is free while the switch is off.
// With it on, each rule names a region, city and/or profession (blank = all); a "free"
// rule keeps a rare profession free there and always wins. Only providers pay.
export default function SubscriptionRules() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [data, setData] = useState(null);
  const [regions, setRegions] = useState([]);
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => listSubscriptionRules().then(setData).catch(e => setError(apiError(e)));
  useEffect(() => {
    load();
    listCountries().then(rows => listRegions({ countryId: rows?.[0]?.id })).then(setRegions).catch(() => {});
    listCategories().then(setCategories).catch(() => {});
  }, []);
  useEffect(() => {
    setCities([]);
    if (form.region_id) listCities({ regionId: form.region_id }).then(setCities).catch(() => {});
  }, [form.region_id]);

  const run = async action => {
    setBusy(true); setError('');
    try { await action(); await load(); } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  const name = (row, key) => localizedName({ name_ar: row[`${key}_name_ar`], name_en: row[`${key}_name_en`], name_translations: row[`${key}_name_translations`] }, lang);
  const sel = 'px-3 py-2 rounded-xl border border-slate-200 bg-white text-[13px] min-w-0';

  if (!data) return error ? <div role="alert" className="text-rose-700 text-[13px]">{error}</div> : null;
  return (
    <section className="bg-white rounded-card border border-slate-100 p-5 shadow-soft space-y-4" data-testid="subscription-rules">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-extrabold text-ink text-[16px] m-0">🗺️ {t('subrules.title')}</h2>
          <p className="text-[12.5px] text-slate-500 mt-1 mb-0">{t('subrules.hint')}</p>
        </div>
        <label className="flex items-center gap-2 text-[13px] font-bold cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={data.enabled} disabled={busy} data-testid="subscriptions-enabled"
            onChange={e => run(() => setSubscriptionsEnabled(e.target.checked))} />
          {data.enabled ? t('subrules.enabled') : t('subrules.disabled')}
        </label>
      </div>

      {error && <div role="alert" className="text-rose-700 text-[13px]">{error}</div>}

      <form className="flex flex-wrap gap-2 items-center" onSubmit={e => { e.preventDefault(); run(async () => { await createSubscriptionRule({ ...form, is_free: form.is_free }); setForm(EMPTY); }); }}>
        <select className={sel} aria-label={t('location.region')} value={form.region_id} onChange={e => setForm(f => ({ ...f, region_id: e.target.value, city_id: '' }))}>
          <option value="">{t('subrules.all_regions')}</option>
          {regions.map(r => <option key={r.id} value={r.id}>{localizedName(r, lang)}</option>)}
        </select>
        <select className={sel} aria-label={t('location.city')} value={form.city_id} disabled={!form.region_id} onChange={e => setForm(f => ({ ...f, city_id: e.target.value }))}>
          <option value="">{t('subrules.all_cities')}</option>
          {cities.map(c => <option key={c.id} value={c.id}>{localizedName(c, lang)}</option>)}
        </select>
        <select className={sel} aria-label={t('requester.profession')} value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
          <option value="">{t('requester.all_professions')}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {localizedName(c, lang)}</option>)}
        </select>
        <select className={sel} aria-label={t('subrules.kind')} value={form.is_free ? '1' : '0'} onChange={e => setForm(f => ({ ...f, is_free: e.target.value === '1' }))}>
          <option value="0">💳 {t('subrules.paid')}</option>
          <option value="1">🎁 {t('subrules.free')}</option>
        </select>
        <button type="submit" disabled={busy} className="px-4 py-2 rounded-pill bg-brand-600 text-white text-[13px] font-bold">+ {t('subrules.add')}</button>
      </form>

      {data.rules.length === 0
        ? <p className="text-[13px] text-slate-500 m-0">{t('subrules.empty')}</p>
        : <ul className="divide-y divide-slate-100 list-none p-0 m-0">
          {data.rules.map(rule => (
            <li key={rule.id} className={`flex items-center justify-between gap-2 py-2 text-[13px] ${rule.is_active ? '' : 'opacity-50'}`}>
              <span className="min-w-0">
                <span className={`px-2 py-0.5 rounded-pill text-[11px] font-bold me-2 ${Number(rule.is_free) ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                  {Number(rule.is_free) ? `🎁 ${t('subrules.free')}` : `💳 ${t('subrules.paid')}`}
                </span>
                {[rule.region_id ? name(rule, 'region') : t('subrules.all_regions'), rule.city_id ? name(rule, 'city') : t('subrules.all_cities'),
                  rule.category_id ? name(rule, 'category') : t('requester.all_professions')].join(' · ')}
              </span>
              <span className="flex gap-1.5 shrink-0">
                <button type="button" disabled={busy} className="px-3 py-1 rounded-pill bg-slate-100 text-[11.5px] font-semibold"
                  onClick={() => run(() => updateSubscriptionRule(rule.id, { is_active: !rule.is_active }))}>{rule.is_active ? t('subrules.pause') : t('subrules.resume')}</button>
                <button type="button" disabled={busy} className="px-3 py-1 rounded-pill bg-rose-50 text-rose-700 text-[11.5px] font-semibold"
                  onClick={() => run(() => deleteSubscriptionRule(rule.id))}>{t('admin.delete')}</button>
              </span>
            </li>
          ))}
        </ul>}
    </section>
  );
}
