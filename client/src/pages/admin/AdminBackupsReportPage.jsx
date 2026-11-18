import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getBackupsReport, getBackupLink } from '../../services/adminService';
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
  const when = iso => (iso ? new Date(iso).toLocaleString(i18n.resolvedLanguage || 'ar', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const ago = h => (h == null ? '—' : h < 1 ? t('backups_report.under_hour') : h < 48 ? t('backups_report.hours_ago', { count: Math.round(h) }) : t('backups_report.days_ago', { count: Math.round(h / 24) }));

  useEffect(() => {
    let active = true;
    setError('');
    getBackupsReport(fresh ? { fresh: 1 } : {})
      .then(res => { if (active) setData(res); })
      .catch(e => { if (active) setError(apiError(e)); });
    return () => { active = false; };
  }, [fresh]);

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
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setFresh(x => x + 1)}>↻ {t('backups_report.refresh')}</button>
      </AdminPageHeader>
      {error && <p className="form-error" role="alert">{error}</p>}
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
                {data.backups.map(o => (
                  <li key={o.key} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0" data-testid="backup-row">
                    <div className="min-w-0">
                      <div className="font-semibold text-ink text-[13px] truncate" dir="ltr" style={{ textAlign: 'start' }}>{o.name}</div>
                      <div className="text-[12px] text-slate-500">{when(o.modified)} · {size(o.size)}</div>
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
    </div>
  );
}
