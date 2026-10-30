import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { proposeWarranty, acceptWarranty } from '../../services/requestService';
import { apiError } from '../../services/api';
import Button from '../common/Button';

// "Review and warranty" (AYK-081): after a request ends its two sides can still write for
// the market's days or the warranty they agreed on (one proposes, the other accepts).
export default function WarrantyBox({ request, userId, onChange }) {
  const { t, i18n } = useTranslation();
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async action => {
    setBusy(true); setErr('');
    try { await action(); setDays(''); await onChange(); } catch (e) { setErr(apiError(e)); } finally { setBusy(false); }
  };
  const until = request.contact_until ? new Date(request.contact_until) : null;
  const closed = until && until.getTime() < Date.now();
  const canAgree = ['assigned', 'in_progress', 'completed'].includes(request.status) && !closed;
  const proposedByMe = Number(request.warranty_proposed_by) === Number(userId);
  return (
    <div className="card mb-4" data-testid="warranty-box" style={{ borderInlineStart: '4px solid var(--primary)' }}>
      <strong>🛡️ {t('request.warranty_title')}</strong>
      <p className="text-sm text-muted mt-1 mb-2">{t('request.contact_days', { days: request.contact_days || 7 })}</p>
      {Number(request.warranty_days) > 0 && <p className="text-sm font-semibold mb-2">✅ {t('request.warranty_agreed', { days: request.warranty_days })}</p>}
      {until && <p className="text-sm font-semibold mb-2" data-testid="contact-until">
        {closed ? t('request.contact_closed') : t('request.contact_until', { date: until.toLocaleDateString(i18n.resolvedLanguage || 'ar') })}</p>}
      {canAgree && request.warranty_proposed_days && (proposedByMe
        ? <p className="text-sm text-muted mb-2">⏳ {t('request.warranty_waiting', { days: request.warranty_proposed_days })}</p>
        : <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-sm font-semibold">{t('request.warranty_offer', { days: request.warranty_proposed_days })}</span>
          <Button variant="primary" size="sm" loading={busy} onClick={() => run(() => acceptWarranty(request.id))} data-testid="warranty-accept">✔ {t('request.warranty_accept')}</Button>
        </div>)}
      {canAgree && (
        <div className="flex items-center gap-2 flex-wrap">
          <input type="number" min="1" max="365" inputMode="numeric" className="input" style={{ width: 110 }} value={days}
            onChange={e => setDays(e.target.value)} placeholder={t('request.warranty_days_label')} aria-label={t('request.warranty_days_label')} data-testid="warranty-days" />
          <Button variant="outline" size="sm" loading={busy} disabled={!(Number(days) >= 1 && Number(days) <= 365)}
            onClick={() => run(() => proposeWarranty(request.id, Number(days)))} data-testid="warranty-propose">{t('request.warranty_propose')}</Button>
        </div>
      )}
      {err && <p role="alert" className="form-error mt-2 mb-0">{err}</p>}
    </div>
  );
}
