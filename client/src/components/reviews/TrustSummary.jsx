import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getUserReviews } from '../../services/reviewService';
import StarRating from './StarRating';
import { formatRelativeTime } from '../../utils/formatters';
import RatingInline from './RatingInline';

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
  // AYK-433 (the owner: «ما يحتاج بلا تقييم وآراء… إذا فيه يظهر وإذا ما فيه ما يظهر»): nothing at all
  // when there is no rating and no opinion; the stars and «آراء» only when there are ratings.
  const rated = Number(count) > 0;
  if (!rated && !opinion) return null;
  return <div className="mt-1 min-w-0" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    {rated && <button type="button" data-testid="trust-summary" className="text-primary text-[13px] font-bold text-start" onClick={() => { setPage(1);setOpen(true); }}>
      {/* AYK-430: the average as stars. */}
      <RatingInline average={average} count={count} /> · {t(type === 'on_requester' ? 'chat.requester_opinions' : 'chat.provider_opinions')}
    </button>}
    {opinion && <p className="m-0 text-[12px] text-fg-muted line-clamp-1" title={opinion}>“{opinion}”</p>}
    {open && createPortal(<div className="fixed inset-0 z-[5000] bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      {/* AYK-324 (the owner: the dialog looked plain): the average with gold stars on top, each
          opinion as a card with its stars and date, and page buttons only when there are more pages. */}
      <section data-testid="trust-dialog" role="dialog" aria-modal="true" aria-label={t('chat.opinions')} className="bg-surface text-fg rounded-card w-full max-w-md max-h-[80dvh] overflow-y-auto shadow-card" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <strong className="min-w-0 break-words text-[16px]">⭐ {t('chat.opinions')}</strong>
          <button autoFocus type="button" className="shrink-0 w-10 h-10 rounded-pill grid place-items-center bg-surface-alt" onClick={() => setOpen(false)} aria-label={t('common.close')}>✕</button>
        </div>
        {Number(count) > 0 && (
          <div className="mx-4 mt-2 p-3 rounded-card bg-amber-50 border border-amber-200 flex items-center gap-3" data-testid="trust-average">
            <span className="text-3xl font-extrabold text-amber-700 leading-none">{Number(average).toFixed(1)}</span>
            <div>
              <StarRating value={Number(average)} readOnly size={20} />
              <div className="text-[12.5px] text-amber-800">{t('provider_page.rating_count', { count })}</div>
            </div>
          </div>
        )}
        <div className="p-4 space-y-2">
          {error ? <p role="alert" className="text-danger m-0">{t('errors.generic')}</p>
            : rows === null ? <p className="m-0 text-fg-muted">{t('common.loading')}</p>
            : !rows.length ? <p className="m-0 text-fg-muted">{t('for_you.no_ratings')}</p>
            : rows.map(row => (
              <article key={row.id} className="p-3 rounded-card border border-border bg-surface-alt/40" data-testid="trust-opinion">
                <div className="flex items-center justify-between gap-2">
                  <StarRating value={Number(row.rating)} readOnly size={17} />
                  <span className="text-[11.5px] text-fg-subtle">{formatRelativeTime(row.created_at)}</span>
                </div>
                {row.comment && <p className="m-0 mt-1 text-[14px] whitespace-pre-wrap break-words">{row.comment}</p>}
              </article>
            ))}
          {(page > 1 || (rows && rows.length === 10)) && (
            <div className="flex items-center justify-center gap-3 pt-1">
              <button type="button" className="shrink-0 w-10 h-10 rounded-pill grid place-items-center bg-surface-alt disabled:opacity-40" disabled={page === 1 || rows === null} onClick={() => setPage(p => p - 1)} aria-label={t('common.previous', { defaultValue: '‹' })}>‹</button>
              <span className="text-[13px] text-fg-muted">{page}</span>
              <button type="button" className="shrink-0 w-10 h-10 rounded-pill grid place-items-center bg-surface-alt disabled:opacity-40" disabled={!rows || rows.length < 10} onClick={() => setPage(p => p + 1)} aria-label={t('common.next', { defaultValue: '›' })}>›</button>
            </div>
          )}
        </div>
      </section>
    </div>, document.body)}
  </div>;
}
