import { useTranslation } from 'react-i18next';

// Where each ad placement appears (AYK-159): small drawings of the app's pages, the chosen
// places filled in. Used when pricing, choosing and editing ads, so nobody has to guess what
// "under the hero" or "chat sidebar" means.
//   selected: the placements to fill in (all of them when `all` is set)
const PAGES = [
  { key: 'home', blocks: ['home_top', '@hero', 'home_hero', '@content', 'home_middle', '@content', 'home_bottom', 'footer'] },
  { key: 'services', blocks: ['services_top', '@content', '@content', 'services_bottom'] },
  { key: 'category', blocks: ['category_top', '@content', '@content', 'category_bottom'] },
  { key: 'request', blocks: ['request_details_top', '@content', '@content', 'request_details_bottom'] },
  { key: 'search', blocks: ['search', '@content', '@content'] },
  { key: 'profile', blocks: ['profile_top', '@content', '@content'] },
  { key: 'chat', blocks: ['chat_sidebar', '@content', '@content'] },
  { key: 'dashboard', blocks: ['sidebar', '@content', '@content'] },
];

export default function AdPlacementMap({ selected = [], all = false, onToggle }) {
  const { t } = useTranslation();
  const on = (p) => all || selected.includes(p);
  const pages = all ? PAGES : PAGES.filter((page) => page.blocks.some(on));
  if (!pages.length) return null;
  return (
    <div className="rounded-card border border-slate-200 bg-slate-50 p-3" data-testid="ad-placement-map">
      <div className="text-[12.5px] font-extrabold text-ink mb-1">🗺️ {t('promote.map_title')}</div>
      <p className="text-[11.5px] text-slate-500 mt-0 mb-3">{t('promote.map_hint')}</p>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {pages.map((page) => (
          <figure key={page.key} className="m-0 shrink-0 w-[118px]">
            <div className="rounded-[14px] border-2 border-slate-300 bg-white p-1.5 space-y-1 min-h-[170px]">
              <div className="h-2 rounded bg-slate-200" aria-hidden="true" />
              {page.blocks.map((block, index) => {
                if (block === '@hero') return <div key={index} className="h-7 rounded bg-slate-200 grid place-items-center text-[8.5px] text-slate-500">{t('promote.map_hero')}</div>;
                if (block === '@content') return <div key={index} className="space-y-0.5" aria-hidden="true"><div className="h-1.5 rounded bg-slate-100" /><div className="h-1.5 w-2/3 rounded bg-slate-100" /></div>;
                const lit = on(block);
                const label = t(`admin.ad_placement_${block}`);
                const cls = `w-full rounded px-1 py-1 text-[8.5px] leading-tight font-bold text-center border ${
                  lit ? 'bg-brand-500 text-white border-brand-600' : 'bg-white text-slate-400 border-dashed border-slate-300'}`;
                return onToggle
                  ? <button key={index} type="button" onClick={() => onToggle(block)} className={cls} aria-pressed={lit} title={label}>{label}</button>
                  : <div key={index} className={cls} title={label}>{label}</div>;
              })}
            </div>
            <figcaption className="text-center text-[11px] font-bold text-slate-600 mt-1">{t(`promote.page_${page.key}`)}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
