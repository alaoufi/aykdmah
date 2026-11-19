import { useTranslation } from 'react-i18next';
// Tiny dependency-free chart: side-by-side bar pairs (views + clicks)
// per day. Daily array is whatever the /api/ads/:id/stats endpoint
// returns — { day, views_count, clicks_count }[].
export default function AdSparkline({ daily, height = 96 }) {
  const { t } = useTranslation();
  if (!daily || daily.length === 0) return null;
  const maxView = Math.max(1, ...daily.map((d) => d.views_count || 0));
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {daily.map((d) => {
          const vh = ((d.views_count  || 0) / maxView) * 100;
          const ch = d.views_count > 0
            ? ((d.clicks_count || 0) / d.views_count) * 100
            : 0;
          return (
            <div key={d.day} className="flex-1 flex flex-col-reverse items-stretch group relative"
              title={`${d.day}\n${t('promote.stat_views')}: ${d.views_count} • ${t('promote.stat_clicks')}: ${d.clicks_count}`}>
              <div className="rounded-t bg-brand-200 transition" style={{ height: `${vh}%` }} />
              <div className="rounded-t bg-emerald-500 -mb-px transition" style={{ height: `${(vh * ch) / 100}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[10.5px] text-slate-400 mt-1">
        <span>{daily[0].day}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><i className="inline-block w-2 h-2 rounded-sm bg-brand-200" /> {t('promote.stat_views')}</span>
          <span className="flex items-center gap-1"><i className="inline-block w-2 h-2 rounded-sm bg-emerald-500" /> {t('promote.stat_clicks')}</span>
        </span>
        <span>{daily[daily.length - 1].day}</span>
      </div>
    </div>
  );
}
