import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getUserReviews } from '../../services/reviewService';

// Show only public, moderated opinions. Never reveal the reviewer's private name.
export default function TrustSummary({ userId, type = 'on_provider', average = 0, count = 0, opinion }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true; setRows(null); setError(false);
    getUserReviews(userId, { type, page, limit: 10 }).then(data => { if (alive) setRows(data.data || []); }).catch(() => { if (alive) setError(true); });
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('keydown', key);
    return () => { alive = false; document.removeEventListener('keydown', key); };
  }, [open, userId, type, page]);
  return <div className="mt-1 min-w-0" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <button type="button" data-testid="trust-summary" className="text-primary text-[13px] font-bold text-start" onClick={() => { setPage(1);setOpen(true); }}>
      ★ {Number(count) ? `${Number(average).toFixed(1)} (${count})` : t('for_you.no_ratings')} · {t(type === 'on_requester' ? 'chat.requester_opinions' : 'chat.provider_opinions')}
    </button>
    {opinion && <p className="m-0 text-[12px] text-fg-muted line-clamp-1" title={opinion}>“{opinion}”</p>}
    {open && createPortal(<div className="fixed inset-0 z-[5000] bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <section data-testid="trust-dialog" role="dialog" aria-modal="true" aria-label={t('chat.opinions')} className="bg-surface text-fg rounded-card p-4 w-full max-w-md max-h-[80dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2"><strong className="min-w-0 break-words">{t('chat.opinions')}</strong><button autoFocus type="button" className="shrink-0 w-11 h-11 rounded-pill grid place-items-center bg-surface-alt" onClick={() => setOpen(false)} aria-label={t('common.close')}>✕</button></div>
        {error ? <p role="alert" className="text-danger">{t('errors.generic')}</p> : rows === null ? <p>{t('common.loading')}</p> : !rows.length ? <p>{t('for_you.no_ratings')}</p> : rows.map(row => <article key={row.id} className="py-3 border-b border-border"><strong>★ {row.rating}/5</strong><p className="m-0 whitespace-pre-wrap break-words">{row.comment || '—'}</p></article>)}
        <div className="flex gap-3 mt-3"><button type="button" className="shrink-0 w-11 h-11 rounded-pill grid place-items-center bg-surface-alt" disabled={page === 1 || rows === null} onClick={() => setPage(p => p - 1)}>‹</button><span>{page}</span><button type="button" className="shrink-0 w-11 h-11 rounded-pill grid place-items-center bg-surface-alt" disabled={!rows || rows.length < 10} onClick={() => setPage(p => p + 1)}>›</button></div>
      </section>
    </div>, document.body)}
  </div>;
}
