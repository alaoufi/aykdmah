import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import PasswordInput from '../../components/common/PasswordInput';
import { LoadingState, ErrorState } from '../../components/common/Spinner';
import { listPlans } from '../../services/adminService';
import * as walletApi from '../../services/walletService';
import { formatRelativeTime } from '../../utils/formatters';
import { localizedName } from '../../utils/localize';

const sar = (value, t) => t('wallet.amount', { value: Number(value || 0).toFixed(2) });

function Stat({ label, value }) {
  return (
    <div className="card p-3">
      <div className="text-[12px] text-fg-muted">{label}</div>
      <div className="text-xl font-extrabold text-fg">{value}</div>
    </div>
  );
}

export default function WalletPage() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [withdraw, setWithdraw] = useState({ amount: '', iban: '', account_name: '', password: '' });
  const [gift, setGift] = useState({ recipient: '', plan_id: '', password: '' });
  const [giftPreview, setGiftPreview] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    walletApi.getWallet().then(setData).catch(() => setLoadError('wallet.errors.load_failed'));
  }, []);
  useEffect(() => { load(); listPlans().then(rows => setPlans(rows.filter(p => Number(p.price) > 0))).catch(() => {}); }, [load]);

  const run = async (action, successKey, reset) => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ ok: true, text: t(successKey) });
      reset?.();
      load();
    } catch (err) {
      setNotice({ ok: false, text: walletApi.walletError(err, t) });
    } finally { setBusy(false); }
  };

  if (loadError) return <ErrorState message={t(loadError)} />;
  if (!data) return <LoadingState />;

  const shareText = t('wallet.share_text', { code: data.referral_code, url: `https://aykdmh.com/register?role=provider&ref=${data.referral_code}` });
  const copy = async () => {
    try { await navigator.clipboard.writeText(data.referral_code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (_) { /* clipboard blocked */ }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-extrabold text-fg">{t('wallet.title')}</h1>
      {data.test_mode && (
        <div role="note" className="px-3 py-2 rounded-card bg-amber-100 text-amber-900 text-[13px]">🧪 {t('wallet.test_mode')}</div>
      )}
      {notice && <div role="status" className={`px-3 py-2 rounded-card text-[13px] ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{notice.text}</div>}

      <div className="card p-4 space-y-2">
        <div className="text-[13px] text-fg-muted">{t('wallet.your_coupon')}</div>
        <div className="flex items-center gap-3 flex-wrap">
          <span dir="ltr" className="text-3xl font-extrabold tracking-widest text-fg">{data.referral_code}</span>
          <Button variant="outline" size="sm" onClick={copy}>{copied ? t('wallet.copied') : t('wallet.copy')}</Button>
          <a className="btn btn-outline btn-sm" target="_blank" rel="noopener noreferrer"
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}>{t('wallet.share_whatsapp')}</a>
        </div>
        <p className="text-[12.5px] text-fg-muted">
          {data.commission_percent > 0 ? t('wallet.coupon_explainer', { percent: data.commission_percent }) : t('wallet.coupon_inactive')}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label={t('wallet.balance')} value={sar(data.balance, t)} />
        <Stat label={t('wallet.pending_withdrawals')} value={sar(data.pending_withdrawals, t)} />
        <Stat label={t('wallet.earned')} value={sar(data.earned, t)} />
        <Stat label={t('wallet.referrals')} value={`${data.referrals.paid} / ${data.referrals.total}`} />
      </div>

      {data.can_apply_coupon && (
        <form className="card p-4 space-y-2" onSubmit={e => { e.preventDefault(); run(() => walletApi.applyCoupon(coupon), 'wallet.coupon_applied', () => setCoupon('')); }}>
          <h2 className="font-bold text-fg">{t('wallet.apply_coupon_title')}</h2>
          <p className="text-[12.5px] text-fg-muted">{t('wallet.apply_coupon_hint')}</p>
          <div className="flex gap-2">
            <input className="input flex-1" dir="ltr" value={coupon} maxLength={12} onChange={e => setCoupon(e.target.value)}
              placeholder="AB12" aria-label={t('wallet.coupon_code')} />
            <Button type="submit" loading={busy} disabled={coupon.trim().length < 4}>{t('wallet.apply')}</Button>
          </div>
        </form>
      )}

      <form className="card p-4 space-y-2" onSubmit={e => {
        e.preventDefault();
        run(() => walletApi.requestWithdrawal(withdraw), 'wallet.withdrawal_requested', () => setWithdraw({ amount: '', iban: '', account_name: '', password: '' }));
      }}>
        <h2 className="font-bold text-fg">{t('wallet.withdraw_title')}</h2>
        <p className="text-[12.5px] text-fg-muted">{t('wallet.withdraw_hint', { min: data.min_withdrawal })}</p>
        <Input label={t('wallet.amount_label')} type="number" min="0" step="0.01" required value={withdraw.amount}
          onChange={e => setWithdraw({ ...withdraw, amount: e.target.value })} />
        <Input label={t('wallet.iban')} dir="ltr" required value={withdraw.iban} placeholder="SA00 0000 0000 0000 0000 0000" maxLength={34}
          onChange={e => setWithdraw({ ...withdraw, iban: e.target.value })} />
        <Input label={t('wallet.account_name')} required value={withdraw.account_name} maxLength={150}
          onChange={e => setWithdraw({ ...withdraw, account_name: e.target.value })} />
        <PasswordInput label={t('wallet.confirm_password')} required autoComplete="current-password" value={withdraw.password}
          onChange={e => setWithdraw({ ...withdraw, password: e.target.value })} />
        <Button type="submit" loading={busy}>{t('wallet.request_withdrawal')}</Button>
      </form>

      <form className="card p-4 space-y-2" onSubmit={async e => {
        e.preventDefault();
        if (!giftPreview) {
          setBusy(true); setNotice(null);
          try { setGiftPreview(await walletApi.previewGift(gift)); }
          catch (err) { setNotice({ ok: false, text: walletApi.walletError(err, t) }); }
          finally { setBusy(false); }
          return;
        }
        run(() => walletApi.giftSubscription(gift), 'wallet.gift_done', () => { setGift({ recipient: '', plan_id: '', password: '' }); setGiftPreview(null); });
      }}>
        <h2 className="font-bold text-fg">{t('wallet.gift_title')}</h2>
        <p className="text-[12.5px] text-fg-muted">{t('wallet.gift_hint')}</p>
        <Input label={t('wallet.recipient')} required value={gift.recipient} disabled={!!giftPreview}
          placeholder={t('wallet.recipient_placeholder')} onChange={e => setGift({ ...gift, recipient: e.target.value })} />
        <label className="form-label" htmlFor="gift-plan">{t('wallet.plan')}</label>
        <select id="gift-plan" className="select" required value={gift.plan_id} disabled={!!giftPreview}
          onChange={e => setGift({ ...gift, plan_id: e.target.value })}>
          <option value="">{t('common.select')}</option>
          {plans.map(p => <option key={p.id} value={p.id}>{localizedName({ name_ar: p.name_ar, name_en: p.name_en }, i18n.resolvedLanguage)} — {sar(p.price, t)}</option>)}
        </select>
        {giftPreview && (
          <div className="px-3 py-2 rounded-card bg-info-soft text-info text-[13px]">
            {t('wallet.gift_confirm', { name: giftPreview.recipient.full_name, amount: Number(giftPreview.plan.price).toFixed(2) })}
          </div>
        )}
        {giftPreview && (
          <PasswordInput label={t('wallet.confirm_password')} required autoComplete="current-password" value={gift.password}
            onChange={e => setGift({ ...gift, password: e.target.value })} />
        )}
        <div className="flex gap-2">
          <Button type="submit" loading={busy}>{giftPreview ? t('wallet.gift_pay') : t('wallet.gift_check')}</Button>
          {giftPreview && <Button type="button" variant="outline" onClick={() => { setGiftPreview(null); setGift({ ...gift, password: '' }); }}>{t('wallet.change')}</Button>}
        </div>
      </form>

      {data.withdrawals.length > 0 && (
        <div className="card p-4">
          <h2 className="font-bold text-fg mb-2">{t('wallet.withdrawals')}</h2>
          <ul className="space-y-2 text-[13px]">
            {data.withdrawals.map(w => (
              <li key={w.id} className="flex flex-wrap justify-between gap-2 border-b border-border pb-2">
                <span>{sar(w.amount, t)} · {t(`wallet.withdrawal_status.${w.status}`)} · <span dir="ltr">****{w.iban_last4}</span>
                  {w.transfer_reference ? ` · ${t('wallet.reference')}: ${w.transfer_reference}` : ''}</span>
                <span className="text-fg-subtle">{formatRelativeTime(w.created_at)}
                  {w.status === 'pending' && (
                    <button type="button" className="ms-2 underline" disabled={busy}
                      onClick={() => run(() => walletApi.cancelWithdrawal(w.id), 'wallet.withdrawal_cancelled')}>{t('wallet.cancel')}</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-4">
        <h2 className="font-bold text-fg mb-2">{t('wallet.history')}</h2>
        {data.transactions.length === 0 ? <div className="text-[13px] text-fg-muted">{t('wallet.no_history')}</div> : (
          <ul className="space-y-2 text-[13px]">
            {data.transactions.map(tx => (
              <li key={tx.id} className="flex flex-wrap justify-between gap-2 border-b border-border pb-2">
                <span>
                  {t(`wallet.tx.${tx.type}`)}{tx.related_name ? ` · ${tx.related_name}` : ''}
                  {tx.status !== 'completed' ? ` · ${t(`wallet.tx_status.${tx.status}`)}` : ''}
                </span>
                <span dir="ltr" className={Number(tx.amount) >= 0 ? 'text-emerald-700 font-bold' : 'text-fg font-bold'}>
                  {Number(tx.amount) >= 0 ? '+' : ''}{Number(tx.amount).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
