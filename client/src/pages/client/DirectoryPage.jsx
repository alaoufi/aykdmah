import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listDirectory, saveToDirectory, contactDirect } from '../../services/requestService';
import { apiError } from '../../services/api';
import { localizedJoinedName } from '../../utils/localizeJoined';
import { localizedName } from '../../utils/localize';
import Avatar from '../../components/common/Avatar';
import { LoadingState } from '../../components/common/Spinner';

// "My directory" (AYK-041): providers the requester kept, to contact again directly
// without posting a request. Each contact is still recorded as a request.
export default function DirectoryPage({ compact = false }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(0);
  const [problem, setProblem] = useState('');

  useEffect(() => { listDirectory().then(setItems).catch(() => setItems([])); }, []);

  const run = async (id, action) => {
    setBusy(id); setProblem('');
    try { await action(); } catch (err) { setProblem(apiError(err)); } finally { setBusy(0); }
  };
  const contact = p => run(p.id, async () => { const res = await contactDirect(p.id, p.category_id); navigate(`/chat/${res.conversation_id}`); });
  const remove = p => run(p.id, async () => { await saveToDirectory(p.id, false); setItems(rows => rows.filter(row => row.id !== p.id)); });

  if (items === null) return compact ? null : <LoadingState />;
  const shown = compact ? items.slice(0, 4) : items;
  return (
    <section data-testid="my-directory" className={compact ? '' : 'container page'}>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold text-fg m-0">📒 {t('requester.directory_title')}</h2>
          <p className="text-[13px] text-fg-muted mt-1 mb-0">{t('requester.directory_hint')}</p>
        </div>
        {compact && items.length > 0 && <Link to="/directory" className="text-[13px] font-semibold text-primary">{t('for_you.view_all')}</Link>}
      </div>
      {problem && <p role="alert" className="form-error">{problem}</p>}
      {items.length === 0
        ? <p className="card text-fg-muted text-[14px] m-0">{t('requester.directory_empty')}</p>
        : <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
          {shown.map(p => (
            <li key={p.id} className="card tone-provider p-3 flex gap-3 items-start" data-testid="directory-item">
              <Avatar src={p.avatar} name={p.business_name || p.full_name} />
              <div className="flex-1 min-w-0">
                <Link to={`/providers/${p.id}`} className="font-bold text-fg truncate block">{p.business_name || p.full_name}</Link>
                <div className="text-[13px] text-fg-muted mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {p.category_name && <span>🛠️ {localizedJoinedName(p, 'category', lang)}</span>}
                  {p.district_name_ar && <span>📍 {localizedName({ name_ar: p.district_name_ar, name_en: p.district_name_en }, lang)}</span>}
                  <span>⭐ {p.rating_count ? `${p.rating_avg.toFixed(1)} (${p.rating_count})` : t('for_you.no_ratings')}</span>
                  <span className={p.availability?.state === 'available' ? 'text-success' : ''}>● {t(p.availability?.state === 'available' ? 'for_you.available' : 'for_you.unavailable')}</span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy === p.id} onClick={() => contact(p)} data-testid="directory-contact">💬 {t('requester.contact_direct')}</button>
                  <button type="button" className="text-[13px] font-semibold text-fg-muted" disabled={busy === p.id} onClick={() => remove(p)}>✕ {t('requester.remove_directory')}</button>
                </div>
              </div>
            </li>
          ))}
        </ol>}
    </section>
  );
}
