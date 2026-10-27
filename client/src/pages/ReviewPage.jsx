import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const { user } = useAuth();

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState([]);
  const [request, setRequest] = useState(null);
  const [criteria, setCriteria] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { getRequest(id).then(setRequest).catch(() => {}); }, [id]);

  const isClient = request && user && request.client_id === user.id;
  const isProvider = request && user && request.assigned_provider_id === user.id;
  const direction = isClient ? 'on_provider' : isProvider ? 'on_requester' : null;
  const criteriaList = direction === 'on_provider' ? PROVIDER_CRITERIA
                      : direction === 'on_requester' ? REQUESTER_CRITERIA : [];

  const targetName = isClient
    ? (request?.assigned_provider_name || request?.provider_name)
    : (request?.client_name);

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
      fd.append('original_language', (i18n.resolvedLanguage || 'ar').toLowerCase().slice(0, 2));
      if (Object.keys(criteria).length) {
        fd.append('criteria_ratings', JSON.stringify(criteria));
      }
      files.forEach((f) => fd.append('images', f));
      await submitReview(fd);
      navigate(`/requests/${id}`);
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

      {error && (
        <div className="px-4 py-3 mb-4 rounded-card bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="bg-white rounded-card border border-slate-100 p-5 md:p-6 shadow-soft space-y-5">
        <div className="text-center">
          <label className="block text-[12.5px] font-bold text-slate-600 mb-2">{t('review.overall_rating')}</label>
          <div className="flex justify-center">
            <StarRating value={rating} onChange={setRating} size={42} />
          </div>
        </div>

        {criteriaList.length > 0 && (
          <div className="bg-slate-50 rounded-card p-4 space-y-2">
            <div className="text-[12.5px] font-bold text-slate-700 mb-1">{t('review.detailed_rating')}</div>
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

        <Button type="submit" block variant="primary" loading={loading}>
          {t('review.submit_review')}
        </Button>
      </form>
    </div>
  );
}
