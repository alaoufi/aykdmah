import { useEffect, useState } from 'react';
import { listAdCampaigns, createAdCampaign, updateAdCampaign, deleteAdCampaign, getAdReport, downloadAdReportCsv } from '../../services/adminService';
import { apiError } from '../../services/api';
import { askConfirm } from '../common/AppDialog';

// AYK-409: «الحملات» and «التقارير» of the ads page (the administration is in Arabic).
const STATUS = { active: '🟢 نشطة', paused: '⏸ موقوفة', ended: '⏹ منتهية' };
const EMPTY = { name: '', advertiser: '', status: 'active', starts_at: '', ends_at: '', max_views: '', daily_max_views: '', notes: '' };
const field = 'w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white text-[14px]';
const num = v => Number(v || 0).toLocaleString('ar-SA-u-nu-latn');

export function CampaignsPanel({ onChanged }) {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => listAdCampaigns().then(setRows).catch(e => { setRows([]); setMsg({ bad: true, text: apiError(e) }); });
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!form.name.trim()) { setMsg({ bad: true, text: 'اكتب اسم الحملة.' }); return; }
    if (form.starts_at && form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) { setMsg({ bad: true, text: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.' }); return; }
    const payload = { ...form, max_views: form.max_views || null, daily_max_views: form.daily_max_views || null,
      starts_at: form.starts_at ? form.starts_at.replace('T', ' ') + ':00' : null, ends_at: form.ends_at ? form.ends_at.replace('T', ' ') + ':00' : null };
    delete payload.id;
    try {
      if (form.id) await updateAdCampaign(form.id, payload); else await createAdCampaign(payload);
      setForm(null); setMsg({ text: '✅ تم حفظ الحملة.' }); load(); onChanged?.();
    } catch (e) { setMsg({ bad: true, text: apiError(e) }); }
  };
  const setStatus = async (c, status) => { try { await updateAdCampaign(c.id, { status }); load(); onChanged?.(); } catch (e) { setMsg({ bad: true, text: apiError(e) }); } };
  const remove = async c => {
    if (!(await askConfirm({ title: `حذف الحملة «${c.name}»؟`, message: 'إعلاناتها تبقى وتخرج من الحملة.', confirmText: 'حذف', danger: true }))) return;
    try { await deleteAdCampaign(c.id); load(); onChanged?.(); } catch (e) { setMsg({ bad: true, text: apiError(e) }); }
  };
  const edit = c => setForm({ ...EMPTY, ...Object.fromEntries(Object.entries(c).filter(([k]) => k in EMPTY || k === 'id').map(([k, v]) => [k, v ?? ''])),
    starts_at: c.starts_at ? String(c.starts_at).slice(0, 16) : '', ends_at: c.ends_at ? String(c.ends_at).slice(0, 16) : '' });
  return (
    <div className="space-y-3" data-testid="ad-campaigns">
      <div className="rounded-card bg-slate-50 border border-slate-200 p-3 text-[12.5px] text-slate-700 leading-relaxed">
        الحملة تجمع إعلانات معلن واحد تحت مدة واحدة وحد مشاهدات واحد (كلي ويومي). إيقاف الحملة يوقف كل إعلاناتها.
        ضع الإعلان في حملته من نافذة تعديل الإعلان («إعدادات العرض»).
      </div>
      {msg && <div className={`px-3 py-2 rounded-card text-[13px] font-semibold ${msg.bad ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`} role="status">{msg.text}</div>}
      {!form && <button type="button" onClick={() => { setMsg(null); setForm({ ...EMPTY }); }} className="px-4 py-2 rounded-pill bg-brand-600 text-white text-[13px] font-bold" data-testid="campaign-new">+ حملة جديدة</button>}
      {form && (
        <div className="rounded-card border-2 border-brand-300 bg-white p-3 space-y-2" data-testid="campaign-form">
          <b className="text-[14px]">{form.id ? 'تعديل الحملة' : 'حملة جديدة'}</b>
          <label className="block text-[12px] font-bold">اسم الحملة *<input className={field} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={150} data-testid="campaign-name" /></label>
          <label className="block text-[12px] font-bold">المعلن<input className={field} value={form.advertiser} onChange={e => setForm({ ...form, advertiser: e.target.value })} maxLength={150} /></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block text-[12px] font-bold">تبدأ<input type="datetime-local" className={field} value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} /></label>
            <label className="block text-[12px] font-bold">تنتهي<input type="datetime-local" className={field} value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} /></label>
            <label className="block text-[12px] font-bold">حد المشاهدات الكلي (اختياري)<input type="number" min="1" className={field} value={form.max_views} onChange={e => setForm({ ...form, max_views: e.target.value })} /></label>
            <label className="block text-[12px] font-bold">حد المشاهدات في اليوم (اختياري)<input type="number" min="1" className={field} value={form.daily_max_views} onChange={e => setForm({ ...form, daily_max_views: e.target.value })} /></label>
          </div>
          <label className="block text-[12px] font-bold">الحالة
            <select className={field} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block text-[12px] font-bold">ملاحظات<textarea rows={2} className={field} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} maxLength={2000} /></label>
          <div className="flex gap-2">
            <button type="button" onClick={save} className="px-4 py-2 rounded-pill bg-emerald-600 text-white text-[13px] font-bold" data-testid="campaign-save">حفظ</button>
            <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-pill bg-white border border-slate-300 text-[13px] font-bold">إلغاء</button>
          </div>
        </div>
      )}
      {rows === null ? <div className="h-20 rounded bg-slate-100 animate-pulse" /> : rows.length === 0 ? <p className="text-[13px] text-slate-500">لا توجد حملات بعد.</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map(c => (
            <div key={c.id} className="rounded-card border border-slate-200 bg-white p-3 space-y-1.5" data-testid="campaign-card">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <b className="text-[14.5px]">📁 {c.name}</b>
                <span className="text-[12px] font-bold">{STATUS[c.status] || c.status}</span>
              </div>
              {c.advertiser && <div className="text-[12px] text-slate-600">المعلن: {c.advertiser}</div>}
              <div className="text-[12.5px] text-slate-700">
                {num(c.ads_count)} إعلان · 👁 {num(c.views)}{c.max_views ? ` / ${num(c.max_views)}` : ''} · 👆 {num(c.clicks)} · نسبة النقر {c.ctr}% · اليوم {num(c.views_today)}{c.daily_max_views ? ` / ${num(c.daily_max_views)}` : ''}
              </div>
              <div className="flex gap-1.5 flex-wrap pt-1">
                <button type="button" onClick={() => edit(c)} className="px-3 py-1 rounded-pill text-[11.5px] font-semibold bg-slate-100">✏️ تعديل</button>
                {c.status === 'active'
                  ? <button type="button" onClick={() => setStatus(c, 'paused')} className="px-3 py-1 rounded-pill text-[11.5px] font-semibold bg-amber-50 text-amber-700">⏸ إيقاف الحملة</button>
                  : <button type="button" onClick={() => setStatus(c, 'active')} className="px-3 py-1 rounded-pill text-[11.5px] font-semibold bg-emerald-50 text-emerald-700">▶ تنشيط الحملة</button>}
                <button type="button" onClick={() => remove(c)} className="px-3 py-1 rounded-pill text-[11.5px] font-semibold bg-rose-50 text-rose-700">🗑 حذف</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReportsPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const [q, setQ] = useState({ from: monthAgo, to: today, campaign_id: '' });
  const [campaigns, setCampaigns] = useState([]);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { listAdCampaigns().then(setCampaigns).catch(() => {}); }, []);
  useEffect(() => {
    setData(null); setErr('');
    getAdReport({ from: q.from, to: q.to, ...(q.campaign_id ? { campaign_id: q.campaign_id } : {}) }).then(setData).catch(e => { setErr(apiError(e)); setData({ ads: [], total: { views: 0, clicks: 0, ctr: 0 } }); });
  }, [q]);
  const download = async () => {
    try {
      const blob = await downloadAdReportCsv({ from: q.from, to: q.to, ...(q.campaign_id ? { campaign_id: q.campaign_id } : {}) });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = `ads-report-${q.from}-${q.to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setErr(apiError(e)); }
  };
  const best = data?.ads?.[0];
  return (
    <div className="space-y-3" data-testid="ad-reports">
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-[12px] font-bold">من<input type="date" className={field} value={q.from} max={q.to} onChange={e => setQ({ ...q, from: e.target.value })} /></label>
        <label className="text-[12px] font-bold">إلى<input type="date" className={field} value={q.to} min={q.from} onChange={e => setQ({ ...q, to: e.target.value })} /></label>
        <label className="text-[12px] font-bold">الحملة
          <select className={field} value={q.campaign_id} onChange={e => setQ({ ...q, campaign_id: e.target.value })}>
            <option value="">كل الإعلانات</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={download} className="px-4 py-2 rounded-pill bg-brand-600 text-white text-[13px] font-bold" data-testid="report-csv">⬇️ تنزيل التقرير (Excel)</button>
      </div>
      {err && <div className="px-3 py-2 rounded-card bg-rose-50 text-rose-700 text-[13px]">{err}</div>}
      {!data ? <div className="h-24 rounded bg-slate-100 animate-pulse" /> : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['👁 المشاهدات', num(data.total.views)], ['👆 النقرات', num(data.total.clicks)], ['📈 نسبة النقر', `${data.total.ctr}%`]].map(([l, v]) => (
              <div key={l} className="rounded-card bg-white border border-slate-200 p-2"><div className="text-[11.5px] text-slate-500">{l}</div><div className="text-[17px] font-extrabold">{v}</div></div>
            ))}
          </div>
          {best && data.ads.length > 1 && <p className="m-0 text-[12.5px] text-emerald-800 bg-emerald-50 rounded-card px-3 py-2">🏆 الأفضل أداءً: «{best.title}» بنسبة نقر {best.ctr}%. يمكنك رفع وزنه أو إيقاف الأضعف.</p>}
          {data.ads.length === 0 ? <p className="text-[13px] text-slate-500">لا مشاهدات في هذه المدة.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-[12.5px]">
              <thead><tr className="text-slate-500 text-start"><th className="text-start p-1.5">الإعلان</th><th className="p-1.5">الحملة</th><th className="p-1.5">المشاهدات</th><th className="p-1.5">النقرات</th><th className="p-1.5">نسبة النقر</th></tr></thead>
              <tbody>{data.ads.map(a => (
                <tr key={a.ad_id} className="border-t border-slate-100"><td className="p-1.5 font-semibold">{a.title}</td><td className="p-1.5 text-center">{a.campaign_name || '—'}</td><td className="p-1.5 text-center">{num(a.views)}</td><td className="p-1.5 text-center">{num(a.clicks)}</td><td className="p-1.5 text-center font-bold">{a.ctr}%</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </>
      )}
    </div>
  );
}
