import { useEffect, useId, useState } from 'react';
import { listAdCampaigns, createAdCampaign, updateAdCampaign, deleteAdCampaign, getAdReport, downloadAdReportCsv } from '../../services/adminService';
import { apiError } from '../../services/api';
import { askConfirm } from '../common/AppDialog';
import { InfoButton, InfoPanel } from '../common/InfoTip';

// AYK-409: «الحملات» and «التقارير» of the ads page (the administration is in Arabic).
const STATUS = { active: '🟢 نشطة', paused: '⏸ موقوفة', ended: '⏹ منتهية' };
const EMPTY = { name: '', advertiser: '', status: 'active', starts_at: '', ends_at: '', max_views: '', daily_max_views: '', notes: '' };
const field = 'w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white text-[14px]';
const num = v => Number(v || 0).toLocaleString('ar-SA-u-nu-latn');

// AYK-415: a field's name, a short line under it, and (i) beside it that opens the full
// explanation in place. Used by the ads and plans pages (the administration is in Arabic). `check` puts a
// checkbox inside the name, for a choice that is ticked on or off.
export function FieldHelp({ label, short, info, htmlFor, check, className = 'block text-[12px] font-bold text-ink' }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const Tag = htmlFor ? 'label' : 'span';
  return (
    <div className="mb-1">
      <span className="flex items-center gap-1.5">
        {check
          ? <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">{check}<span>{label}</span></label>
          : <Tag htmlFor={htmlFor} className={className}>{label}</Tag>}
        {info && <InfoButton open={open} onToggle={() => setOpen(v => !v)} controls={panelId} label={typeof label === 'string' ? label : ''} />}
      </span>
      {short && <div className="text-[12px] text-slate-500 mt-0.5 leading-snug" data-testid="field-short">{short}</div>}
      {info && <InfoPanel id={panelId} open={open}>{info}</InfoPanel>}
    </div>
  );
}

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
          <div>
            <FieldHelp htmlFor="campaign-f-name" label="اسم الحملة *" short="اسم تعرف به الحملة، يظهر لك في قائمة «الحملة» داخل نافذة الإعلان وفي التقارير."
              info="اسم للإدارة فقط ولا يراه الزوار. تختار به الحملة عند تعديل أي إعلان، وتصفّي به التقارير. الخانة مطلوبة، حتى 150 حرفًا. مثال: «عروض الصيف - شركة النور»." />
            <input id="campaign-f-name" className={field} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={150} data-testid="campaign-name" />
          </div>
          <div>
            <FieldHelp htmlFor="campaign-f-advertiser" label="المعلن" short="اسم صاحب الإعلانات، للتذكير فقط، يظهر على بطاقة الحملة هنا."
              info="لا يغيّر شيئًا في عرض الإعلانات ولا يراه الزوار، بل يظهر على بطاقة الحملة في هذه الصفحة. حتى 150 حرفًا. مثال: «مؤسسة النور للتكييف». يمكن تركه فارغًا." />
            <input id="campaign-f-advertiser" className={field} value={form.advertiser} onChange={e => setForm({ ...form, advertiser: e.target.value })} maxLength={150} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <FieldHelp htmlFor="campaign-f-starts" label="تبدأ" short="قبل هذا الموعد لا يظهر أي إعلان من إعلانات الحملة. فارغ = تبدأ فورًا."
                info="تاريخ وساعة بداية الحملة. كل إعلان داخل الحملة لا يُعرض للزوار قبل هذا الموعد، حتى لو كان الإعلان نفسه نشطًا. إن تُرك فارغًا تعمل الحملة من الآن." />
              <input id="campaign-f-starts" type="datetime-local" className={field} value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} />
            </div>
            <div>
              <FieldHelp htmlFor="campaign-f-ends" label="تنتهي" short="بعد هذا الموعد تتوقف كل إعلانات الحملة عن الظهور. فارغ = بلا نهاية."
                info="تاريخ وساعة نهاية الحملة، ويجب أن يكون بعد موعد البداية. بعده لا يظهر أي إعلان من إعلانات الحملة. إن تُرك فارغًا تستمر الحملة حتى توقفها بنفسك." />
              <input id="campaign-f-ends" type="datetime-local" className={field} value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} />
            </div>
            <div>
              <FieldHelp htmlFor="campaign-f-max" label="حد المشاهدات الكلي (اختياري)" short="مجموع مشاهدات كل إعلانات الحملة، إذا بلغه تتوقف إعلاناتها. فارغ = بلا حد."
                info="عدد صحيح من 1 فأكثر. تُجمع مشاهدات كل إعلانات الحملة منذ بدايتها، فإذا بلغ المجموع هذا الرقم توقفت إعلانات الحملة عن الظهور. مثال: 50000. إن تُرك فارغًا فلا حد للحملة (ويبقى حد كل إعلان وحده إن وُجد)." />
              <input id="campaign-f-max" type="number" min="1" className={field} value={form.max_views} onChange={e => setForm({ ...form, max_views: e.target.value })} />
            </div>
            <div>
              <FieldHelp htmlFor="campaign-f-daily" label="حد المشاهدات في اليوم (اختياري)" short="إذا بلغت مشاهدات الحملة اليوم هذا الرقم تتوقف إعلاناتها حتى الغد. فارغ = بلا حد."
                info="عدد صحيح من 1 فأكثر. تُجمع مشاهدات اليوم لكل إعلانات الحملة، فإذا بلغت الرقم اختفت إعلاناتها بقية اليوم وعادت في اليوم التالي. مثال: 2000. إن تُرك فارغًا فلا حد يومي." />
              <input id="campaign-f-daily" type="number" min="1" className={field} value={form.daily_max_views} onChange={e => setForm({ ...form, daily_max_views: e.target.value })} />
            </div>
          </div>
          <div>
            <FieldHelp htmlFor="campaign-f-status" label="الحالة" short="الإعلانات لا تظهر إلا والحملة «نشطة»؛ الموقوفة والمنتهية توقف كل إعلاناتها."
              info="«نشطة»: تظهر إعلانات الحملة ضمن مدتها وحدودها. «موقوفة» أو «منتهية»: لا يظهر أي إعلان فيها، والفرق بينهما للتوضيح فقط. يمكنك أيضًا الإيقاف والتنشيط من زر البطاقة مباشرة." />
            <select id="campaign-f-status" className={field} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <FieldHelp htmlFor="campaign-f-notes" label="ملاحظات" short="ملاحظات داخلية للإدارة، لا يراها المعلن ولا الزوار."
              info="اكتب ما تريد تذكّره عن الحملة، مثل الاتفاق مع المعلن أو رقم الفاتورة. لا تظهر في الموقع ولا تغيّر العرض. حتى 2000 حرف، ويمكن تركها فارغة." />
            <textarea id="campaign-f-notes" rows={2} className={field} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} maxLength={2000} />
          </div>
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
        <div>
          <FieldHelp htmlFor="report-from" label="من" short="أول يوم تُحسب منه المشاهدات والنقرات." />
          <input id="report-from" type="date" className={field} value={q.from} max={q.to} onChange={e => setQ({ ...q, from: e.target.value })} />
        </div>
        <div>
          <FieldHelp htmlFor="report-to" label="إلى" short="آخر يوم يدخل في التقرير." />
          <input id="report-to" type="date" className={field} value={q.to} min={q.from} onChange={e => setQ({ ...q, to: e.target.value })} />
        </div>
        <div>
          <FieldHelp htmlFor="report-campaign" label="الحملة" short="اعرض إعلانات حملة واحدة، أو كل الإعلانات." />
          <select id="report-campaign" className={field} value={q.campaign_id} onChange={e => setQ({ ...q, campaign_id: e.target.value })}>
            <option value="">كل الإعلانات</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
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
