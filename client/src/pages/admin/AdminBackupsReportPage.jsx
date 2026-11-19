import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getBackupsReport, getBackupLink, runBackupNow } from '../../services/adminService';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import EmptyState from '../../components/admin/EmptyState';
import { apiError } from '../../services/api';

// The backups report (AYK-271): this site's encrypted backups in Cloudflare R2, read with a
// read-only key: newest, age, size, count, last successful restore test, and (main administrator
// only) a download of each backup as it is, encrypted.
const size = n => { const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; n = Number(n) || 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1; } return `${n.toFixed(i ? 1 : 0)} ${u[i]}`; };

export default function AdminBackupsReportPage() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [fresh, setFresh] = useState(0);
  const [confirmRun, setConfirmRun] = useState(false);
  const [runMsg, setRunMsg] = useState('');
  const when = iso => (iso ? new Date(iso).toLocaleString(i18n.resolvedLanguage || 'ar', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  // Each backup by name in words: weekday, date and time in the reader's language (AYK-277).
  const day = iso => (iso ? new Date(iso).toLocaleString(i18n.resolvedLanguage || 'ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
  const ago = h => (h == null ? '—' : h < 1 ? t('backups_report.under_hour') : h < 48 ? t('backups_report.hours_ago', { count: Math.round(h) }) : t('backups_report.days_ago', { count: Math.round(h / 24) }));

  useEffect(() => {
    let active = true;
    setError('');
    getBackupsReport(fresh ? { fresh: 1 } : {})
      .then(res => { if (active) setData(res); })
      .catch(e => { if (active) setError(apiError(e)); });
    return () => { active = false; };
  }, [fresh]);

  // While a backup is waiting or running, the page asks again every 5 seconds (AYK-304).
  const busyRun = Boolean(data?.run?.pending || data?.run?.running);
  useEffect(() => {
    if (!busyRun) return undefined;
    const id = setTimeout(() => setFresh(x => x + 1), 5000);
    return () => clearTimeout(id);
  }, [busyRun, data]);

  const startRun = async () => {
    setRunMsg(''); setError('');
    try {
      const r = await runBackupNow();
      if (!r.ok) setRunMsg(t(`backups_report.run.refused_${r.reason}`, { minutes: Math.max(1, Math.ceil((r.wait_seconds || 0) / 60)) }));
      setFresh(x => x + 1);
    } catch (e) { setError(apiError(e)); } finally { setConfirmRun(false); }
  };

  const download = async key => {
    setBusy(key); setError('');
    try { window.location.assign(await getBackupLink(key)); } catch (e) { setError(apiError(e)); } finally { setBusy(''); }
  };

  const state = !data ? null : !data.configured ? 'off' : data.error ? 'error' : !data.newest ? 'none' : data.healthy ? 'ok' : 'late';
  const badge = { ok: ['bg-emerald-50 text-emerald-700', 'backups_report.state_ok'], late: ['bg-amber-50 text-amber-700', 'backups_report.state_late'],
    none: ['bg-rose-50 text-rose-700', 'backups_report.state_none'], error: ['bg-rose-50 text-rose-700', 'backups_report.state_error'] }[state];
  const rows = data?.configured && !data.error ? [
    ['backups_report.newest', ago(data.age_hours)], ['backups_report.newest_date', when(data.newest?.modified)],
    ['backups_report.newest_size', data.newest ? size(data.newest.size) : '—'], ['backups_report.count', data.count],
    ['backups_report.total', size(data.total_bytes)], ['backups_report.last_verified', data.last_verified ? when(data.last_verified.modified) : t('backups_report.not_recorded')],
    ['backups_report.bucket', data.bucket],
  ] : [];

  return (
    <div data-testid="backups-report">
      <AdminPageHeader title={t('admin.backups_report')} subtitle={t('backups_report.subtitle')}>
        {data?.can_run && data?.run?.available && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busyRun} onClick={() => setConfirmRun(true)} data-testid="backup-run">
            💾 {t(busyRun ? 'backups_report.run.busy' : 'backups_report.run.button')}
          </button>
        )}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setFresh(x => x + 1)}>↻ {t('backups_report.refresh')}</button>
      </AdminPageHeader>
      {error && <p className="form-error" role="alert">{error}</p>}
      {data?.can_run && <BackupRunStatus run={data.run} message={runMsg} t={t} when={when} />}
      <ConfirmDialog open={confirmRun} tone="primary" title={t('backups_report.run.confirm_title')} body={t('backups_report.run.confirm_body')}
        confirmLabel={t('backups_report.run.button')} cancelLabel={t('admin.cancel_btn')} onConfirm={startRun} onCancel={() => setConfirmRun(false)} />
      {!data && !error && <p className="text-slate-500">{t('common.loading')}</p>}
      {state === 'off' && (
        <EmptyState icon="🗄️" title={t('backups_report.off_title')} subtitle={t('backups_report.off_body')} />
      )}
      {state && state !== 'off' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
          <section className="card p-4" data-testid="backups-summary">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="text-ink font-extrabold text-lg m-0">{t('backups_report.this_site')}</h2>
              <span className={`px-2.5 py-0.5 rounded-pill text-[12.5px] font-bold ${badge[0]}`}>{t(badge[1])}</span>
            </div>
            {state === 'error' && <p className="text-rose-700 text-sm">{t(`backups_report.error_${data.error === 'access_denied' ? 'denied' : 'reach'}`)}</p>}
            {state === 'late' && <p className="text-amber-700 text-sm">{t('backups_report.late_hint', { count: data.expect_hours })}</p>}
            <dl className="m-0">
              {rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 py-1.5 border-b border-dashed border-slate-200 last:border-0 text-[13.5px]">
                  <dt className="text-slate-500">{t(label)}</dt><dd className="m-0 font-semibold text-ink" dir="auto">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[12.5px] text-slate-500 mt-3 mb-0">{t('backups_report.encrypted_note')}</p>
          </section>
          {data.backups?.length > 0 && (
            <section className="card p-0 overflow-hidden">
              <ol className="list-none m-0 p-0 max-h-[70vh] overflow-auto">
                {data.backups.map((o, i) => (
                  <li key={o.key} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0" data-testid="backup-row">
                    <div className="min-w-0">
                      <div className="font-bold text-ink text-[14px]" data-testid="backup-title">{day(o.modified)}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[12px]">
                        {i === 0 && <span className="px-2 py-0.5 rounded-pill bg-sky-50 text-sky-700 font-bold">{t('backups_report.newest_tag')}</span>}
                        {o.verified && <span className="px-2 py-0.5 rounded-pill bg-emerald-50 text-emerald-700 font-bold">{t('backups_report.verified_tag')}</span>}
                        <span className="px-2 py-0.5 rounded-pill bg-slate-100 text-slate-600">{t(o.automatic ? 'backups_report.auto_tag' : 'backups_report.manual_tag')}</span>
                        <span className="text-slate-500">{t('backups_report.row_size', { size: size(o.size) })}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 truncate" dir="ltr" style={{ textAlign: 'start' }}>{o.name}</div>
                    </div>
                    {data.can_download && (
                      <button type="button" className="btn btn-outline btn-sm shrink-0" disabled={busy === o.key} onClick={() => download(o.key)} data-testid="backup-download">
                        ⬇ {t('backups_report.download')}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
      <BackupsGuide t={t} mediaInR2={Boolean(data?.media_in_r2)} />
    </div>
  );
}

// What is inside each backup and how backups are taken (owner's request, AYK-299): the list above
// is dates and sizes only; this says in words what each one holds and what the owner must keep.
// The state of «take a backup now» (AYK-304): waiting for the server, the step it is on, or how the
// last run ended. Nothing when the button is not set up on this server.
const STEPS = ['database', 'uploads', 'code', 'encrypting', 'uploading', 'media'];
function BackupRunStatus({ run, message, t, when }) {
  if (!run?.available) return null;
  const last = run.last;
  let tone = 'bg-slate-50 text-slate-700 border-slate-200';
  let text = '';
  if (run.stuck) { tone = 'bg-amber-50 text-amber-800 border-amber-200'; text = t('backups_report.run.stuck'); }
  else if (run.pending) text = t('backups_report.run.pending');
  else if (run.running) {
    const step = STEPS.includes(last?.step) ? t(`backups_report.run.step_${last.step}`) : '';
    text = t('backups_report.run.running', { step, index: STEPS.indexOf(last?.step) + 1, total: STEPS.length });
  } else if (last?.state === 'done' && last.trigger === 'manual') {
    tone = 'bg-emerald-50 text-emerald-800 border-emerald-200'; text = t('backups_report.run.done', { when: when(last.finished) });
  } else if (last?.state === 'failed') {
    tone = 'bg-rose-50 text-rose-800 border-rose-200';
    text = t('backups_report.run.failed', { when: when(last.finished), step: STEPS.includes(last.step) ? t(`backups_report.run.step_${last.step}`) : last.step });
  }
  if (last && !run.pending && !run.running && last.media === 'failed') text = `${text ? `${text} ` : ''}${t('backups_report.run.media_failed')}`;
  if (!text && !message) return null;
  return (
    <div className={`border rounded-card px-4 py-3 mb-4 text-[13.5px] ${tone}`} role="status" data-testid="backup-run-status">
      {(run.pending || run.running) && <span className="inline-block animate-spin me-2" aria-hidden="true">⏳</span>}
      {message || text}
    </div>
  );
}

function BackupsGuide({ t, mediaInR2 }) {
  const raw = t('backups_report.guide.items', { returnObjects: true });
  // The first item is the database; with media in R2 it no longer holds the photos and files.
  const items = (Array.isArray(raw) ? raw : []).map((item, i) => (
    i === 0 && mediaInR2 ? { ...item, body: t('backups_report.guide.database_r2') } : item
  )).concat(mediaInR2 ? [t('backups_report.guide.media_item', { returnObjects: true })] : []);
  const steps = t('backups_report.guide.auto_steps', { returnObjects: true });
  return (
    <div className="grid gap-4 lg:grid-cols-2 mt-4" data-testid="backups-guide">
      <section className="card p-4">
        <h2 className="text-ink font-extrabold text-lg mt-0 mb-1">{t('backups_report.guide.contents_title')}</h2>
        <p className="text-slate-500 text-[13px] mt-0 mb-3">{t('backups_report.guide.contents_hint')}</p>
        <ul className="list-none m-0 p-0 grid gap-2.5">
          {Array.isArray(items) && items.map(item => (
            <li key={item.title} className="flex gap-3 items-start">
              <span className="text-xl leading-none mt-0.5" aria-hidden="true">{item.icon}</span>
              <div><div className="font-bold text-ink text-[14px]">{item.title}</div><div className="text-slate-600 text-[13px] leading-relaxed">{item.body}</div></div>
            </li>
          ))}
        </ul>
      </section>
      <div className="grid gap-4 content-start">
        <section className="card p-4">
          <h2 className="text-ink font-extrabold text-lg mt-0 mb-3">{t('backups_report.guide.auto_title')}</h2>
          <ol className="m-0 ps-5 grid gap-2 text-[13.5px] text-slate-700 leading-relaxed">
            {Array.isArray(steps) && steps.map(step => <li key={step}>{step}</li>)}
          </ol>
        </section>
        <section className="card p-4 border-2 border-amber-300 bg-amber-50">
          <h2 className="text-amber-800 font-extrabold text-lg mt-0 mb-2">🔑 {t('backups_report.guide.keep_title')}</h2>
          <p className="text-amber-900 text-[13.5px] leading-relaxed m-0">{t('backups_report.guide.keep_body')}</p>
        </section>
      </div>
    </div>
  );
}
