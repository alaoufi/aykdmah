import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { IconSearch } from '../common/Icons';
import { localizedName } from '../../utils/localize';
import { CATALOG_SORTS } from '../../utils/catalogFilters';

export default function SearchAndFilters({ value, onChange, onReset, options }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const { user } = useAuth();
  // A signed-in user's area is the one registered on the account (changed from "Edit your area").
  const ownArea = Boolean(user?.city_id);
  const fields = [
    { key: 'region', data: options.regions, placeholder: 'home.available_regions', disabled: false },
    { key: 'governorate', data: options.governorates, placeholder: 'location.all_governorates', disabled: !value.region },
    { key: 'city', data: options.cities, placeholder: 'location.all_cities', disabled: !value.region },
    { key: 'district', data: options.districts, placeholder: 'location.all_districts', disabled: !value.city },
  ];

  return (
    <div className="bg-white rounded-card border border-slate-100 shadow-soft p-4 md:p-5 space-y-3">
      <label className="relative flex items-center gap-2 px-3.5 py-2.5 rounded-card bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500/20 transition">
        <IconSearch size={18} className="text-slate-400 shrink-0" />
        <input
          aria-label={t('common.search')}
          value={value.q}
          onChange={e => onChange({ q: e.target.value })}
          placeholder={t('catalog.search_placeholder')}
          className="bg-transparent text-[14px] text-ink placeholder:text-slate-400 outline-none w-full"
        />
      </label>
      {ownArea ? (
        <p className="text-[13px] text-fg-muted m-0" data-testid="own-area">📍 {t('for_you.using_your_area')}{' '}
          <Link to="/profile#my-area" className="font-semibold text-primary">{t('for_you.edit_area')}</Link>
        </p>
      ) : <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {fields.map(({ key, data, placeholder, disabled }) => {
          const hasSelection = data.rows.some(row => String(row.id) === value[key]);
          const emptyLabel = data.loading ? t('common.loading') : data.error ? t('location.options_unavailable') :
            key === 'district' && value.city && !data.rows.length ? t('location.no_districts') : t(placeholder);
          return (
            <label key={key} className="block min-w-0 text-[11px] text-slate-500 font-semibold">
              {t(`location.${key}`)}
              <select
                aria-label={t(`location.${key}`)}
                value={value[key]}
                onChange={e => onChange({ [key]: e.target.value })}
                disabled={disabled || data.loading || data.error || !data.rows.length}
                className="mt-1 w-full px-3 py-2.5 rounded-card border border-slate-200 bg-slate-50 text-[13px] font-semibold text-ink outline-none focus:border-brand-500 disabled:opacity-60"
              >
                <option value="">{emptyLabel}</option>
                {value[key] && !hasSelection && <option value={value[key]}>{t('catalog.invalid_location')}</option>}
                {data.rows.map(row => <option key={row.id} value={row.id}>{localizedName(row, lang)}</option>)}
              </select>
            </label>
          );
        })}
      </div>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="text-[11px] text-slate-500 font-semibold">
          {t('catalog.sort_by')}
          <select
            aria-label={t('catalog.sort_by')}
            value={value.sort}
            onChange={e => onChange({ sort: e.target.value })}
            className="block mt-1 px-3 py-2.5 rounded-card border border-slate-200 bg-slate-50 text-[13px] font-semibold text-ink outline-none focus:border-brand-500"
          >
            {CATALOG_SORTS.map(sort => <option key={sort} value={sort}>{t(`catalog.sort_${sort}`)}</option>)}
          </select>
        </label>
        <button type="button" onClick={onReset} className="px-3 py-2.5 rounded-pill text-brand-700 text-sm font-semibold hover:bg-brand-50">
          {t('common.reset')}
        </button>
      </div>
    </div>
  );
}
