import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminSupportWhatsApp, adminSupportWhatsAppHandled } from '../../services/supportService';
import { apiError } from '../../services/api';
import { formatRelativeTime } from '../../utils/formatters';
import { InfoButton, InfoPanel } from '../common/InfoTip';

// AYK-437: every tap on «تواصل مع الدعم الفني» (WhatsApp), for support to review: who (when signed in),
// from which page, the text it opened with. Unreviewed first; «تمت المراجعة» marks one done. Admin: Arabic only.
export default function SupportWhatsAppList() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('0');
  const [problem, setProblem] = useState('');
  const [info, setInfo] = useState(false);
  const load = () => adminSupportWhatsApp(filter === '' ? {} : { handled: filter }).then(setData).catch(e => setProblem(apiError(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [filter]);
  const toggle = async row => {
    try { await adminSupportWhatsAppHandled(row.id, !row.handled_at); load(); } catch (e) { setProblem(apiError(e)); }
  };
  const chip = on => `px-3 py-1.5 rounded-pill text-[12.5px] font-bold border ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-200 text-slate-600'}`;
  return (
    <details className="card p-3" open data-testid="support-whatsapp-list">
      <summary className="cursor-pointer font-extrabold text-[15px] flex items-center gap-2">
        <span>🟢 تواصل واتساب مع الدعم</span>
        {data?.unhandled > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[11px]">{data.unhandled}</span>}
      </summary>
      <div className="mt-2 flex items-center gap-1.5">
        <p className="m-0 text-[12.5px] text-slate-500 flex-1">كل ضغطة على أيقونة واتساب الدعم تُحفظ هنا. راجع المحادثة في واتساب ثم علّمها «تمت المراجعة».</p>
        <InfoButton open={info} onToggle={() => setInfo(v => !v)} controls="support-whatsapp-info" label="تواصل واتساب" />
      </div>
      <InfoPanel id="support-whatsapp-info" open={info}>
        {'الأيقونة الخضراء «تواصل مع الدعم الفني» في أسفل كل صفحة وفي صفحة الدعم تفتح واتساب على رقم الدعم المكتوب في «الإعدادات ← عام ← رقم واتساب الدعم»، ومعها رسالة تعريف (الاسم ونوع الحساب، ورابط الصفحة على aykdmh.sa).\nكل ضغطة تُسجَّل هنا: الوقت، وصاحب الحساب إن كان مسجّل الدخول (الاسم والجوال ورقم الحساب)، والصفحة التي ضغط منها، ونص الرسالة. لا يعني التسجيل أن الرسالة أُرسلت فعلًا في واتساب، فقد يغلقه دون إرسال.\n«تمت المراجعة» تنقلها إلى المراجَعة مع اسم من راجعها، ويمكن إرجاعها.'}
      </InfoPanel>
      <div className="flex gap-2 mt-2" role="group" aria-label="الحالة">
        {[['0', 'بانتظار المراجعة'], ['1', 'تمت مراجعتها'], ['', 'الكل']].map(([v, label]) => (
          <button key={v || 'all'} type="button" className={chip(filter === v)} aria-pressed={filter === v} onClick={() => setFilter(v)}>{label}</button>
        ))}
      </div>
      {problem && <p className="text-rose-700 text-[13px] mt-2">{problem}</p>}
      {!data ? <p className="text-[13px] text-slate-500 mt-2">…</p>
        : !data.items.length ? <p className="text-[13px] text-slate-500 mt-2">لا شيء هنا.</p>
          : (
            <ul className="mt-2 space-y-2 list-none p-0 m-0">
              {data.items.map(row => (
                <li key={row.id} className={`rounded-card border p-2.5 ${row.handled_at ? 'border-slate-200 bg-slate-50' : 'border-emerald-300 bg-emerald-50/50'}`} data-testid="support-whatsapp-row">
                  <div className="flex items-center gap-2 flex-wrap text-[13px]">
                    <b>{row.full_name || 'زائر غير مسجّل'}</b>
                    {row.role && <span className="text-slate-500">{row.role === 'provider' ? 'مقدم خدمة' : row.role === 'admin' ? 'إدارة' : 'طالب خدمة'}</span>}
                    {row.referral_code && <span dir="ltr" className="text-slate-500">{row.referral_code}</span>}
                    {row.phone && <a href={`tel:${row.phone}`} dir="ltr" className="text-slate-600">{row.phone}</a>}
                    <span className="ms-auto text-[12px] text-slate-500">{formatRelativeTime(row.created_at)}</span>
                  </div>
                  {row.page && <div className="text-[12px] text-slate-500 mt-0.5">من الصفحة: <Link to={row.page} dir="ltr">{row.page}</Link></div>}
                  {row.message && <p className="m-0 mt-1 text-[12.5px] whitespace-pre-wrap">{row.message}</p>}
                  <div className="flex items-center gap-2 mt-1.5">
                    <button type="button" onClick={() => toggle(row)} className={chip(!row.handled_at)} data-testid="support-whatsapp-toggle">
                      {row.handled_at ? '↩ إرجاعها للمراجعة' : '✓ تمت المراجعة'}
                    </button>
                    {row.handled_at && <span className="text-[12px] text-slate-500">راجعها {row.handled_by_name || '—'} {formatRelativeTime(row.handled_at)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
    </details>
  );
}
