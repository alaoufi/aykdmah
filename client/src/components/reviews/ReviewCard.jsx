import { safeUrl } from '../../utils/urlSafety';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { useAuth } from '../../hooks/useAuth';
import Avatar from '../common/Avatar';
import StarRating from './StarRating';
import {
  getReviewTranslation, voteHelpful, reportReview, replyToReview,
} from '../../services/reviewService';
import { formatRelativeTime } from '../../utils/formatters';

function langLabel(code) {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label || code?.toUpperCase();
}

export default function ReviewCard({ review, canReply = false, onChange }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const viewerLang = (i18n.resolvedLanguage || 'ar').toLowerCase().split(/[-_]/)[0];

  const needsTranslation = review.comment
    && review.original_language
    && review.original_language !== viewerLang;

  const [showOriginal, setShowOriginal] = useState(!needsTranslation);
  const [translation, setTranslation] = useState(null);
  const [tLoading, setTLoading] = useState(false);
  const [voted, setVoted] = useState(!!review.user_voted);
  const [helpfulCount, setHelpfulCount] = useState(Number(review.helpful_count || 0));
  const [reporting, setReporting] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  useEffect(() => {
    let current = true;
    setTranslation(null);
    setShowOriginal(!needsTranslation);
    setTLoading(false);
    if (!needsTranslation) return undefined;
    setTLoading(true);
    getReviewTranslation(review.id, viewerLang)
      .then(result => { if (current) setTranslation(result); })
      .catch(() => {})
      .finally(() => { if (current) setTLoading(false); });
    return () => { current = false; };
  }, [review.id, viewerLang, needsTranslation, review.comment]);

  const handleHelpful = async () => {
    if (!user) return;
    try {
      const res = await voteHelpful(review.id);
      setVoted(res.voted);
      setHelpfulCount(Number(res.helpful_count));
    } catch (_) {}
  };

  const handleReport = async (reason) => {
    if (!user || reportSent) return;
    try {
      await reportReview(review.id, reason);
      setReportSent(true);
      setReporting(false);
    } catch (_) {}
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    try {
      await replyToReview(review.id, replyText.trim());
      setReplyOpen(false);
      setReplyText('');
      onChange && onChange();
    } catch (_) {}
  };

  const displayText = showOriginal
    ? review.comment
    : (translation?.text || review.comment);

  const isShowingTranslation = !showOriginal && translation && translation.text !== review.comment;
  const criteria = review.criteria_ratings || null;

  return (
    <div className="bg-white rounded-card border border-slate-100 p-4 md:p-5 shadow-soft">
      <div className="flex items-start gap-3 mb-3">
        <Avatar src={review.reviewer_avatar} name={review.reviewer_name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-ink text-[14px]">{review.reviewer_name || '—'}</span>
            <span className="px-2 py-0.5 rounded-pill bg-emerald-50 text-emerald-600 text-[10px] font-bold">
              ✓ {t('review.verified')}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <StarRating value={review.rating} readOnly size={14} />
            <span className="text-[11.5px] text-slate-400">{formatRelativeTime(review.created_at)}</span>
          </div>
        </div>
      </div>

      {criteria && Object.keys(criteria).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1.5 mb-3 p-2.5 rounded-card bg-slate-50">
          {Object.entries(criteria).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between text-[12px]">
              <span className="text-slate-600">{t(`review.criteria.${key}`, key)}</span>
              <span className="text-amber-500 font-bold">{Number(val).toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}

      {review.comment && (
        <>
          <p className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap">
            {tLoading ? (
              <span className="text-slate-400">{t('common.loading')}</span>
            ) : displayText}
          </p>
          {needsTranslation && (
            <div className="mt-2 flex items-center gap-2 text-[11.5px] text-slate-500">
              <span>
                {isShowingTranslation
                  ? `🌐 ${t('review.translated_from', { lang: langLabel(review.original_language) })}`
                  : `🗒 ${t('review.original_in', { lang: langLabel(review.original_language) })}`}
              </span>
              <button
                onClick={() => setShowOriginal((v) => !v)}
                className="text-brand-700 hover:text-brand-800 underline underline-offset-2 font-semibold"
              >
                {isShowingTranslation ? t('review.show_original') : t('review.show_translated')}
              </button>
            </div>
          )}
        </>
      )}

      {Array.isArray(review.images) && review.images.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {review.images.map((src, i) => (
            <a key={i} href={safeUrl(src) || undefined} target="_blank" rel="noopener noreferrer">
              <img src={safeUrl(src) || undefined} alt="" loading="lazy"
                className="w-20 h-20 rounded-card object-cover hover:opacity-90 transition" />
            </a>
          ))}
        </div>
      )}

      {review.provider_reply && (
        <div className="mt-3 p-3 rounded-card bg-brand-50 border-s-4 border-brand-300 text-[13px] text-slate-700">
          <div className="text-[11px] font-bold text-brand-700 mb-1">
            ↩ {t('review.reply_label')}
            {review.provider_reply_at && (
              <span className="text-slate-400 font-normal ms-2">{formatRelativeTime(review.provider_reply_at)}</span>
            )}
          </div>
          <div className="whitespace-pre-wrap">{review.provider_reply}</div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1.5 flex-wrap text-[12px]">
        <button
          onClick={handleHelpful}
          disabled={!user}
          className={`px-3 py-1 rounded-pill font-semibold transition disabled:opacity-60 ${
            voted ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          👍 {t('review.helpful')} {helpfulCount > 0 && <span className="ms-1 opacity-70">{helpfulCount}</span>}
        </button>

        {canReply && !review.provider_reply && (
          <button
            onClick={() => setReplyOpen((v) => !v)}
            className="px-3 py-1 rounded-pill bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
          >
            ↩ {t('review.reply')}
          </button>
        )}

        <div className="ms-auto relative">
          {reportSent ? (
            <span className="text-[11px] text-slate-400">✓ {t('review.report_sent')}</span>
          ) : (
            <button
              onClick={() => setReporting((v) => !v)}
              disabled={!user}
              className="text-slate-400 hover:text-rose-600 text-[11px] disabled:opacity-50"
            >
              ⚐ {t('review.report')}
            </button>
          )}
          {reporting && (
            <div className="absolute end-0 top-full mt-1 bg-white border border-slate-200 rounded-card shadow-card p-1 min-w-[180px] z-10">
              {['spam', 'offensive', 'fake', 'other'].map((r) => (
                <button key={r} onClick={() => handleReport(r)}
                  className="block w-full text-start px-3 py-1.5 text-[12px] hover:bg-slate-50 rounded">
                  {t(`review.report_${r}`)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {replyOpen && (
        <form onSubmit={handleReply} className="mt-3 flex gap-2">
          <input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={t('review.reply_placeholder')}
            className="flex-1 px-3 py-2 rounded-pill border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[13.5px]"
          />
          <button type="submit"
            className="px-4 py-2 rounded-pill text-white text-[12.5px] font-semibold shadow-soft"
            style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}>
            {t('common.send')}
          </button>
        </form>
      )}
    </div>
  );
}
