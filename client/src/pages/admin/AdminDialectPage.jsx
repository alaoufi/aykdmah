import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import RowMenu from '../../components/admin/RowMenu';
import EmptyState from '../../components/admin/EmptyState';
import api, { apiError } from '../../services/api';
import { listCategories, listServices } from '../../services/serviceService';
import { localizedName } from '../../utils/localize';

// AYK-420 (the owner: «اجعله يتعلم من لهجات المستخدمين»). The words «اكتب طلبك بلهجتك» learned from
// published requests: each word, the profession it was mostly used for, in how many requests, and
// whether the site uses it. The owner approves a word (optionally for another profession) or blocks it.
const STATUS = {
  learned: { text: 'يفهمها الموقع', cls: 'bg-emerald-50 text-emerald-700' },
  approved: { text: 'معتمدة منك', cls: 'bg-brand-50 text-brand-700' },
  learning: { text: 'يتعلّمها', cls: 'bg-slate-100 text-slate-600' },
  blocked: { text: 'محظورة', cls: 'bg-rose-50 text-rose-700' },
};
const FILTERS = [['used', 'يفهمها'], ['learning', 'يتعلّمها'], ['blocked', 'محظورة'], ['all', 'الكل']];

export default function AdminDialectPage() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [filter, setFilter] = useState('used');
  const [search, setSearch] = useState('');
  const [problem, setProblem] = useState('');
  const [moving, setMoving] = useState(null); // { term, category_id, service_id }
  const load = () => api.get('/admin/dialect-terms').then(({ data: res }) => setData(res.data)).catch(err => setProblem(apiError(err)));
  useEffect(() => {
    load();
    listCategories().then(rows => setCategories(rows || [])).catch(() => {});
    listServices().then(rows => setServices(rows || [])).catch(() => {});
  }, []);
  const nameOf = (list, id) => { const row = list.find(r => Number(r.id) === Number(id)); return row ? localizedName(row, lang) : '—'; };
  const setFlag = async (term, body) => {
    setProblem('');
    try { await api.put(`/admin/dialect-terms/${encodeURIComponent(term)}`, body); setMoving(null); await load(); } catch (err) { setProblem(apiError(err)); }
  };
  const rows = useMemo(() => (data?.terms || [])
    .filter(row => (filter === 'all' ? true : filter === 'used' ? row.learned : filter === 'blocked' ? row.status === 'blocked' : !row.learned && row.status !== 'blocked'))
    .filter(row => !search.trim() || row.term.includes(search.trim()))
    .sort((a, b) => b.total - a.total || a.term.localeCompare(b.term, 'ar')), [data, filter, search]);

  return (
    <div className="space-y-3 max-w-3xl" data-testid="dialect-page">
      <AdminPageHeader title="كلمات اللهجة" count={data?.terms?.length} />
      <div className="rounded-card bg-slate-50 border border-slate-200 p-3 text-[12.5px] text-slate-700 leading-relaxed">
        يتعلّم الموقع من كل طلب يُنشر: يحفظ جذور كلماته مع المهنة التي نُشر فيها، دون النص ودون صاحبه.
        إذا تكررت كلمة في {data?.min_hits ?? 3} طلبات على الأقل، وكان {Math.round((data?.share ?? 0.7) * 100)}% منها لمهنة واحدة، صار «اكتب طلبك بلهجتك» يفهمها لهذه المهنة.
        تستطيع من ⋮ اعتماد كلمة الآن (ولو لمهنة أخرى) أو حظرها.
      </div>
      {problem && <div role="alert" className="text-rose-700 text-[13px]">{problem}</div>}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([key, text]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key}
            className={`px-2.5 py-1 rounded-pill border text-[12.5px] font-semibold ${filter === key ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600'}`}>{text}</button>
        ))}
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن كلمة"
          className="flex-1 min-w-[140px] px-3 py-1.5 rounded-card border border-slate-200 text-[13px]" aria-label="ابحث عن كلمة" />
      </div>
      {!data ? <div className="h-32 rounded-card bg-slate-100 animate-pulse" />
        : rows.length === 0 ? <div className="bg-white rounded-card border border-slate-100"><EmptyState icon="🗣️" title="لا كلمات هنا بعد" /></div>
          : (
            <div className="bg-white rounded-card border border-slate-100 shadow-soft divide-y divide-slate-100" data-testid="dialect-list">
              {rows.map(row => {
                const status = STATUS[row.status] || STATUS.learning;
                return (
                  <div key={row.term} data-testid="dialect-row">
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="font-bold text-[14px] text-ink">{row.term}</span>
                        <span className="ms-2 text-[12px] text-slate-600">→ 🛠️ {nameOf(categories, row.category_id)}{row.service_id ? ` · ${nameOf(services, row.service_id)}` : ''}</span>
                        <span className="block text-[11px] text-slate-500">{row.total} طلب · {Math.round(row.share * 100)}% لهذه المهنة</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded-pill text-[11px] font-bold shrink-0 ${status.cls}`}>{status.text}</span>
                      <RowMenu label={`خيارات ${row.term}`} items={[
                        { label: 'اعتمدها لهذه المهنة', icon: '✅', hidden: row.status === 'approved' || !row.category_id, onClick: () => setFlag(row.term, { status: 'approved', category_id: row.category_id, service_id: row.service_id }) },
                        { label: 'اعتمدها لمهنة أخرى', icon: '🔀', onClick: () => setMoving({ term: row.term, category_id: row.category_id || '', service_id: '' }) },
                        { label: 'احظرها', icon: '⛔', danger: true, hidden: row.status === 'blocked', onClick: () => setFlag(row.term, { status: 'blocked' }) },
                        { label: 'أرجعها للتعلّم التلقائي', icon: '↩', hidden: !['approved', 'blocked'].includes(row.status), onClick: () => setFlag(row.term, { status: 'clear' }) },
                      ]} />
                    </div>
                    {moving?.term === row.term && (
                      <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
                        <select className="select text-[13px] max-w-[45%]" value={moving.category_id} aria-label="المهنة"
                          onChange={e => setMoving({ ...moving, category_id: e.target.value, service_id: '' })}>
                          <option value="">اختر المهنة</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{localizedName(c, lang)}</option>)}
                        </select>
                        <select className="select text-[13px] max-w-[45%]" value={moving.service_id} aria-label="الخدمة (اختياري)" disabled={!moving.category_id}
                          onChange={e => setMoving({ ...moving, service_id: e.target.value })}>
                          <option value="">الخدمة (اختياري)</option>
                          {services.filter(s => Number(s.category_id) === Number(moving.category_id)).map(s => <option key={s.id} value={s.id}>{localizedName(s, lang)}</option>)}
                        </select>
                        <button type="button" className="btn btn-primary btn-sm" disabled={!moving.category_id}
                          onClick={() => setFlag(row.term, { status: 'approved', category_id: moving.category_id, service_id: moving.service_id || null })}>اعتماد</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMoving(null)}>إلغاء</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
    </div>
  );
}
