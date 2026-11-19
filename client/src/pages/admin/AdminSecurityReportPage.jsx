import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSecurityReport } from '../../services/adminService';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import EmptyState from '../../components/admin/EmptyState';
import { formatRelativeTime } from '../../utils/formatters';
import { apiError } from '../../services/api';

// Security report (AYK-242): attempts against the server (SSH) and the site (sign-ins), with
// time, address, country and status. Countries come from the server's local DB-IP lookup.
const flag = (code) => (/^[A-Z]{2}$/.test(code || '') ? String.fromCodePoint(...[...code].map(c => 127397 + c.charCodeAt(0))) : '🏳️');
const STATUS_STYLE = {
  failed: 'bg-amber-50 text-amber-700',
  blocked: 'bg-rose-50 text-rose-700',
  success: 'bg-emerald-50 text-emerald-700',
};

export default function AdminSecurityReportPage() {
  const { t, i18n } = useTranslation();
  const [days, setDays] = useState(7);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const custom = Boolean(from && to && from <= to);
  const [source, setSource] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getSecurityReport(custom ? { from, to, source } : { days, source })
      .then((res) => { if (active) setData(res.data); })
      .catch((e) => { if (active) { setData(null); setError(apiError(e)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, source, tick, custom, from, to]);

  const regionName = useMemo(() => {
    let names = null;
    try { names = new Intl.DisplayNames([i18n.language, 'en'], { type: 'region' }); } catch (_) { /* old browser */ }
    return (code) => (!code || code === '??' ? t('admin.sec_unknown_country') : (names?.of(code) || code));
  }, [i18n.language, t]);

  const s = data?.summary;
  const num = (v) => Number(v || 0).toLocaleString(i18n.language);
  const cards = s ? [
    { label: t('admin.sec_attempts'), value: s.attempts, tone: 'text-rose-700', big: true },
    { label: t('admin.sec_attackers'), value: s.attackers, tone: 'text-ink' },
    { label: t('admin.sec_countries'), value: s.countries, tone: 'text-ink' },
    { label: t('admin.sec_per_day'), value: s.per_day, tone: 'text-ink' },
    { label: t('admin.sec_ssh_failed'), value: s.ssh_failed, tone: 'text-amber-700' },
    { label: t('admin.sec_ssh_banned'), value: s.ssh_banned, tone: 'text-rose-700' },
    { label: t('admin.sec_site_failed'), value: s.site_failed, tone: 'text-amber-700' },
    { label: t('admin.sec_locked'), value: s.locked, tone: 'text-rose-700' },
    { label: t('admin.sec_rate_limited'), value: s.rate_limited, tone: 'text-rose-700' },
    { label: t('admin.sec_http_flood'), value: s.http_flood, tone: 'text-rose-700' },
    { label: t('admin.sec_flood_banned'), value: s.flood_banned, tone: 'text-rose-700' },
    { label: t('admin.sec_admin_logins'), value: s.admin_logins, tone: 'text-emerald-700' },
  ] : [];
  const maxDay = Math.max(1, ...(data?.daily || []).map((d) => d.failed + d.blocked));
  const maxCountry = Math.max(1, ...(data?.countries || []).map((c) => c.attempts));

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('admin.security_report')} />

      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
          {[1, 7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => { setDays(d); setFrom(''); setTo(''); }}
              className={`px-3 py-1.5 ${!custom && days === d ? 'bg-brand-600 text-white' : 'text-slate-600'}`}>
              {t(`admin.sec_days_${d}`)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-slate-600">{t('admin.sec_from')}
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)}
            className={`border rounded-lg px-2 py-1 bg-white ${custom ? 'border-brand-600' : 'border-slate-200'}`} />
        </label>
        <label className="flex items-center gap-1.5 text-slate-600">{t('admin.sec_to')}
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)}
            className={`border rounded-lg px-2 py-1 bg-white ${custom ? 'border-brand-600' : 'border-slate-200'}`} />
        </label>
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label={t('admin.sec_source')}
          className="border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-ink">
          <option value="all">{t('admin.sec_source_all')}</option>
          <option value="server">{t('admin.sec_source_server')}</option>
          <option value="site">{t('admin.sec_source_site')}</option>
        </select>
        <button type="button" onClick={() => setTick((n) => n + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600">
          ↻ {t('admin.sec_refresh')}
        </button>
      </div>

      {error && <div role="alert" className="text-rose-700 text-[13px]">{error}</div>}
      {data && !data.server_last_at && source !== 'site' && (
        <div className="rounded-card border border-amber-200 bg-amber-50 text-amber-800 text-[13px] p-3">{t('admin.sec_server_not_connected')}</div>
      )}

      {loading && !data ? (
        <div className="h-24 bg-slate-100 rounded-card animate-pulse" />
      ) : s && (
        <>
          <div className="text-[12.5px] text-slate-500">
            {t('admin.sec_period', { from: data.range.from, to: data.range.to, days: data.range.days })}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {cards.map((c) => (
              <div key={c.label} className={`bg-white rounded-card border shadow-soft p-4 ${c.big ? 'border-rose-200' : 'border-slate-100'}`}>
                <div className={`text-[22px] font-extrabold ${c.tone}`}>{num(c.value)}</div>
                <div className="text-[12px] text-slate-500 mt-1">{c.label}</div>
              </div>
            ))}
          </div>

          {data.daily.length > 1 && (
            <div className="bg-white rounded-card border border-slate-100 shadow-soft p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[13px] font-bold text-ink">{t('admin.sec_daily')}</div>
                <div className="flex gap-3 text-[11.5px] text-slate-500">
                  <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400 align-middle" /> {t('admin.sec_status_failed')}</span>
                  <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-500 align-middle" /> {t('admin.sec_status_blocked')}</span>
                </div>
              </div>
              <div className="flex items-end gap-[3px] h-36" dir="ltr">
                {data.daily.map((d) => (
                  <div key={d.date} className="flex-1 min-w-[4px] flex flex-col justify-end h-full"
                    title={`${d.date}: ${num(d.failed)} ${t('admin.sec_status_failed')} · ${num(d.blocked)} ${t('admin.sec_status_blocked')}`}>
                    <div className="bg-rose-500 rounded-t-sm" style={{ height: `${(d.blocked / maxDay) * 100}%` }} />
                    <div className="bg-amber-400" style={{ height: `${(d.failed / maxDay) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 mt-1" dir="ltr">
                <span>{data.daily[0].date}</span><span>{data.daily[data.daily.length - 1].date}</span>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-3">
            {data.countries.length > 0 && (
              <div className="bg-white rounded-card border border-slate-100 shadow-soft p-4">
                <div className="text-[13px] font-bold text-ink mb-3">{t('admin.sec_top_countries')}</div>
                <div className="space-y-2">
                  {data.countries.map((c) => (
                    <div key={c.code} className="text-[12.5px]">
                      <div className="flex justify-between"><span>{flag(c.code)} {regionName(c.code)}</span><b className="text-rose-700">{num(c.attempts)}</b></div>
                      <div className="h-1.5 bg-slate-100 rounded mt-1"><div className="h-1.5 bg-rose-400 rounded" style={{ width: `${(c.attempts / maxCountry) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.top_ips.length > 0 && (
              <div className="bg-white rounded-card border border-slate-100 shadow-soft p-4">
                <div className="text-[13px] font-bold text-ink mb-3">{t('admin.sec_top_ips')}</div>
                <table className="w-full text-[12.5px]">
                  <tbody>
                    {data.top_ips.map((r) => (
                      <tr key={r.ip} className="border-b border-slate-50">
                        <td className="py-1.5 font-mono" dir="ltr">{r.ip}</td>
                        <td className="py-1.5">{r.country ? <>{flag(r.country)} {regionName(r.country)}</> : '—'}</td>
                        <td className="py-1.5 font-bold text-rose-700 text-end">{num(r.attempts)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <div className="bg-white rounded-card border border-slate-100 shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="text-right text-[11.5px] font-bold text-slate-500 border-b border-slate-100 bg-slate-50/50">
                <th className="px-4 py-3">{t('admin.sec_col_time')}</th>
                <th className="py-3">{t('admin.sec_col_event')}</th>
                <th className="py-3">{t('admin.sec_col_status')}</th>
                <th className="py-3">IP</th>
                <th className="py-3">{t('admin.sec_col_country')}</th>
                <th className="py-3">{t('admin.sec_col_attempts')}</th>
                <th className="py-3 px-4">{t('admin.sec_col_detail')}</th>
              </tr>
            </thead>
            <tbody>
              {!data?.events?.length ? (
                <tr><td colSpan="7"><EmptyState icon="🛡️" title={loading ? '…' : t('admin.sec_none')} /></td></tr>
              ) : data.events.map((e, i) => (
                <tr key={`${e.at}-${e.ip}-${i}`} className="border-b border-slate-50 text-[12.5px]">
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap" title={new Date(e.at).toLocaleString(i18n.language)}>
                    {new Date(e.at).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })}
                    <div className="text-[11px] text-slate-400">{formatRelativeTime(e.at)}</div>
                  </td>
                  <td className="py-2.5 text-ink">
                    <span className="text-[11px] text-slate-400 block">{t(`admin.sec_source_${e.source}`)}</span>
                    {t(`admin.sec_event_${e.event}`)}
                  </td>
                  <td className="py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-pill font-bold text-[11px] ${STATUS_STYLE[e.status] || ''}`}>{t(`admin.sec_status_${e.status}`)}</span>
                  </td>
                  <td className="py-2.5 font-mono text-[12px] text-slate-700" dir="ltr">{e.ip || '—'}</td>
                  <td className="py-2.5 whitespace-nowrap">{e.country ? <>{flag(e.country)} {regionName(e.country)}</> : <span className="text-slate-400">{t('admin.sec_unknown_country')}</span>}</td>
                  <td className="py-2.5 font-bold">{e.attempts.toLocaleString(i18n.language)}</td>
                  <td className="py-2.5 px-4 text-slate-500 max-w-[220px] truncate" dir="auto" title={e.detail || ''}>{e.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11.5px] text-slate-400">
        {t('admin.sec_note')}{' '}
        <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer" className="underline">IP Geolocation by DB-IP</a>
      </p>
    </div>
  );
}
