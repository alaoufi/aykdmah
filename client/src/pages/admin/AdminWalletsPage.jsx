import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingState, ErrorState } from '../../components/common/Spinner';
import * as walletApi from '../../services/walletService';
import { formatRelativeTime } from '../../utils/formatters';

const money = value => Number(value || 0).toFixed(2);

export default function AdminWalletsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [settings, setSettings] = useState({ commission_percent: '', min_withdrawal: '' });
  const [ledger, setLedger] = useState(null);
  const [adjust, setAdjust] = useState({ amount: '', note: '' });

  const load = useCallback(() => {
    walletApi.adminWallets().then(result => {
      setData(result);
      setSettings({ commission_percent: String(result.commission_percent), min_withdrawal: String(result.min_withdrawal) });
    }).catch(() => setError('wallet.errors.load_failed'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (action, successKey) => {
    setNotice(null);
    try { await action(); setNotice({ ok: true, text: t(successKey) }); load(); if (ledger) openLedger(ledger.user); return true; }
    catch (err) { setNotice({ ok: false, text: walletApi.walletError(err, t) }); return false; }
  };
  const openLedger = async user => {
    try { setLedger({ user, rows: await walletApi.adminLedger(user.id) }); }
    catch (err) { setNotice({ ok: false, text: walletApi.walletError(err, t) }); }
  };

  if (error) return <ErrorState message={t(error)} />;
  if (!data) return <LoadingState />;
  const { totals } = data;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold text-fg">{t('wallet.admin.title')}</h1>
      {notice && <div role="status" className={`px-3 py-2 rounded-card text-[13px] ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{notice.text}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {[['liabilities', totals.liabilities], ['commissions', totals.commissions], ['withdrawn', totals.withdrawn],
          ['pending_withdrawals', totals.pending_withdrawals], ['gifted', totals.gifted]].map(([key, value]) => (
          <div key={key} className="card p-3">
            <div className="text-[11.5px] text-fg-muted">{t(`wallet.admin.${key}`)}</div>
            <div className="text-lg font-extrabold text-fg">{t('wallet.amount', { value: money(value) })}</div>
          </div>
        ))}
      </div>

      <form className="card p-3 flex flex-wrap items-end gap-3" onSubmit={e => {
        e.preventDefault();
        act(() => walletApi.adminWalletSettings({ commission_percent: settings.commission_percent, min_withdrawal: settings.min_withdrawal }), 'wallet.admin.settings_saved');
      }}>
        <label className="text-[13px]">{t('wallet.admin.commission_percent')}
          <input className="input w-28 block" type="number" min="0" max="100" step="0.01" required value={settings.commission_percent}
            onChange={e => setSettings({ ...settings, commission_percent: e.target.value })} />
        </label>
        <label className="text-[13px]">{t('wallet.admin.min_withdrawal')}
          <input className="input w-28 block" type="number" min="0" step="0.01" required value={settings.min_withdrawal}
            onChange={e => setSettings({ ...settings, min_withdrawal: e.target.value })} />
        </label>
        <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        <p className="text-[12px] text-fg-subtle w-full">{t('wallet.admin.settings_hint')}</p>
      </form>

      <div className="card p-3 overflow-x-auto">
        <h2 className="font-bold text-fg mb-2">{t('wallet.admin.withdrawals')}</h2>
        {data.withdrawals.length === 0 ? <div className="text-[13px] text-fg-muted">{t('wallet.admin.none')}</div> : (
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-fg-muted">
              <th className="text-start p-1">#</th><th className="text-start p-1">{t('wallet.admin.user')}</th>
              <th className="text-start p-1">{t('wallet.amount_label')}</th><th className="text-start p-1">{t('wallet.iban')}</th>
              <th className="text-start p-1">{t('wallet.admin.status')}</th><th className="text-start p-1" />
            </tr></thead>
            <tbody>
              {data.withdrawals.map(w => (
                <tr key={w.id} className="border-t border-border align-top">
                  <td className="p-1">{w.id}</td>
                  <td className="p-1">{w.full_name}<div className="text-fg-subtle" dir="ltr">{w.phone}</div></td>
                  <td className="p-1 font-bold">{money(w.amount)}</td>
                  <td className="p-1" dir="ltr">{w.iban}<div className="text-fg-subtle" dir="auto">{w.account_name}</div></td>
                  <td className="p-1">{t(`wallet.withdrawal_status.${w.status}`)}{w.transfer_reference ? ` · ${w.transfer_reference}` : ''}
                    <div className="text-fg-subtle">{formatRelativeTime(w.created_at)}</div></td>
                  <td className="p-1 whitespace-nowrap">
                    {w.status === 'pending' && (
                      <>
                        <button type="button" className="btn btn-primary btn-sm me-1" onClick={() => {
                          const reference = window.prompt(t('wallet.admin.reference_prompt'));
                          if (reference) act(() => walletApi.adminProcessWithdrawal(w.id, { action: 'paid', transfer_reference: reference }), 'wallet.admin.marked_paid');
                        }}>{t('wallet.admin.mark_paid')}</button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => {
                          const note = window.prompt(t('wallet.admin.reject_prompt'));
                          if (note !== null) act(() => walletApi.adminProcessWithdrawal(w.id, { action: 'rejected', note }), 'wallet.admin.rejected');
                        }}>{t('wallet.admin.reject')}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card p-3 overflow-x-auto">
        <h2 className="font-bold text-fg mb-2">{t('wallet.admin.wallets')}</h2>
        {data.wallets.length === 0 ? <div className="text-[13px] text-fg-muted">{t('wallet.admin.none')}</div> : (
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-fg-muted">
              <th className="text-start p-1">{t('wallet.admin.user')}</th><th className="text-start p-1">{t('wallet.coupon_code')}</th>
              <th className="text-start p-1">{t('wallet.balance')}</th><th className="text-start p-1">{t('wallet.earned')}</th>
              <th className="text-start p-1">{t('wallet.referrals')}</th><th className="text-start p-1" />
            </tr></thead>
            <tbody>
              {data.wallets.map(w => (
                <tr key={w.id} className="border-t border-border">
                  <td className="p-1">{w.full_name}</td><td className="p-1" dir="ltr">{w.referral_code}</td>
                  <td className="p-1 font-bold">{money(w.balance)}</td><td className="p-1">{money(w.earned)}</td>
                  <td className="p-1">{w.referrals}</td>
                  <td className="p-1"><button type="button" className="btn btn-outline btn-sm" onClick={() => openLedger(w)}>{t('wallet.admin.ledger')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {ledger && (
        <div className="card p-3 space-y-2">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-fg">{t('wallet.admin.ledger_of', { name: ledger.user.full_name })}</h2>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setLedger(null)}>{t('common.close')}</button>
          </div>
          <ul className="text-[12.5px] space-y-1 max-h-80 overflow-auto">
            {ledger.rows.map(row => (
              <li key={row.id} className="flex justify-between gap-2 border-b border-border pb-1">
                <span>#{row.id} · {t(`wallet.tx.${row.type}`)} · {t(`wallet.tx_status.${row.status}`)}{row.related_name ? ` · ${row.related_name}` : ''}{row.note ? ` · ${row.note}` : ''}</span>
                <span dir="ltr" className="font-bold">{Number(row.amount) >= 0 ? '+' : ''}{money(row.amount)}</span>
              </li>
            ))}
          </ul>
          <form className="flex flex-wrap gap-2 items-end" onSubmit={e => {
            e.preventDefault();
            act(() => walletApi.adminAdjust(ledger.user.id, adjust), 'wallet.admin.adjusted').then(ok => ok && setAdjust({ amount: '', note: '' }));
          }}>
            <label className="text-[12.5px]">{t('wallet.admin.adjust_amount')}
              <input className="input w-32 block" dir="ltr" required value={adjust.amount} placeholder="-10.00 / 10.00" onChange={e => setAdjust({ ...adjust, amount: e.target.value })} />
            </label>
            <label className="text-[12.5px] flex-1 min-w-[180px]">{t('wallet.admin.adjust_note')}
              <input className="input block w-full" required minLength={5} maxLength={500} value={adjust.note} onChange={e => setAdjust({ ...adjust, note: e.target.value })} />
            </label>
            <button type="submit" className="btn btn-primary btn-sm">{t('wallet.admin.adjust')}</button>
          </form>
        </div>
      )}

      <div className="card p-3 overflow-x-auto">
        <h2 className="font-bold text-fg mb-2">{t('wallet.admin.rewards')}</h2>
        {data.rewards.length === 0 ? <div className="text-[13px] text-fg-muted">{t('wallet.admin.none')}</div> : (
          <ul className="text-[12.5px] space-y-1">
            {data.rewards.map(r => (
              <li key={r.id}>{r.referrer_name} ← {r.referred_name}: {money(r.amount)} ({r.percent}% × {money(r.payment_amount)}) · {formatRelativeTime(r.created_at)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
