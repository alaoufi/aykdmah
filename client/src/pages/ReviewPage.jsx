import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiError } from '../services/api';
import { submitReview } from '../services/reviewService';
import { getRequest } from '../services/requestService';
import { useAuth } from '../hooks/useAuth';
import StarRating from '../components/reviews/StarRating';
import Input from '../components/common/Input';
import Button from '../components/common/Button';

// Two sets of criteria depending on direction
const PROVIDER_CRITERIA = ['quality', 'professionalism', 'speed', 'communication', 'accuracy'];
const REQUESTER_CRITERIA = ['communication', 'commitment', 'respect', 'payment', 'clarity'];

export default function ReviewPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { user } = useAuth();

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState([]);
  const [request, setRequest] = useState(null);
  const [criteria, setCriteria] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // AYK-313: after sending, say so on this page («تم نشر تقييمك») instead of leaving silently.
  const [done, setDone] = useState(false);
  const errorRef = useRef(null);
  const doneRef = useRef(null);
  // A refusal is shown next to the button, where the person is, and brought into view.
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [error]);
  useEffect(() => { if (done) doneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [done]);

  useEffect(() => { getRequest(id).then(setRequest).catch(() => {}); }, [id]);

  const isClient = request && user && request.client_id === user.id;
  const isProvider = request && user && request.assigned_provider_id === user.id;
  const direction = isClient ? 'on_provider' : isProvider ? 'on_requester' : null;
  const criteriaList = direction === 'on_provider' ? PROVIDER_CRITERIA
                      : direction === 'on_requester' ? REQUESTER_CRITERIA : [];

  const targetName = isClient
    ? (request?.assigned_provider_name || request?.provider_name)
    : (request?.client_name || t('auth.role_client'));

  const setCriterion = (key, val) => setCriteria((c) => ({ ...c, [key]: val }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('request_id', id);
      fd.append('rating', rating);
      fd.append('comment', comment);
      fd.append('original_language', (i18n.resolvedLanguage || 'ar').toLowerCase().split(/[-_]/)[0]);
      if (Object.keys(criteria).length) {
        fd.append('criteria_ratings', JSON.stringify(criteria));
      }
      files.forEach((f) => fd.append('images', f));
      await submitReview(fd);
      setDone(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  if (!request || !user) {
    return <div className="container page text-center py-12">{t('common.loading')}</div>;
  }
  if (!direction) {
    return (
      <div className="container page max-w-md mx-auto py-12">
        <div className="bg-rose-50 border border-rose-200 p-6 rounded-card text-rose-700 text-center">
          {t('errors.forbidden')}
        </div>
      </div>
    );
  }

  const title = direction === 'on_provider' ? t('review.rate_provider') : t('review.rate_requester');
  const subtitle = direction === 'on_provider' ? t('review.rate_provider_hint') : t('review.rate_requester_hint');

  return (
    <div className="container page max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-ink text-2xl md:text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-slate-500 mt-1">{subtitle}</p>
        {targetName && <p className="text-brand-700 font-bold mt-2">{targetName}</p>}
        <p className="text-slate-400 text-sm mt-1">{request.title}</p>
      </div>

      {done && (
        <div ref={doneRef} role="status" data-testid="review-published"
          className="bg-emerald-50 border border-emerald-200 p-6 rounded-card text-emerald-800 text-center space-y-3 mb-28">
          <div className="text-lg font-extrabold">✅ {t('review.published')}</div>
          <p className="text-sm m-0">{t('review.published_hint')}</p>
          <Link to={`/requests/${id}`} className="btn btn-primary btn-sm">{t('review.back_to_request')}</Link>
        </div>
      )}

      {!done && <form onSubmit={submit} className="bg-white rounded-card border border-slate-100 p-5 md:p-6 shadow-soft space-y-5 mb-28 md:mb-6">
        <div className="text-center">
          <label className="block text-[12.5px] font-bold text-slate-600 mb-2">{t('review.overall_rating')}</label>
          <div className="flex justify-center">
            <StarRating value={rating} onChange={setRating} size={42} />
          </div>
        </div>

        {criteriaList.length > 0 && (
          <div className="bg-slate-50 rounded-card p-4 space-y-2">
            <div className="text-[12.5px] font-bold text-slate-700 mb-1">
              {t('review.detailed_rating')} <span className="text-slate-400 font-normal">({t('common.optional')})</span>
            </div>
            {criteriaList.map((c) => (
              <div key={c} className="flex items-center justify-between gap-3">
                <span className="text-[13.5px] text-slate-700">{t(`review.criteria.${c}`)}</span>
                <StarRating value={criteria[c] || 0} onChange={(v) => setCriterion(c, v)} size={20} />
              </div>
            ))}
          </div>
        )}

        <Input
          as="textarea"
          label={t('review.write_review')}
          placeholder={t('review.review_placeholder')}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        {direction === 'on_provider' && (
          <div>
            <label className="block text-[12.5px] font-bold text-slate-600 mb-1">
              {t('request.attachments')} <span className="text-slate-400 font-normal">({t('common.optional')})</span>
            </label>
            <input
              type="file" multiple accept="image/*"
              onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 4))}
              className="text-sm"
            />
          </div>
        )}

        {error && (
          <div ref={errorRef} role="alert" data-testid="review-error"
            className="px-4 py-3 rounded-card bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            {error}
          </div>
        )}

        <Button type="submit" block variant="primary" loading={loading}>
          {t('review.submit_review')}
        </Button>
      </form>}
    </div>
  );
}
