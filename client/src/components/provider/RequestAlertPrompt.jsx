import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { updateProfile } from '../../services/authService';
import { showProblem } from '../common/AppDialog';

// AYK-443 (the owner: «إذا لم يوجد طلبات جديدة لمقدم الخدمة: لا يوجد طلبات جديدة لمهنتك في نطاقك، هل
// ترغب في تذكيرك إذا توفر طلب مناسب لك؟»). Yes: every new request in his profession and area reaches
// him as a notice, even outside his working hours, saying how to reach the requester. Once on, a
// short line says so, with a way to stop it.
export default function RequestAlertPrompt({ noneForMe }) {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const on = Number(user?.request_alerts) === 1;
  const set = async value => {
    setBusy(true);
    try { await updateProfile({ request_alerts: value }); await refresh(); } catch (err) { showProblem(err); } finally { setBusy(false); }
  };
  if (on) {
    return (
      <div className="flex items-center justify-between gap-2 flex-wrap rounded-card bg-success-soft text-success px-3 py-2 mb-3 text-[12.5px]" role="status" data-testid="request-alerts-on">
        <span className="min-w-0">🔔 {t('work.alerts_on')}</span>
        <button type="button" className="btn btn-outline btn-sm shrink-0" disabled={busy} onClick={() => set(0)} data-testid="request-alerts-stop">{t('work.alerts_stop')}</button>
      </div>
    );
  }
  if (!noneForMe) return null;
  return (
    <div className="rounded-card border border-primary/40 bg-primary-soft/40 p-3 mb-3" data-testid="request-alerts-ask">
      <p className="text-[14px] font-extrabold text-fg m-0">🔕 {t('work.alerts_none')}</p>
      <p className="text-[13px] text-fg mt-1 mb-2">{t('work.alerts_ask')}</p>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => set(1)} data-testid="request-alerts-yes">🔔 {t('work.alerts_yes')}</button>
    </div>
  );
}
