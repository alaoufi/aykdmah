import { useAdminConfirmation } from '../../components/admin/confirmAdminChange';
import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingState, ErrorState } from '../../components/common/Spinner';
import * as walletApi from '../../services/walletService';
import { formatRelativeTime } from '../../utils/formatters';
import { askText } from '../../components/common/AppDialog';
import { InfoButton, InfoPanel } from '../../components/common/InfoTip';

const money = value => Number(value || 0).toFixed(2);

// AYK-415: a field's name with (i) beside it, a short line under it, and the full explanation
// in place. `label` may hold the field itself (a checkbox) when there is no `htmlFor`.
function HelpLabel({ htmlFor, label, short, info, className = 'text-[12.5px] font-semibold text-fg' }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div>
      <span className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className={className}>{label}</label>
        {info && <InfoButton open={open} onToggle={() => setOpen(v => !v)} controls={panelId} label={typeof label === 'string' ? label : ''} />}
      </span>
      {short && <div className="text-[12px] text-slate-500 mt-0.5 leading-snug" data-testid="field-short">{short}</div>}
      <InfoPanel id={panelId} open={open}>{info}</InfoPanel>
    </div>
  );
}

// What each choice and number on this page does (traced to server/services/walletService.js).
const MODE_HELP = {
  count: 'يستحق المسوّق مبلغًا ثابتًا عن كل مقدم خدمة سجّل بكوده، بعد بلوغ الحد الأدنى.',
  subscription: 'يستحق المسوّق مبلغًا ثابتًا مرة واحدة عن كل من سجّل بكوده ثم دفع اشتراكًا وتفعّل.',
  percent: 'يستحق المسوّق نسبة من أول دفعة إلكترونية يدفعها من سجّل بكوده.',
};

export default function AdminWalletsPage() {
  const { t } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [settings, setSettings] = useState({ commission_percent: '', min_withdrawal: '' });
  // AYK-322: marketing by commission (on/off, the way a marketer earns, and its numbers).
  const [marketing, setMarketing] = useState({ enabled: false, mode: 'percent', count_every: '10', count_amount: '0', subscription_amount: '0' });
  const [cash, setCash] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [adjust, setAdjust] = useState({ amount: '', note: '' });

  const load = useCallback(() => {
    walletApi.adminWallets().then(result => {
      setData(result);
      setSettings({ commission_percent: String(result.commission_percent), min_withdrawal: String(result.min_withdrawal) });
      const m = result.marketing || {};
      setMarketing({ enabled: !!m.enabled, mode: m.mode || 'percent', count_every: String(m.count_every || 10),
        count_amount: String(m.count_amount ?? 0), subscription_amount: String(m.subscription_amount ?? 0) });
    }).catch(() => setError('wallet.errors.load_failed'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (action, successKey) => {
    if (!(await confirmAdminChange(t))) return;
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
      {data.test_mode && (
        <div role="note" className="px-3 py-2 rounded-card bg-amber-100 text-amber-900 text-[13px]">🧪 {t('wallet.admin.test_mode')}</div>
      )}
      {notice && <div role="status" className={`px-3 py-2 rounded-card text-[13px] ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{notice.text}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        {[['liabilities', totals.liabilities], ['commissions', totals.commissions], ['withdrawn', totals.withdrawn],
          ['pending_withdrawals', totals.pending_withdrawals], ['gifted', totals.gifted], ['cash_total', totals.cash_paid]].map(([key, value]) => (
          <div key={key} className="card p-3">
            <div className="text-[11.5px] text-fg-muted">{t(key === 'cash_total' ? 'wallet.admin_marketing.cash_total' : `wallet.admin.${key}`)}</div>
            <div className="text-lg font-extrabold text-fg">{t('wallet.amount', { value: money(value) })}</div>
          </div>
        ))}
      </div>

      <form className="card p-3 space-y-3" data-testid="marketing-settings" onSubmit={e => {
        e.preventDefault();
        act(() => walletApi.adminWalletSettings({ marketing_enabled: marketing.enabled, marketing_mode: marketing.mode,
          count_every: Number(marketing.count_every), count_amount: marketing.count_amount, subscription_amount: marketing.subscription_amount,
          commission_percent: settings.commission_percent }), 'wallet.admin_marketing.saved');
      }}>
        <h2 className="font-bold text-fg">📣 {t('wallet.admin_marketing.title')}</h2>
        <HelpLabel className="flex items-center gap-2 text-[14px] font-bold cursor-pointer"
          label={<><input type="checkbox" checked={marketing.enabled} data-testid="marketing-enabled"
            onChange={e => setMarketing({ ...marketing, enabled: e.target.checked })} />
          {t('wallet.admin_marketing.enabled')}</>}
          short="يشغّل احتساب مكافآت المسوّقين أو يوقفه، ولا يمس الأرصدة السابقة."
          info={'عند التشغيل تُضاف مكافأة إلى رصيد صاحب الكود كلما تحقق شرط الطريقة المختارة أدناه.\nعند الإيقاف لا تُحسب أي مكافأة جديدة، وما في أرصدة المسوّقين يبقى لهم كما هو.\nالحفظ يتم بزر «حفظ» أسفل هذا القسم.'} />
        {!marketing.enabled && <p className="text-[12.5px] text-amber-800 bg-amber-50 rounded-card px-3 py-2 m-0">{t('wallet.admin_marketing.disabled_note')}</p>}
        <fieldset className="space-y-2">
          <legend className="sr-only">{t('wallet.admin_marketing.mode')}</legend>
          <HelpLabel className="text-[13px] font-bold text-fg" label={t('wallet.admin_marketing.mode')}
            short="اختر طريقة واحدة يكسب بها صاحب الكود؛ تعمل الطريقة المختارة وحدها."
            info={'تعمل طريقة واحدة فقط في كل وقت، والمكافأة تُضاف إلى رصيد صاحب الكود (المسوّق).\n• بالعدد: مبلغ ثابت عن كل مقدم خدمة سجّل بكوده واختار خدماته، بعد بلوغ الحد الأدنى. لا علاقة لها بالدفع.\n• بالاشتراك: مبلغ ثابت مرة واحدة عن كل من سجّل بكوده ودفع اشتراكًا وتفعّل، لا عن التجديد.\n• بالنسبة: نسبة من أول دفعة إلكترونية فقط للمسجَّل بكوده، ولا تتكرر.\nالدفع من رصيد المحفظة لا يمنح أي عمولة.'} />
          {['count', 'subscription', 'percent'].map(mode => (
            <div key={mode} className="flex items-start gap-2 text-[13px]">
              <input type="radio" id={`marketing-mode-${mode}`} name="marketing-mode" className="mt-1" checked={marketing.mode === mode} data-testid={`marketing-mode-${mode}`}
                onChange={() => setMarketing({ ...marketing, mode })} />
              <div className="flex-1">
                <label htmlFor={`marketing-mode-${mode}`} className="cursor-pointer">{t(`wallet.admin_marketing.mode_${mode}`)}</label>
                <div className="text-[12px] text-slate-500 mt-0.5 leading-snug" data-testid="field-short">{MODE_HELP[mode]}</div>
                {marketing.mode === mode && (
                  <div className="flex flex-wrap gap-3 mt-1">
                    {mode === 'count' && <>
                      <div className="text-[12.5px] max-w-[260px]">
                        <HelpLabel htmlFor="marketing-count-every" label={t('wallet.admin_marketing.count_every')}
                          short="أقل عدد مقدمي خدمة يسجّلون بكوده قبل أن يستحق أي مبلغ."
                          info={'عدد صحيح من 1 إلى 10000.\nقبل بلوغه لا يستحق المسوّق شيئًا، وعند بلوغه يستحق المبلغ عن كل واحد منهم دفعة واحدة، ثم عن كل من يأتي بعدهم.\nمثال: الحد 10 والمبلغ 5 ريالات: عند العاشر يُضاف 50 ريالًا، والحادي عشر يضيف 5.\nيُحسب مقدم الخدمة الذي حسابه نشط وغير محظور واختار خدماته.'} />
                        <input id="marketing-count-every" className="input w-28 block" type="number" min="1" max="10000" step="1" required value={marketing.count_every}
                          onChange={e => setMarketing({ ...marketing, count_every: e.target.value })} />
                      </div>
                      <div className="text-[12.5px] max-w-[260px]">
                        <HelpLabel htmlFor="marketing-count-amount" label={t('wallet.admin_marketing.count_amount')}
                          short="ما يُضاف لرصيد المسوّق عن كل مقدم خدمة محسوب، بالريال."
                          info={'بالريال، من 0 إلى 100000، ويقبل هللات (مثل 2.50).\nيُضاف إلى رصيد المسوّق ويظهر في «كشف المسوّقين»، ويُسلَّم نقدًا أو بتحويل.\nإن تركته صفرًا فلن يُحسب شيء في هذه الطريقة.'} />
                        <input id="marketing-count-amount" className="input w-28 block" type="number" min="0" step="0.01" required value={marketing.count_amount}
                          onChange={e => setMarketing({ ...marketing, count_amount: e.target.value })} />
                      </div>
                    </>}
                    {mode === 'subscription' && (
                      <div className="text-[12.5px] max-w-[260px]">
                        <HelpLabel htmlFor="marketing-subscription-amount" label={t('wallet.admin_marketing.subscription_amount')}
                          short="مبلغ ثابت مرة واحدة عن كل من دفع اشتراكه وتفعّل، بالريال."
                          info={'بالريال، من 0 إلى 100000.\nيُضاف إلى رصيد صاحب الكود بعد اكتمال الدفع الإلكتروني وتفعيل الاشتراك، مرة واحدة فقط عن كل مشترك، ولا يتكرر مع التجديد.\nمثال: 20 تعني 20 ريالًا عن كل مشترك جديد.\nإن تركته صفرًا فلن يُحسب شيء.'} />
                        <input id="marketing-subscription-amount" className="input w-28 block" type="number" min="0" step="0.01" required value={marketing.subscription_amount}
                          onChange={e => setMarketing({ ...marketing, subscription_amount: e.target.value })} />
                      </div>
                    )}
                    {mode === 'percent' && (
                      <div className="text-[12.5px] max-w-[260px]">
                        <HelpLabel htmlFor="marketing-commission-percent" label={t('wallet.admin.commission_percent')}
                          short="النسبة المئوية من أول دفعة للمسجَّل بكوده، من 0 إلى 100."
                          info={'نسبة مئوية من 0 إلى 100، وتقبل كسورًا (مثل 7.5).\nتُحسب على أول دفعة إلكترونية مكتملة للمسجَّل الجديد فقط، مرة واحدة، وتُضاف لرصيد صاحب الكود.\nمثال: 10 ودفعة 200 ريال تعني 20 ريالًا.\nصفر يعني لا عمولة.'} />
                        <input id="marketing-commission-percent" className="input w-28 block" type="number" min="0" max="100" step="0.01" required value={settings.commission_percent}
                          onChange={e => setSettings({ ...settings, commission_percent: e.target.value })} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </fieldset>
        <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        <p className="text-[12px] text-fg-subtle m-0">{t('wallet.admin_marketing.hint')}</p>
      </form>

      <div className="card p-3 overflow-x-auto" data-testid="marketers-statement">
        <h2 className="font-bold text-fg mb-2">🧾 {t('wallet.admin_marketing.statement')}</h2>
        {(data.marketers || []).length === 0 ? <div className="text-[13px] text-fg-muted">{t('wallet.admin_marketing.none')}</div> : (
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-fg-muted">
              {['marketer', 'signups', 'providers', 'subscribers', 'earned', 'paid_out', 'remaining'].map(key => (
                <th key={key} className="text-start p-1">{t(`wallet.admin_marketing.${key}`)}</th>))}
              <th className="p-1" />
            </tr></thead>
            <tbody>
              {data.marketers.map(m => (
                <tr key={m.id} className="border-t border-border">
                  <td className="p-1">{m.full_name} <span dir="ltr" className="text-fg-subtle">{m.referral_code}</span><div className="text-fg-subtle" dir="ltr">{m.phone}</div></td>
                  <td className="p-1">{m.referrals}</td><td className="p-1">{m.providers}</td><td className="p-1">{m.paid_subscribers}</td>
                  <td className="p-1">{money(m.earned)}</td><td className="p-1">{money(m.paid_out)}</td>
                  <td className="p-1 font-bold">{money(m.balance)}</td>
                  <td className="p-1 whitespace-nowrap">
                    <button type="button" className="btn btn-outline btn-sm me-1" onClick={() => openLedger(m)}>{t('wallet.admin.ledger')}</button>
                    {m.balance > 0 && <button type="button" className="btn btn-primary btn-sm" data-testid="cash-payout"
                      onClick={() => setCash({ user: m, amount: money(m.balance), note: '' })}>💵 {t('wallet.admin_marketing.cash')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {cash && (
          <form className="mt-3 p-3 rounded-card border border-border flex flex-wrap gap-2 items-end" data-testid="cash-form" onSubmit={e => {
            e.preventDefault();
            act(() => walletApi.adminCashPayout(cash.user.id, { amount: cash.amount, note: cash.note }), 'wallet.admin_marketing.cash_done').then(ok => ok && setCash(null));
          }}>
            <div className="w-full font-bold text-[13px]">{t('wallet.admin_marketing.cash_title')}: {cash.user.full_name}</div>
            <div className="text-[12.5px] max-w-[260px]">
              <HelpLabel htmlFor="cash-amount" label={t('wallet.admin_marketing.cash_amount')}
                short="ما سلّمته له يدًا بيد، ويُخصم من رصيده. لا يزيد عن رصيده."
                info={'بالريال، أكبر من صفر ولا يزيد عن رصيد المسوّق الحالي.\nلا يحوّل أي مال، بل يسجّل أنك سلّمته المبلغ نقدًا ويخصمه من رصيده، ويصله إشعار بذلك.\nمثال: رصيده 50 وسلّمته 30، فيبقى له 20.'} />
              <input id="cash-amount" className="input w-32 block" dir="ltr" type="number" min="0.01" step="0.01" max={cash.user.balance} required value={cash.amount}
                onChange={e => setCash({ ...cash, amount: e.target.value })} />
            </div>
            <div className="text-[12.5px] flex-1 min-w-[200px]">
              <HelpLabel htmlFor="cash-note" label={t('wallet.admin_marketing.cash_note')}
                short="سطر يشرح التسليم، يُحفظ في سجل رصيده. خمسة أحرف على الأقل."
                info={'مطلوب، من 5 إلى 500 حرف.\nيُحفظ مع العملية في سجل رصيد المسوّق ليُعرف لاحقًا متى وأين ومن سلّم.\nمثال: «سُلّم في المكتب يوم الأحد، استلمه بنفسه».'} />
              <input id="cash-note" className="input block w-full" required minLength={5} maxLength={500} value={cash.note} onChange={e => setCash({ ...cash, note: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-primary btn-sm">{t('common.save')}</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setCash(null)}>{t('common.cancel')}</button>
          </form>
        )}
      </div>

      <form className="card p-3 flex flex-wrap items-end gap-3" onSubmit={e => {
        e.preventDefault();
        act(() => walletApi.adminWalletSettings({ min_withdrawal: settings.min_withdrawal }), 'wallet.admin.settings_saved');
      }}>
        <div className="text-[13px] max-w-[320px]">
          <HelpLabel htmlFor="min-withdrawal" className="text-[13px] font-semibold text-fg" label={t('wallet.admin.min_withdrawal')}
            short="أقل مبلغ يقبل طلب سحبه من الرصيد إلى حساب بنكي، بالريال."
            info={'بالريال، صفر أو أكثر.\nإذا طلب صاحب رصيد سحب مبلغ أقل من هذا يُرفض طلبه وتظهر له رسالة، ويُعرض له هذا الحد في صفحة محفظته.\nمثال: 50 تعني لا سحب لأقل من 50 ريالًا.\nصفر يعني بلا حد أدنى.'} />
          <input id="min-withdrawal" className="input w-28 block" type="number" min="0" step="0.01" required value={settings.min_withdrawal}
            onChange={e => setSettings({ ...settings, min_withdrawal: e.target.value })} />
        </div>
        <button type="submit" className="btn btn-primary">{t('common.save')}</button>
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
                        <button type="button" className="btn btn-primary btn-sm me-1" onClick={async () => {
                          const reference = await askText({ title: t('wallet.admin.mark_paid'), message: t('wallet.admin.reference_prompt'), required: true, maxLength: 120 });
                          if (reference) act(() => walletApi.adminProcessWithdrawal(w.id, { action: 'paid', transfer_reference: reference }), 'wallet.admin.marked_paid');
                        }}>{t('wallet.admin.mark_paid')}</button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={async () => {
                          const note = await askText({ title: t('wallet.admin.reject'), message: t('wallet.admin.reject_prompt'), multiline: true, maxLength: 500 });
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
            <div className="text-[12.5px] max-w-[260px]">
              <HelpLabel htmlFor="adjust-amount" label={t('wallet.admin.adjust_amount')}
                short="رقم موجب يضيف إلى الرصيد، وسالب (بعلامة -) يخصم منه."
                info={'بالريال، بحد أقصى خانتين بعد الفاصلة، ولا يقبل صفرًا.\nيُسجَّل سطرًا جديدًا في سجل رصيده ولا يعدّل أي عملية سابقة.\nمثال: 10 يضيف عشرة ريالات، و-10 يخصمها.\nلا يُقبل خصم يجعل الرصيد أقل من صفر.'} />
              <input id="adjust-amount" className="input w-32 block" dir="ltr" required value={adjust.amount} placeholder="-10.00 / 10.00" onChange={e => setAdjust({ ...adjust, amount: e.target.value })} />
            </div>
            <div className="text-[12.5px] flex-1 min-w-[180px]">
              <HelpLabel htmlFor="adjust-note" label={t('wallet.admin.adjust_note')}
                short="لماذا عدّلت الرصيد؛ يُحفظ مع التسوية. خمسة أحرف على الأقل."
                info={'مطلوب، من 5 إلى 500 حرف.\nيُحفظ مع التسوية في سجل الرصيد ويظهر في هذه القائمة لمن يراجعها لاحقًا.\nمثال: «تعويض عن خطأ في عمولة شهر مارس».'} />
              <input id="adjust-note" className="input block w-full" required minLength={5} maxLength={500} value={adjust.note} onChange={e => setAdjust({ ...adjust, note: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-primary btn-sm">{t('wallet.admin.adjust')}</button>
          </form>
        </div>
      )}

      <div className="card p-3 overflow-x-auto">
        <h2 className="font-bold text-fg mb-2">{t('wallet.admin.rewards')}</h2>
        {data.rewards.length === 0 ? <div className="text-[13px] text-fg-muted">{t('wallet.admin.none')}</div> : (
          <ul className="text-[12.5px] space-y-1">
            {data.rewards.map(r => (
              <li key={r.id}>{r.referrer_name} ← {r.referred_name}: {money(r.amount)}{r.mode === 'subscription' ? '' : ` (${r.percent}% × ${money(r.payment_amount)})`} · {formatRelativeTime(r.created_at)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
