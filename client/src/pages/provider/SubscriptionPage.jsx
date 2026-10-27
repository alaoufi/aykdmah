import { localizedJoinedName } from '../../utils/localizeJoined';
import { safeUrl } from '../../utils/urlSafety';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listPlans, subscribe, getCurrentSubscription, createPaymentSession } from '../../services/adminService';
import { formatCurrency } from '../../utils/formatters';
import { LoadingState } from '../../components/common/Spinner';
import Button from '../../components/common/Button';
import { apiError } from '../../services/api';
import { localizedName, localizedPlatformText } from '../../utils/localize';

export default function SubscriptionPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [plans, setPlans] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null);
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([listPlans(), getCurrentSubscription().catch(() => null)])
      .then(([p, c]) => { setPlans(p); setCurrent(c); })
      .catch(error => setMsg(apiError(error)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const onSubscribe = async (plan) => {
    if (working !== null) return;
    setWorking(plan.id);
    setMsg('');
    try {
      const sub = await subscribe(plan.id);
      if (Number(plan.price) === 0) {
        setMsg(t('subscription.free_activated'));
        load();
      } else {
        const session = await createPaymentSession({
          subscription_id: sub.id, amount: plan.price, payment_method: 'card',
        });
        const checkoutUrl = safeUrl(session.checkout_url);
        if (checkoutUrl) {
          window.location.href = checkoutUrl;
        } else {
          setMsg(t('subscription.created_complete_payment'));
          load();
        }
      }
    } catch (e) {
      setMsg(apiError(e));
    } finally { setWorking(null); }
  };

  if (loading) return <LoadingState />;

  return (
    <div>
      <h2 className="mb-4">{t('subscription.title')}</h2>

      {current && (
        <div className="card mb-4">
          <strong>{t('subscription.current')}:</strong> {localizedJoinedName(current, 'plan', i18n.resolvedLanguage)}
          {current.ends_at && <div className="text-sm text-muted">{t('subscription.ends_at')}: {new Date(current.ends_at).toLocaleDateString(lang)}</div>}
        </div>
      )}

      {msg && <div className="card mb-3"><p style={{ margin: 0 }}>{msg}</p></div>}

      <div className="grid grid-3">
        {plans.map(p => {
          const isCurrent = current && current.plan_id === p.id;
          const features = (() => {
            try { const parsed = typeof p.features === 'string' ? JSON.parse(p.features) : p.features; return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []; }
            catch { return []; }
          })();
          return (
            <div key={p.id} className={`plan-card ${p.is_featured ? 'featured' : ''}`}>
              {p.badge && <span className="plan-badge">{localizedPlatformText(p.badge, lang)}</span>}
              <h3>{localizedPlatformText(localizedName(p, lang), lang)}</h3>
              <div className="price">
                {Number(p.price) === 0 ? t('subscription.free') : (
                  <>
                    <span style={{ fontSize: 32, fontWeight: 800 }}>{formatCurrency(p.price)}</span>
                    <span className="text-sm text-muted">{t('subscription.per_days', { count: p.duration_days })}</span>
                  </>
                )}
              </div>
              <ul>
                {features.map((f, i) => <li key={i}>✓ {localizedPlatformText(f, lang)}</li>)}
              </ul>
              <Button
                block
                variant={p.is_featured ? 'primary' : 'outline'}
                disabled={isCurrent || working !== null}
                loading={working === p.id}
                onClick={() => onSubscribe(p)}
              >
                {isCurrent ? t('subscription.current_plan') : Number(p.price) === 0 ? t('subscription.start_free') : t('subscription.subscribe_now')}
              </Button>
            </div>
          );
        })}
      </div>

      <style>{`
        .plan-card {
          background: var(--bg-card); border: 2px solid var(--border);
          border-radius: var(--radius-lg); padding: 24px; position: relative;
          display: flex; flex-direction: column;
        }
        .plan-card.featured { border-color: var(--primary); box-shadow: var(--shadow); }
        .plan-badge {
          position: absolute; top: -12px; inset-inline-end: 16px;
          background: var(--primary); color: #fff; padding: 4px 14px;
          border-radius: 999px; font-size: 12px; font-weight: 700;
        }
        .plan-card .price { font-size: 20px; margin: 12px 0 16px; color: var(--primary); }
        .plan-card ul { list-style: none; padding: 0; margin: 0 0 20px; flex: 1; }
        .plan-card li { padding: 6px 0; color: var(--text-secondary); border-bottom: 1px dashed var(--border); }
      `}</style>
    </div>
  );
}
