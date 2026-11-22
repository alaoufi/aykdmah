import { useTranslation } from 'react-i18next';
import { stateKey } from '../../utils/boardFilterState.js';


// AYK-444 (the owner, with a screenshot he liked: «اعرض لي» and two large boxes): «مهنتي» for a service
// provider, «طلبي» for a requester, and «منطقتي». Each is a box to tick on or off; there is no «الكل»,
// because leaving both unticked shows everyone. When the administration restricts views, both are
// ticked and fixed. `hint` explains a box that cannot work yet (no services / no requests).
export default function BoardFilters({ value, onChange, asProvider = false, restricted = false, hint = '', meta = null, size = 'md', testId = 'home-filters' }) {
  const { t } = useTranslation();
  const on = restricted ? { prof: true, area: true } : value;
  const small = size === 'sm';
  const box = (key, label) => {
    const active = Boolean(on[key]);
    return (
      <button key={key} type="button" role="checkbox" aria-checked={active} disabled={restricted}
        onClick={() => onChange({ ...value, [key]: !value[key] })} data-testid={`${testId === 'home-filters' ? 'home-filter' : `${testId}-filter`}-${key}`}
        className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 rounded-card font-extrabold transition border-0 ${small ? 'h-9 text-[13px]' : 'h-11 text-[15px]'} ${active
          ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-fg hover:bg-surface'} ${restricted ? 'cursor-default opacity-90' : 'cursor-pointer'}`}>
        {/* AYK-445 (the owner's screenshot): a small square in each box, ticked when chosen. */}
        <span aria-hidden="true" className={`inline-grid place-items-center shrink-0 rounded-[6px] ${small ? 'w-4 h-4 text-[10px]' : 'w-5 h-5 text-[12px]'} ${active
          ? 'bg-white text-primary' : 'border-2 border-fg-muted/60 bg-surface'}`}>{active ? '✓' : ''}</span>{label}
      </button>
    );
  };
  return (
    <div data-testid={testId}>
      <div className={`rounded-card border border-border bg-surface ${small ? 'p-2' : 'p-2.5'}`} role="group" aria-label={t('home.filter_title')}>
        <div className={`font-extrabold text-fg ${small ? 'text-[12.5px] mb-1.5' : 'text-[14px] mb-2'}`}>{t('home.filter_title')}</div>
        <div className="flex gap-1.5 rounded-card bg-surface-alt p-1">
          {box('prof', t(asProvider ? 'home.filter_my_profession' : 'home.filter_my_requests'))}
          {box('area', t('home.filter_my_area'))}
        </div>
      </div>
      <p className={`text-fg-muted mt-1 mb-0 ${small ? 'text-[11.5px]' : 'text-[12px]'}`}>
        {restricted ? t('home.filter_restricted') : hint || t(stateKey(on, asProvider, meta))}
      </p>
    </div>
  );
}
