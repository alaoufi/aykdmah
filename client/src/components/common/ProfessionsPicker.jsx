import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listCategories, listServices } from '../../services/serviceService';
import { localizedName } from '../../utils/localize';

// Several professions (a plumber who is also an electrician). Choosing a
// profession selects all of its services; "Services" lets the provider untick
// the ones they do not offer. The value is the flat list of service IDs.
export default function ProfessionsPicker({ serviceIds = [], onChange, disabled = false, error }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [categories, setCategories] = useState({ rows: [], loading: true, error: false });
  const [servicesByCategory, setServicesByCategory] = useState({});
  const [chosen, setChosen] = useState([]);
  const [open, setOpen] = useState(null);
  const [retry, setRetry] = useState(0);
  const seeded = useRef(false);

  useEffect(() => {
    let current = true;
    setCategories(previous => ({ ...previous, loading: true, error: false }));
    listCategories().then(rows => { if (current) setCategories({ rows: Array.isArray(rows) ? rows : [], loading: false, error: false }); })
      .catch(() => { if (current) setCategories({ rows: [], loading: false, error: true }); });
    return () => { current = false; };
  }, [retry]);

  const loadServices = async categoryId => {
    if (servicesByCategory[categoryId]) return servicesByCategory[categoryId];
    const rows = await listServices(categoryId);
    const list = Array.isArray(rows) ? rows : [];
    setServicesByCategory(previous => ({ ...previous, [categoryId]: list }));
    return list;
  };

  // Editing an existing profile: show the professions its services belong to.
  useEffect(() => {
    if (seeded.current || !serviceIds.length || !categories.rows.length) return;
    seeded.current = true;
    let current = true;
    Promise.all(categories.rows.map(async category => [category.id, await loadServices(category.id).catch(() => [])]))
      .then(entries => {
        if (!current) return;
        const selected = new Set(serviceIds.map(Number));
        setChosen(entries.filter(([, rows]) => rows.some(row => selected.has(Number(row.id)))).map(([id]) => Number(id)));
      });
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.rows, serviceIds.length]);

  const selected = new Set(serviceIds.map(Number));

  const toggleProfession = async categoryId => {
    const id = Number(categoryId);
    if (chosen.includes(id)) {
      const rows = servicesByCategory[id] || [];
      const remove = new Set(rows.map(row => Number(row.id)));
      setChosen(previous => previous.filter(value => value !== id));
      if (open === id) setOpen(null);
      onChange(serviceIds.map(Number).filter(value => !remove.has(value)));
      return;
    }
    let rows;
    try { rows = await loadServices(id); } catch (_) { setCategories(previous => ({ ...previous, error: true })); return; }
    setChosen(previous => [...previous, id]);
    onChange([...new Set([...serviceIds.map(Number), ...rows.map(row => Number(row.id))])].slice(0, 50));
  };

  const toggleService = serviceId => onChange(selected.has(Number(serviceId))
    ? serviceIds.map(Number).filter(value => value !== Number(serviceId))
    : [...serviceIds.map(Number), Number(serviceId)].slice(0, 50));

  return (
    <fieldset className="min-w-0 border-0 p-0" disabled={disabled} data-professions-picker>
      <legend className="form-label">{t('provider.professions')} *</legend>
      <p className="text-xs text-muted mb-2">{t('provider.professions_hint')}</p>
      {categories.loading ? <p role="status" className="text-sm text-secondary">{t('common.loading')}</p> :
        <div className="flex flex-wrap gap-1.5">
          {categories.rows.map(category => {
            const active = chosen.includes(Number(category.id));
            const count = (servicesByCategory[category.id] || []).filter(row => selected.has(Number(row.id))).length;
            return (
              <span key={category.id} className={`inline-flex items-center rounded-pill border text-[13px] ${active ? 'border-primary bg-primary-soft text-ink' : 'border-border bg-surface-alt text-fg'}`}>
                <button type="button" aria-pressed={active} onClick={() => toggleProfession(category.id)}
                  className="px-3 py-1.5 font-semibold">
                  {active ? '✓ ' : ''}{category.icon ? `${category.icon} ` : ''}{localizedName(category, lang)}
                </button>
                {active && <button type="button" onClick={() => setOpen(open === Number(category.id) ? null : Number(category.id))}
                  aria-expanded={open === Number(category.id)} className="pe-3 ps-1 py-1.5 text-[12px] text-primary font-semibold">
                  {t('provider.edit_services')} ({count})
                </button>}
              </span>
            );
          })}
        </div>}
      {open && <div className="mt-2 rounded-card border border-border p-2 grid grid-cols-2 gap-1.5">
        {(servicesByCategory[open] || []).map(service => (
          <label key={service.id} className={`flex items-center gap-2 rounded-card border px-2 py-1.5 text-[13px] cursor-pointer ${selected.has(Number(service.id)) ? 'border-primary bg-primary-soft' : 'border-border'}`}>
            <input type="checkbox" className="h-4 w-4 accent-primary shrink-0" checked={selected.has(Number(service.id))}
              onChange={() => toggleService(service.id)} />
            <span>{localizedName(service, lang)}</span>
          </label>
        ))}
      </div>}
      {categories.error && <div role="alert" className="text-sm text-secondary mt-1">
        {t('provider.catalog_unavailable')}{' '}
        <button type="button" className="text-primary font-semibold" onClick={() => setRetry(value => value + 1)}>{t('provider.retry_catalog')}</button>
      </div>}
      {error && <p role="alert" className="form-error mt-1">{error}</p>}
    </fieldset>
  );
}
