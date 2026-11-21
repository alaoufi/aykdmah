import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listPreviousClients } from '../../services/requestService';
import { LoadingState, EmptyState } from '../../components/common/Spinner';
import ProblemNotice from '../../components/common/ProblemNotice';
import { localizedName } from '../../utils/localize';
import { formatRelativeTime } from '../../utils/formatters';

// AYK-398 (the owner: «في اللوحة يمكن استعراض العملاء السابقين فقط للاستعلام»). The requesters this
// provider worked for, newest first, to look up only: no editing here. A requester's name stays
// hidden (AYK-142): the name saved in «دليلي», else «طالب الخدمة» with the account number.
export default function PreviousClientsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  useEffect(() => {
    let alive = true;
    listPreviousClients().then(list => { if (alive) setRows(list); }).catch(() => { if (alive) { setRows([]); setError(true); } });
    return () => { alive = false; };
  }, []);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!rows || !q) return rows || [];
    return rows.filter(row => [row.name, row.account_number, row.last_request?.title, row.last_request?.translation?.title,
      row.city_name_ar, row.city_name_en, row.district_name_ar, row.district_name_en].some(v => String(v || '').toLowerCase().includes(q)));
  }, [rows, search]);
  if (rows === null) return <LoadingState />;
  return (
    <div data-testid="previous-clients">
      <h2 className="mb-1">⭐ {t('work.previous_clients_title')}</h2>
      <p className="text-[13px] text-fg-muted mt-0 mb-3">{t('work.previous_clients_page_hint')}</p>
      {error && <ProblemNotice error={t('errors.generic')} />}
      {rows.length > 0 && (
        <input type="search" className="input mb-3 w-full max-w-md" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('work.previous_clients_search')} aria-label={t('work.previous_clients_search')} data-testid="previous-clients-search" />
      )}
      {rows.length === 0 ? <EmptyState title={t('work.previous_clients_empty')} />
        : shown.length === 0 ? <EmptyState title={t('catalog.no_results')} />
          : (
            <ol className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none p-0 m-0">
              {shown.map(row => {
                const area = [localizedName({ name_ar: row.district_name_ar, name_en: row.district_name_en }, lang),
                  localizedName({ name_ar: row.city_name_ar, name_en: row.city_name_en }, lang)].filter(Boolean).join('، ');
                const lastTitle = row.last_request?.translation?.title || row.last_request?.title;
                return (
                  <li key={row.id} className="card p-3 space-y-1.5" data-testid="previous-client">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <b className="text-[15px]">👤 {row.name}</b>
                      {row.account_number && <span className="text-[12px] text-fg-muted">{t('brand.customer_number')}: <b dir="ltr">{row.account_number}</b></span>}
                    </div>
                    {area && <div className="text-[12.5px] text-fg-muted">📍 {area}</div>}
                    <div className="text-[12.5px] text-fg-muted">
                      🧰 {t('work.previous_clients_jobs', { count: row.jobs })}{row.last_at ? ` · ${formatRelativeTime(row.last_at)}` : ''}
                    </div>
                    {lastTitle && <div className="text-[13px]">{t('work.previous_clients_last')}: <Link to={`/requests/${row.last_request.id}`} className="font-semibold">{lastTitle}</Link></div>}
                    {row.open_request_id && (
                      <Link to={`/requests/${row.open_request_id}`} className="btn btn-primary btn-sm w-fit" data-testid="previous-client-open-request">
                        📨 {t('work.previous_clients_open_request')}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
    </div>
  );
}
