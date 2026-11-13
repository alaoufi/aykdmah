import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listCategories, listServices } from '../../services/serviceService';
import { localizedName } from '../../utils/localize';

export default function ProviderServicesPicker({ categoryId, serviceIds = [], onChange, required = false, disabled = false, errors = {} }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const id = useId();
  const [categories, setCategories] = useState({ rows: [], loading: true, error: false });
  const [services, setServices] = useState({ categoryId: null, rows: [], loading: false, error: false });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    setCategories(previous => ({ ...previous, loading: true, error: false }));
    listCategories().then(rows => {
      if (current) setCategories({ rows: Array.isArray(rows) ? rows : [], loading: false, error: false });
    }).catch(() => { if (current) setCategories({ rows: [], loading: false, error: true }); });
    return () => { current = false; };
  }, [retry]);

  useEffect(() => {
    let current = true;
    const selected = categoryId ? Number(categoryId) : null;
    setServices({ categoryId: selected, rows: [], loading: Boolean(selected), error: false });
    if (selected) listServices(selected).then(rows => {
      if (current) setServices({ categoryId: selected, rows: Array.isArray(rows) ? rows : [], loading: false, error: false });
    }).catch(() => { if (current) setServices({ categoryId: selected, rows: [], loading: false, error: true }); });
    return () => { current = false; };
  }, [categoryId, retry]);

  // A late response from a previously selected profession never renders its
  // services beneath the new profession or restores cleared selections.
  const currentServices = Number(services.categoryId) === Number(categoryId) ? services : { rows: [], loading: Boolean(categoryId), error: false };
  const selectedIds = new Set(serviceIds.map(Number));
  const categoryMissing = categoryId && !categories.loading && !categories.error &&
    !categories.rows.some(category => Number(category.id) === Number(categoryId));

  return (
    <div className="space-y-3" data-provider-services-picker>
      <div className="form-group">
        <label htmlFor={`${id}-profession`} className="form-label">{t('provider.profession')}{required ? ' *' : ''}</label>
        <select id={`${id}-profession`} name="category_id" className="select" value={categoryId || ''}
          required={required} disabled={disabled || categories.loading || categories.error}
          aria-invalid={errors.category_id ? true : undefined} aria-describedby={errors.category_id ? `${id}-profession-error` : `${id}-profession-hint`}
          onChange={event => onChange({ category_id: event.target.value, service_ids: [] })}>
          <option value="">{categories.loading ? t('common.loading') : t('provider.choose_profession')}</option>
          {categoryMissing && <option value={categoryId} disabled>{t('provider.profession_unavailable')}</option>}
          {categories.rows.map(category => <option key={category.id} value={category.id}>{localizedName(category, lang)}</option>)}
        </select>
        <p id={`${id}-profession-hint`} className="text-xs text-muted mt-1">{t('provider.profession_hint')}</p>
        {errors.category_id && <p id={`${id}-profession-error`} className="form-error">{errors.category_id}</p>}
      </div>

      <fieldset className="min-w-0 border-0 p-0" disabled={disabled} aria-describedby={`${id}-services-hint`}>
        <legend className="form-label">{t('provider.services_offered')}{required ? ' *' : ''}</legend>
        <p id={`${id}-services-hint`} className="text-xs text-muted mb-2">{t('provider.services_hint')}</p>
        {!categoryId ? <p className="text-sm text-secondary">{t('provider.select_profession_first')}</p> :
          currentServices.loading ? <p role="status" className="text-sm text-secondary">{t('common.loading')}</p> :
          currentServices.error ? null : currentServices.rows.length === 0 ?
            <p className="text-sm text-secondary">{t('provider.no_services')}</p> :
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {currentServices.rows.map(service => <label key={service.id}
                className={`flex items-start gap-2 rounded-card border p-3 cursor-pointer focus-within:ring-2 focus-within:ring-primary ${selectedIds.has(Number(service.id)) ? 'border-primary bg-primary-soft' : 'border-border bg-surface-alt'}`}>
                <input type="checkbox" name="service_ids" value={service.id} checked={selectedIds.has(Number(service.id))}
                  className="mt-0.5 h-4 w-4 accent-primary shrink-0" disabled={disabled || (!selectedIds.has(Number(service.id)) && selectedIds.size >= 50)}
                  onChange={event => onChange({ category_id: categoryId, service_ids: event.target.checked ?
                    [...serviceIds, Number(service.id)] : serviceIds.filter(value => Number(value) !== Number(service.id)) })} />
                <span className="text-sm">{localizedName(service, lang)}</span>
              </label>)}
            </div>}
        {errors.service_ids && <p role="alert" className="form-error mt-1">{errors.service_ids}</p>}
      </fieldset>
      {(categories.error || currentServices.error) && <div role="alert" className="text-sm text-secondary">
        {t('provider.catalog_unavailable')}{' '}
        <button type="button" disabled={disabled} className="text-primary font-semibold" onClick={() => setRetry(value => value + 1)}>{t('provider.retry_catalog')}</button>
      </div>}
    </div>
  );
}
