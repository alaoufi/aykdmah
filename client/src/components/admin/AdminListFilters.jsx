import { useEffect, useState } from 'react';
import { adminListRegions, adminListCities, listCategoriesAdmin } from '../../services/adminService';

// AYK-361 (the owner: «تفلتر حسب المنطقة والمدينة والمهنة المطلوبة، وفيه الكل»): the shared filters
// of the administration's requests and providers lists. Every box starts at «الكل». The admin area
// is Arabic only (AYK-295).
export const VISIBILITY_TABS = [
  { value: '', label: 'الكل' },
  { value: 'shown', label: 'الظاهرة' },
  { value: 'hidden', label: 'المخفية' },
];

// AYK-415: a short line under each filter (they only narrow the list, so no (i) is needed).
const Short = ({ children }) => <span className="block text-[12px] text-slate-500 mb-1 leading-snug" data-testid="field-short">{children}</span>;

const selectClass = 'w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[13.5px]';

export default function AdminListFilters({ value, onChange, professionLabel = 'المهنة' }) {
  const [regions, setRegions] = useState([]);
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    adminListRegions().then(rows => setRegions(Array.isArray(rows) ? rows : [])).catch(() => setRegions([]));
    listCategoriesAdmin().then(rows => setCategories(Array.isArray(rows) ? rows : [])).catch(() => setCategories([]));
  }, []);
  useEffect(() => {
    let active = true;
    if (!value.region_id) { setCities([]); return () => { active = false; }; }
    adminListCities({ region_id: value.region_id })
      .then(rows => { if (active) setCities(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (active) setCities([]); });
    return () => { active = false; };
  }, [value.region_id]);

  const set = patch => onChange({ ...value, ...patch });
  const byName = (a, b) => String(a.name_ar || '').localeCompare(String(b.name_ar || ''), 'ar');
  const parents = categories.filter(c => !c.parent_id).sort(byName);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" data-testid="admin-list-filters">
      <label className="block">
        <span className="block text-[11.5px] font-bold text-slate-500">المنطقة</span>
        <Short>يعرض ما يخص هذه المنطقة فقط، و«الكل» لكل المناطق.</Short>
        <select value={value.region_id || ''} onChange={e => set({ region_id: e.target.value, city_id: '' })} className={selectClass} data-testid="filter-region">
          <option value="">الكل</option>
          {[...regions].sort(byName).map(r => <option key={r.id} value={r.id}>{r.name_ar}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="block text-[11.5px] font-bold text-slate-500">المدينة</span>
        <Short>تُختار بعد المنطقة، فيضيق العرض إلى مدينة واحدة.</Short>
        <select value={value.city_id || ''} onChange={e => set({ city_id: e.target.value })} disabled={!value.region_id} className={`${selectClass} disabled:opacity-60`} data-testid="filter-city">
          <option value="">{value.region_id ? 'الكل' : 'اختر المنطقة أولًا'}</option>
          {[...cities].sort(byName).map(c => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="block text-[11.5px] font-bold text-slate-500">{professionLabel}</span>
        <Short>يعرض ما يخص هذه المهنة أو إحدى خدماتها فقط.</Short>
        <select value={value.category_id || ''} onChange={e => set({ category_id: e.target.value })} className={selectClass} data-testid="filter-category">
          <option value="">الكل</option>
          {parents.map(c => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
        </select>
      </label>
    </div>
  );
}
