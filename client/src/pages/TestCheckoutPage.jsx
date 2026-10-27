import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Button from '../components/common/Button';
import { LoadingState, ErrorState } from '../components/common/Spinner';
import { localizedName } from '../utils/localize';

// Test-mode checkout: stands in for the real gateway page so the whole subscription,
// activation and coupon-commission flow can be tried without any money moving.
export default function TestCheckoutPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/payments/test/${encodeURIComponent(id)}`)
      .then(({ data }) => setPayment(data.data))
      .catch(() => setError('test_checkout.not_found'));
  }, [id]);

  const finish = async action => {
    setBusy(true);
    try {
      await api.post(`/payments/test/${encodeURIComponent(id)}/${action}`);
      navigate('/provider/subscription', { replace: true, state: { notice: action === 'complete' ? 'test_checkout.paid' : 'test_checkout.cancelled' } });
    } catch (err) {
      setError(err?.response?.data?.message === 'payment_not_open' ? 'test_checkout.already_done' : 'test_checkout.failed');
      setBusy(false);
    }
  };

  if (error) return <div className="container py-6"><ErrorState message={t(error)} /></div>;
  if (!payment) return <LoadingState />;
  const plan = localizedName({ name_ar: payment.plan_name_ar, name_en: payment.plan_name_en }, i18n.resolvedLanguage);

  return (
    <div className="container py-6 max-w-md">
      <div className="card p-5 space-y-4 text-center">
        <div role="note" className="px-3 py-2 rounded-card bg-amber-100 text-amber-900 font-bold text-[14px]">
          🧪 {t('test_checkout.banner')}
        </div>
        <h1 className="text-xl font-extrabold text-fg">{t('test_checkout.title')}</h1>
        {plan && <div className="text-fg-muted">{plan}</div>}
        <div className="text-3xl font-extrabold text-fg">{t('wallet.amount', { value: Number(payment.amount).toFixed(2) })}</div>
        <p className="text-[13px] text-fg-muted">{t('test_checkout.explainer')}</p>
        {payment.status === 'processing' ? (
          <div className="flex gap-2 justify-center">
            <Button loading={busy} onClick={() => finish('complete')}>{t('test_checkout.pay')}</Button>
            <Button variant="outline" disabled={busy} onClick={() => finish('cancel')}>{t('test_checkout.cancel')}</Button>
          </div>
        ) : (
          <div className="text-[13px] text-fg-muted">{t('test_checkout.already_done')}</div>
        )}
      </div>
    </div>
  );
}
