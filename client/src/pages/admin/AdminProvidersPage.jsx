import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listProvidersAdmin, hideProvider, deleteUser } from '../../services/adminService';
import { apiError } from '../../services/api';
import { formatRelativeTime } from '../../utils/formatters';
import { IconSearch } from '../../components/common/Icons';
import { useAdminConfirmation } from '../../components/admin/confirmAdminChange';
import ConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import EmptyState from '../../components/admin/EmptyState';
import AdminListFilters, { VISIBILITY_TABS } from '../../components/admin/AdminListFilters';
import { ProviderStatus } from '../../components/common/AvailabilityBadge';
import RatingInline from '../../components/reviews/RatingInline';

// AYK-361 (the owner: «عرض مقدمي الخدمة، الأحدث بالأعلى، البحث مع فلتر حسب المنطقة والمدينة والمهنة،
// وفيه الكل، مع إمكانية إخفاء أو حذف»). A hidden provider is not listed to people asking for a
// service; their account still works. Deleting removes the account (as in «المستخدمون»).
export default function AdminProvidersPage() {
  const { t } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [filters, setFilters] = useState({ region_id: '', city_id: '', category_id: '', visibility: '' });
  const [confirm, setConfirm] = useState({ open: false });
  const version = useRef(0);

  const load = () => {
    const mine = ++version.current;
    setLoading(true); setError('');
    const picked = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    listProvidersAdmin({ page, limit: 20, search, ...picked })
      .then(res => { if (mine === version.current) { setItems(res.data || []); setMeta(res.meta); } })
      .catch(e => { if (mine === version.current) { setItems([]); setMeta(null); setError(apiError(e)); } })
      .finally(() => { if (mine === version.current) setLoading(false); });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, search, filters]);

  const toggleHidden = async (p) => {
    if (!(await confirmAdminChange(t, p.business_name || p.full_name || ''))) return;
    try { await hideProvider(p.id, !p.hidden_at); load(); } catch (e) { setError(apiError(e)); }
  };
  const askDelete = (p) => setConfirm({
    open: true, tone: 'danger', title: 'حذف مقدم الخدمة',
    body: `سيُحذف حساب «${p.full_name || p.business_name || p.id}» نهائيًا من الموقع. للإخفاء دون حذف استعمل «إخفاء».`,
    onConfirm: async () => {
      try { await deleteUser(p.id); } catch (e) { setError(apiError(e)); }
      setConfirm({ open: false }); load();
    },
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader title="مقدمو الخدمة" count={meta?.pagination?.total} />
      {error && <div role="alert" className="text-rose-700 text-[13px]">{error}</div>}

      <div className="bg-white rounded-card border border-slate-100 p-4 md:p-5 space-y-3 shadow-soft">
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchValue); }} className="relative">
          <span className="absolute inset-y-0 right-3 grid place-items-center text-slate-400 pointer-events-none"><IconSearch size={16} /></span>
          <input type="search" value={searchValue} onChange={e => setSearchValue(e.target.value)}
            placeholder="بحث: الاسم، الرقم، الجوال، اسم النشاط" data-testid="providers-search"
            className="w-full pr-9 pl-3 py-2.5 rounded-pill border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[13.5px]" />
        </form>
        <AdminListFilters value={filters} onChange={next => { setFilters(next); setPage(1); }} />
        <div className="flex gap-1.5">
          {VISIBILITY_TABS.map(tab => (
            <button key={tab.value} type="button" onClick={() => { setFilters(f => ({ ...f, visibility: tab.value })); setPage(1); }}
              className={`px-3 py-1.5 rounded-pill text-[12px] font-semibold border transition ${filters.visibility === tab.value ? 'bg-ink text-white border-ink' : 'bg-white text-slate-600 border-slate-200'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[130px] rounded-card bg-white border border-slate-100 animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-card border border-slate-100"><EmptyState icon="🧰" title={t('admin.no_results')} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="providers-list">
          {items.map(p => (
            <div key={p.id} className="bg-white rounded-card border border-slate-100 p-4 hover:border-brand-300 transition">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to={`/providers/${p.id}`} className="font-extrabold text-ink text-[15px] hover:text-brand-700">{p.business_name || p.full_name || '—'}</Link>
                  {p.business_name && p.full_name && <div className="text-[12px] text-slate-500">{p.full_name}</div>}
                </div>
                <span className="text-[10.5px] text-slate-400 shrink-0">{formatRelativeTime(p.created_at)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2 text-[11px]">
                {p.referral_code && <span className="px-2 py-0.5 rounded-pill bg-slate-100 text-slate-700 font-bold">رقم {p.referral_code}</span>}
                {p.category_name && <span className="px-2 py-0.5 rounded-pill bg-brand-50 text-brand-700 font-bold">{p.category_name}</span>}
                {Number(p.also_client) === 1 && <span className="px-2 py-0.5 rounded-pill bg-sky-50 text-sky-700 font-bold">طالب ومقدم</span>}
                {p.hidden_at && <span className="px-2 py-0.5 rounded-pill bg-slate-800 text-white font-bold">🙈 مخفي</span>}
                {Number(p.is_blocked) === 1 && <span className="px-2 py-0.5 rounded-pill bg-rose-50 text-rose-700 font-bold">محظور</span>}
                {Number(p.is_active) !== 1 && <span className="px-2 py-0.5 rounded-pill bg-amber-50 text-amber-700 font-bold">غير نشط</span>}
              </div>
              <div className="text-[12px] text-slate-500 mt-2">
                {[p.region_name, p.city_name, p.district_name].filter(Boolean).join(' · ') || '—'}
                {p.phone && <span dir="ltr" className="ms-2">{p.phone}</span>}
              </div>
              {/* AYK-366: available by their schedule (with the schedule), in the app now, and coverage. */}
              <ProviderStatus availability={p.availability} coverage={p.coverage} name={p.business_name || p.full_name} className="mt-2" />
              <div className="text-[11.5px] text-slate-500 mt-1">
                {Number(p.rating_count) > 0 && <><RatingInline size={12} average={p.rating_avg} count={p.rating_count} /> · </>}منجز {Number(p.completed_orders || 0)}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => toggleHidden(p)} data-testid="toggle-provider-hidden"
                  className="px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition">
                  {p.hidden_at ? '👁️ إظهار' : '🙈 إخفاء'}
                </button>
                <button type="button" onClick={() => askDelete(p)}
                  className="px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition">
                  {t('admin.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {meta?.pagination && (meta.pagination.hasPrev || meta.pagination.hasNext) && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!meta.pagination.hasPrev} className="px-4 py-2 rounded-pill border border-slate-200 bg-white text-[13px] disabled:opacity-50">السابق</button>
          <button onClick={() => setPage(p => p + 1)} disabled={!meta.pagination.hasNext} className="px-4 py-2 rounded-pill border border-slate-200 bg-white text-[13px] disabled:opacity-50">التالي</button>
        </div>
      )}
      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
    </div>
  );
}
