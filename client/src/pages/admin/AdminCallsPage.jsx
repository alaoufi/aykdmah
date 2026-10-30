import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminCallStats, reviewCallReport } from '../../services/callService';
import { LoadingState, ErrorState } from '../../components/common/Spinner';
import { formatRelativeTime } from '../../utils/formatters';

// Call metadata only. There is deliberately no way to listen to or watch calls.
export default function AdminCallsPage() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    adminCallStats(days).then(setData).catch(() => setError('calls.admin.load_failed'));
  }, [days]);
  useEffect(() => { load(); }, [load]);
  // The live numbers refresh every half minute while the page is open.
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) adminCallStats(days).then(setData).catch(() => {}); }, 30000);
    return () => clearInterval(timer);
  }, [days]);

  if (error) return <ErrorState message={t(error)} />;
  if (!data) return <LoadingState />;
  const { totals, system, live } = data;
  const minutes = s => Math.round((Number(s) || 0) / 60);
  const cards = [
    ['total', totals.total], ['completed', totals.completed], ['missed', totals.missed], ['rejected', totals.rejected],
    ['failed', totals.failed], ['active', totals.active], ['video', totals.video],
    ['total_minutes', minutes(totals.total_seconds)], ['avg_minutes', (Number(totals.avg_seconds) / 60).toFixed(1)],
  ];

  const review = async (id, status) => { await reviewCallReport(id, status).catch(() => {}); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-extrabold text-fg">{t('calls.admin.title')}</h1>
        <select className="input w-auto text-sm" value={days} onChange={e => setDays(Number(e.target.value))} aria-label={t('calls.admin.period')}>
          {[1, 7, 30, 90].map(d => <option key={d} value={d}>{t('calls.admin.last_days', { count: d })}</option>)}
        </select>
      </div>
      {!data.configured && <div className="px-3 py-2 rounded-card bg-amber-50 text-amber-800 text-[13px]">{t('calls.admin.not_configured')}</div>}
      <p className="text-[12.5px] text-fg-subtle">{t('calls.admin.privacy_note')}</p>

      {live && (
        <div className="card p-3 space-y-2" data-testid="calls-live">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <b className="text-fg">🟢 {t('calls.admin.live_title')}</b>
            <span className="text-[12px] text-fg-muted">{t('calls.admin.capacity', { video: live.capacity.video, audio: live.capacity.audio })}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[['live_now', live.now.total], ['live_video_audio', `${live.now.video} / ${live.now.audio}`], ['today_total', live.today.total],
              ['today_peak', live.today.peak], ['today_minutes', minutes(live.today.seconds)]].map(([key, value]) => (
              <div key={key} className="rounded-card bg-surface-alt p-2">
                <div className="text-[11.5px] text-fg-muted">{t(`calls.admin.${key}`)}</div>
                <div className="text-lg font-extrabold text-fg">{value}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="flex justify-between text-[12px] text-fg-muted"><span>{t('calls.admin.load_now')}</span><span>{live.capacity.used_percent}%</span></div>
            <div className="h-2 rounded-full bg-surface-alt overflow-hidden" role="meter" aria-valuenow={live.capacity.used_percent} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full ${live.capacity.used_percent >= 80 ? 'bg-danger' : live.capacity.used_percent >= 50 ? 'bg-amber-500' : 'bg-success'}`}
                style={{ width: `${Math.max(live.capacity.used_percent, 1)}%` }} />
            </div>
            {live.capacity.used_percent >= 80 && <p className="text-[12px] text-danger mt-1 m-0">⚠️ {t('calls.admin.capacity_warning')}</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {cards.map(([key, value]) => (
          <div key={key} className="card p-3">
            <div className="text-[11.5px] text-fg-muted">{t(`calls.admin.${key}`)}</div>
            <div className="text-xl font-extrabold text-fg">{value}</div>
          </div>
        ))}
      </div>

      {system && (
        <div className="card p-3 text-[12.5px] text-fg-muted">
          <b className="text-fg">{t('calls.admin.server')}</b>{' · '}
          {t('calls.admin.load', { value: system.load1.toFixed(2), cpus: system.cpus })}{' · '}
          {t('calls.admin.memory', { used: system.mem_used_gb.toFixed(1), total: system.mem_total_gb.toFixed(1) })}
        </div>
      )}

      {/* Call quality log (AYK-060): how each answered call behaved on each phone. */}
      <section className="card p-3" data-testid="call-quality-log">
        <h2 className="font-bold text-fg mb-1">📶 {t('calls.admin.quality_title')}</h2>
        <p className="text-[12px] text-fg-muted mt-0 mb-2">{t('calls.admin.quality_hint')}</p>
        {!(data.quality?.length) ? <div className="text-[12.5px] text-fg-muted">{t('calls.admin.quality_empty')}</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="text-fg-muted text-start">
                {['q_call', 'q_user', 'q_path', 'q_rtt', 'q_loss', 'q_jitter', 'q_audio_in', 'q_poor', 'q_reconnects', 'q_blocked', 'q_network']
                  .map(key => <th key={key} className="px-2 py-1 font-semibold whitespace-nowrap">{t(`calls.admin.${key}`)}</th>)}
              </tr></thead>
              <tbody>
                {data.quality.map(q => {
                  const bad = Number(q.packet_loss_pct) >= 5 || Number(q.rtt_ms) >= 400 || q.poor_seconds > 10 || q.audio_blocked || Number(q.audio_kb_in) === 0;
                  return (
                    <tr key={q.id} className={`border-t border-border ${bad ? 'bg-danger-soft' : ''}`}>
                      <td className="px-2 py-1 whitespace-nowrap">#{q.call_id} {q.call_type === 'video' ? '📹' : '📞'} {q.duration_seconds != null ? `${q.duration_seconds}s` : ''}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{q.user_name}</td>
                      <td className="px-2 py-1" dir="ltr">{q.connection_type || '—'}</td>
                      <td className="px-2 py-1" dir="ltr">{q.rtt_ms != null ? `${q.rtt_ms} ms` : '—'}</td>
                      <td className="px-2 py-1" dir="ltr">{q.packet_loss_pct != null ? `${Number(q.packet_loss_pct)}%` : '—'}</td>
                      <td className="px-2 py-1" dir="ltr">{q.jitter_ms != null ? `${q.jitter_ms} ms` : '—'}</td>
                      <td className="px-2 py-1" dir="ltr">{q.audio_kb_in != null ? `${q.audio_kb_in} KB` : '—'}</td>
                      <td className="px-2 py-1">{q.poor_seconds}s</td>
                      <td className="px-2 py-1">{q.reconnects}</td>
                      <td className="px-2 py-1">{q.audio_blocked ? '⚠️' : '—'}</td>
                      <td className="px-2 py-1" dir="ltr">{q.network_type || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.errors.length > 0 && (
        <div className="card p-3">
          <h2 className="font-bold text-fg mb-2">{t('calls.admin.errors')}</h2>
          <ul className="text-[12.5px] text-fg-muted">{data.errors.map(e => <li key={e.end_reason || 'unknown'}>{e.end_reason || '—'}: {e.n}</li>)}</ul>
        </div>
      )}

      <div className="card p-3">
        <h2 className="font-bold text-fg mb-2">{t('calls.admin.reports')}</h2>
        {data.reports.length === 0 ? <div className="text-[12.5px] text-fg-muted">{t('calls.admin.no_reports')}</div> : (
          <ul className="space-y-2">
            {data.reports.map(r => (
              <li key={r.id} className="text-[12.5px] border-b border-border pb-2">
                <div className="text-fg">#{r.call_id} · {r.reporter_name} · {formatRelativeTime(r.created_at)} · <b>{t(`calls.admin.report_status.${r.status}`)}</b></div>
                <div className="text-fg-muted whitespace-pre-line">{r.reason}</div>
                {r.status === 'open' && (
                  <div className="flex gap-2 mt-1">
                    <button type="button" className="px-2 py-1 rounded-pill bg-surface-alt border border-border" onClick={() => review(r.id, 'reviewed')}>{t('calls.admin.mark_reviewed')}</button>
                    <button type="button" className="px-2 py-1 rounded-pill bg-surface-alt border border-border" onClick={() => review(r.id, 'dismissed')}>{t('calls.admin.dismiss')}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-3 overflow-x-auto">
        <h2 className="font-bold text-fg mb-2">{t('calls.admin.recent')}</h2>
        <table className="w-full text-[12.5px]">
          <thead><tr className="text-fg-muted text-start">
            <th className="text-start p-1">#</th><th className="text-start p-1">{t('calls.admin.parties')}</th>
            <th className="text-start p-1">{t('calls.admin.type')}</th><th className="text-start p-1">{t('calls.admin.status')}</th>
            <th className="text-start p-1">{t('calls.admin.duration')}</th><th className="text-start p-1">{t('calls.admin.when')}</th>
          </tr></thead>
          <tbody>
            {data.recent.map(c => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-1">{c.id}</td>
                <td className="p-1">{c.caller_name} → {c.callee_name}{c.request_id ? ` (#${c.request_id})` : ''}</td>
                <td className="p-1">{c.call_type === 'video' ? '🎥' : '📞'}</td>
                <td className="p-1">{t(`calls.outcome.${c.status}`)}{c.end_reason ? ` · ${c.end_reason}` : ''}</td>
                <td className="p-1">{c.duration_seconds != null ? `${Math.floor(c.duration_seconds / 60)}:${String(c.duration_seconds % 60).padStart(2, '0')}` : '—'}</td>
                <td className="p-1">{formatRelativeTime(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
