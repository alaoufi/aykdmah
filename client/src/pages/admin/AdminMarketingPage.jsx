import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingState, ErrorState } from '../../components/common/Spinner';
import { getMarketingStats } from '../../services/adminService';
import { localizedName } from '../../utils/localize';

const fmt = value => Number(value || 0).toLocaleString('en-US');
const money = value => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// One number with its label: the headline figures.
function Tile({ label, value, hint }) {
  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <div className="text-[12px] text-fg-muted">{label}</div>
      <div className="text-2xl font-extrabold text-fg mt-0.5" dir="ltr">{value}</div>
      {hint && <div className="text-[11px] text-fg-subtle mt-0.5">{hint}</div>}
    </div>
  );
}

// A single-hue magnitude bar inside a table cell; the number stays in text ink.
function Bar({ value, max }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-2 rounded-full bg-surface-alt overflow-hidden">
        {value > 0 && <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />}
      </div>
      <span className="text-[12.5px] font-semibold text-fg w-10 text-end" dir="ltr">{fmt(value)}</span>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="card mb-4">
      <h3 className="mb-0.5">{title}</h3>
      {hint && <p className="text-[12.5px] text-fg-muted mb-3">{hint}</p>}
      {children}
    </section>
  );
}

// New accounts per day (last 30 days): one series, a tooltip on every bar, and a table view.
function DailySignups({ rows, t }) {
  const [showTable, setShowTable] = useState(false);
  const max = Math.max(1, ...rows.map(row => row.clients + row.providers));
  return (
    <>
      <div className="flex items-end gap-[2px] h-32 border-b border-border" role="img" aria-label={t('marketing.daily_title')}>
        {rows.map(row => {
          const total = row.clients + row.providers;
          return (
            <div key={row.day} className="flex-1 h-full flex items-end group relative"
              title={`${row.day}: ${t('marketing.total')} ${total} · ${t('marketing.clients')} ${row.clients} · ${t('marketing.providers')} ${row.providers}`}>
              <div className="w-full rounded-t bg-primary group-hover:opacity-80" style={{ height: total ? `${Math.max(4, (total / max) * 100)}%` : 0 }} />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-fg-subtle mt-1" dir="ltr">
        <span>{rows[0]?.day}</span><span>{rows[rows.length - 1]?.day}</span>
      </div>
      <button type="button" className="text-[12.5px] text-primary font-semibold mt-2" onClick={() => setShowTable(value => !value)}>
        {showTable ? t('marketing.hide_table') : t('marketing.show_table')}
      </button>
      {showTable && (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-fg-muted text-start"><th className="text-start py-1">{t('marketing.day')}</th><th>{t('marketing.clients')}</th><th>{t('marketing.providers')}</th></tr></thead>
            <tbody>{rows.filter(row => row.clients + row.providers > 0).map(row => (
              <tr key={row.day} className="border-t border-border"><td className="py-1" dir="ltr">{row.day}</td><td className="text-center">{row.clients}</td><td className="text-center">{row.providers}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

function PlaceTable({ rows, t, lang, withCity }) {
  if (!rows.length) return <p className="text-[12.5px] text-fg-muted">{t('marketing.empty')}</p>;
  const maxClients = Math.max(...rows.map(row => row.clients));
  const maxProviders = Math.max(...rows.map(row => row.providers));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead><tr className="text-fg-muted text-[12px]">
          <th className="text-start py-1.5">{t('marketing.place')}</th>
          <th className="text-start">{t('marketing.clients')}</th>
          <th className="text-start">{t('marketing.providers')}</th>
          <th className="text-center">{t('marketing.requests')}</th>
        </tr></thead>
        <tbody>{rows.map(row => (
          <tr key={row.id} className="border-t border-border">
            <td className="py-1.5 pe-2">{localizedName(row, lang)}{withCity && row.city_ar && <span className="text-fg-subtle text-[11.5px]"> — {lang === 'ar' ? row.city_ar : (row.city_en || row.city_ar)}</span>}</td>
            <td className="pe-2"><Bar value={row.clients} max={maxClients} /></td>
            <td className="pe-2"><Bar value={row.providers} max={maxProviders} /></td>
            <td className="text-center" dir="ltr">{fmt(row.requests)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function AdminMarketingPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [filters, setFilters] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [placeLevel, setPlaceLevel] = useState('cities');

  const load = useCallback((range) => {
    setError(false);
    getMarketingStats(Object.fromEntries(Object.entries(range).filter(([, value]) => value)))
      .then(setData).catch(() => setError(true));
  }, []);
  useEffect(() => { load({}); }, [load]);

  if (error) return <ErrorState message={t('marketing.load_failed')} />;
  if (!data) return <LoadingState />;
  const { summary: s, beneficiaries: b, referrals: r } = data;
  const maxSupply = Math.max(1, ...data.professions.map(row => row.providers));
  const maxDemand = Math.max(1, ...data.professions.map(row => row.requests));

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">{t('marketing.title')}</h1>
      <p className="text-[13px] text-fg-muted mb-3">{t('marketing.subtitle')}</p>

      {/* Filters: one row above everything; the period applies to sign-up based figures. */}
      <form className="flex flex-wrap items-end gap-2 mb-4" onSubmit={event => { event.preventDefault(); load(filters); }}>
        <label className="text-[12px] text-fg-muted">{t('marketing.from')}
          <input type="date" className="input mt-0.5" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        </label>
        <label className="text-[12px] text-fg-muted">{t('marketing.to')}
          <input type="date" className="input mt-0.5" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        </label>
        <button type="submit" className="btn btn-primary">{t('marketing.apply')}</button>
        {(filters.from || filters.to) && <button type="button" className="btn btn-ghost" onClick={() => { setFilters({ from: '', to: '' }); load({}); }}>{t('marketing.all_time')}</button>}
      </form>

      <Section title={t('marketing.registered')} hint={t('marketing.registered_hint')}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Tile label={t('marketing.total')} value={fmt(s.total)} />
          <Tile label={t('marketing.clients_only')} value={fmt(s.clients)} />
          <Tile label={t('marketing.providers_only')} value={fmt(s.providers)} />
          <Tile label={t('marketing.both')} value={fmt(s.both)} />
          <Tile label={t('marketing.new_7d')} value={fmt(s.new_7d)} />
          <Tile label={t('marketing.new_30d')} value={fmt(s.new_30d)} />
          <Tile label={t('marketing.active_30d')} value={fmt(s.active_30d)} hint={t('marketing.active_hint')} />
          <Tile label={t('marketing.phone_verified')} value={fmt(s.phone_verified)} />
        </div>
      </Section>

      <Section title={t('marketing.daily_title')} hint={t('marketing.daily_hint')}>
        <DailySignups rows={data.signups_daily} t={t} />
      </Section>

      <Section title={t('marketing.professions_title')} hint={t('marketing.professions_hint')}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-fg-muted text-[12px]">
              <th className="text-start py-1.5">{t('marketing.profession')}</th>
              <th className="text-start">{t('marketing.providers')}</th>
              <th className="text-start">{t('marketing.requests')}</th>
              <th className="text-center">{t('marketing.completed')}</th>
            </tr></thead>
            <tbody>{data.professions.map(row => (
              <tr key={row.id} className="border-t border-border">
                <td className="py-1.5 pe-2">{localizedName(row, lang)}{row.providers === 0 && row.requests > 0 && <span className="ms-1 text-[11px] text-warning font-semibold">⚠ {t('marketing.gap')}</span>}</td>
                <td className="pe-2"><Bar value={row.providers} max={maxSupply} /></td>
                <td className="pe-2"><Bar value={row.requests} max={maxDemand} /></td>
                <td className="text-center" dir="ltr">{fmt(row.completed)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Section>

      <Section title={t('marketing.places_title')} hint={t('marketing.places_hint')}>
        <div className="flex gap-1 mb-3" role="tablist">
          {['regions', 'cities', 'districts'].map(level => (
            <button key={level} type="button" role="tab" aria-selected={placeLevel === level} onClick={() => setPlaceLevel(level)}
              className={`px-3 py-1.5 rounded-pill text-[12.5px] font-semibold ${placeLevel === level ? 'bg-primary text-primary-fg' : 'bg-surface-alt text-fg-muted'}`}>
              {t(`marketing.${level}`)}
            </button>
          ))}
        </div>
        <PlaceTable rows={data.geography[placeLevel]} t={t} lang={lang} withCity={placeLevel === 'districts'} />
      </Section>

      <Section title={t('marketing.beneficiaries_title')} hint={t('marketing.beneficiaries_hint')}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Tile label={t('marketing.clients_requested')} value={fmt(b.clients_requested)} />
          <Tile label={t('marketing.clients_served')} value={fmt(b.clients_served)} />
          <Tile label={t('marketing.providers_offered')} value={fmt(b.providers_offered)} />
          <Tile label={t('marketing.providers_earned')} value={fmt(b.providers_earned)} />
          <Tile label={t('marketing.requests_total')} value={fmt(b.requests)} />
          <Tile label={t('marketing.requests_completed')} value={fmt(b.completed)} />
        </div>
      </Section>

      <Section title={t('marketing.referrals_title')} hint={t('marketing.referrals_hint')}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
          <Tile label={t('marketing.invited')} value={fmt(r.invited)} />
          <Tile label={t('marketing.invited_clients')} value={fmt(r.invited_clients)} />
          <Tile label={t('marketing.invited_providers')} value={fmt(r.invited_providers)} />
        </div>
        {r.top.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-fg-muted text-[12px]">
                <th className="text-start py-1.5">{t('marketing.inviter')}</th>
                <th className="text-center">{t('brand.customer_number')}</th>
                <th className="text-center">{t('marketing.invited')}</th>
                <th className="text-center">{t('marketing.payments')}</th>
                <th className="text-center">{t('marketing.rewards')}</th>
              </tr></thead>
              <tbody>{r.top.map(row => (
                <tr key={row.referral_code} className="border-t border-border">
                  <td className="py-1.5">{row.full_name || '—'}</td>
                  <td className="text-center font-mono" dir="ltr">{row.referral_code}</td>
                  <td className="text-center" dir="ltr">{fmt(row.invited)}</td>
                  <td className="text-center" dir="ltr">{money(row.payments)}</td>
                  <td className="text-center" dir="ltr">{money(row.rewards)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="text-[12.5px] text-fg-muted">{t('marketing.no_invites')}</p>}
      </Section>

      <Section title={t('marketing.budget_title')} hint={t('marketing.budget_hint')}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Tile label={t('marketing.revenue')} value={money(r.budget.revenue)} hint={t('marketing.currency')} />
          <Tile label={t('marketing.referred_payments')} value={money(r.budget.referred_payments)} hint={t('marketing.currency')} />
          <Tile label={t('marketing.rewards_total')} value={money(r.budget.rewards_total)} hint={t('marketing.rewards_count', { count: r.budget.rewards_count })} />
          <Tile label={t('marketing.wallet_balances')} value={money(r.budget.wallet_balances)} hint={t('marketing.currency')} />
          <Tile label={t('marketing.withdrawals_paid')} value={money(r.budget.withdrawals_paid)} hint={t('marketing.currency')} />
          <Tile label={t('marketing.withdrawals_pending')} value={money(r.budget.withdrawals_pending)} hint={t('marketing.currency')} />
        </div>
      </Section>
    </div>
  );
}
