import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useLocationOptions from '../../hooks/useLocationOptions';
import { localizedName } from '../../utils/localize';

// The neighbourhoods of ONE city that a provider serves.
export default function CoverageDistrictsPicker({ cityId, value = [], onChange, disabled = false, error, onDistrictsLoaded }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const { rows, loading } = useLocationOptions('districts', cityId);
  const [search, setSearch] = useState('');
  const selected = new Set(value.map(Number));
  const needle = search.trim().toLowerCase();
  const visible = needle ? rows.filter(row => `${row.name_ar || ''} ${row.name_en || ''}`.toLowerCase().includes(needle)) : rows;
  useEffect(() => {
    if (onDistrictsLoaded && cityId && !loading) onDistrictsLoaded(rows.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, loading, rows.length]);

  if (!cityId) return <p className="text-sm text-secondary">{t('provider.coverage_city_first')}</p>;
  return (
    <fieldset className="min-w-0 border-0 p-0" disabled={disabled} data-coverage-picker>
      <legend className="form-label">{t('provider.coverage')} *</legend>
      {loading ? <p role="status" className="text-sm text-secondary">{t('common.loading')}</p> : rows.length === 0 ?
        <p className="text-sm text-secondary">{t('provider.coverage_whole_city')}</p> : <>
          <div className="flex items-center gap-1.5 mb-2">
            <input type="search" className="input flex-1 !py-1.5" value={search} placeholder={t('provider.coverage_search')}
              onChange={event => setSearch(event.target.value)} />
            <button type="button" className="px-3 py-1.5 rounded-pill text-[12.5px] font-semibold bg-surface-alt"
              onClick={() => onChange(selected.size === rows.length ? [] : rows.map(row => Number(row.id)))}>
              {selected.size === rows.length ? t('provider.coverage_clear') : t('provider.coverage_all')}
            </button>
          </div>
          <div className="text-[12px] text-fg-muted mb-1">{t('provider.coverage_count', { count: selected.size })}</div>
          <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto">
            {visible.map(row => {
              const active = selected.has(Number(row.id));
              return (
                <button key={row.id} type="button" aria-pressed={active}
                  onClick={() => onChange(active ? value.map(Number).filter(id => id !== Number(row.id)) : [...value.map(Number), Number(row.id)])}
                  className={`px-2.5 py-1 rounded-pill border text-[12.5px] ${active ? 'border-primary bg-primary-soft font-semibold' : 'border-border bg-surface-alt'}`}>
                  {active ? '✓ ' : ''}{localizedName(row, lang)}
                </button>
              );
            })}
          </div>
        </>}
      {error && <p role="alert" className="form-error mt-1">{error}</p>}
    </fieldset>
  );
}
