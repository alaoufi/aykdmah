import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { listCategories, getAreaStats } from '../../services/serviceService';
import { CATEGORIES } from '../../data/servicesCatalog';
import { localizedName, tx } from '../../utils/localize';

// Every profession on the platform (AYK-036): a dropdown to jump to one, and a card per
// profession with what helps a requester decide — how many providers serve their area,
// how many are available now or featured, their average rating and the open requests.
export default function ProfessionsSection({ query = '' }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const navigate = useNavigate();
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => { listCategories().then(setCategories).catch(() => {}); }, []);
  useEffect(() => { if (user) getAreaStats().then(setStats).catch(() => setStats(null)); }, [user?.id]);

  const byCategory = new Map((stats?.categories || []).map(row => [Number(row.category_id), row]));
  const href = slug => `/services/category/${slug}${query ? `?${query}` : ''}`;
  if (!categories.length) return null;

  return (
    <section className="mb-10" aria-labelledby="professions-title" data-testid="professions">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 id="professions-title" className="text-ink text-xl md:text-2xl font-extrabold m-0">{t('catalog.categories_title')}</h2>
        <select aria-label={t('for_you.choose_profession')} defaultValue="" data-testid="profession-select"
          onChange={e => e.target.value && navigate(href(e.target.value))}
          className="min-w-0 flex-1 sm:flex-none sm:w-72 px-3 py-2.5 rounded-card border border-border bg-surface text-[14px] font-semibold text-fg">
          <option value="">{t('for_you.choose_profession')}</option>
          {categories.map(c => <option key={c.id} value={c.slug}>{c.icon} {localizedName(c, lang)}</option>)}
        </select>
      </div>

      {stats?.totals && (
        <p className="text-[13px] text-fg-muted mb-4" data-testid="area-totals">
          📍 {t('for_you.area_totals', { providers: stats.totals.providers, available: stats.totals.available, requests: stats.totals.open_requests })}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map(c => {
          const look = CATEGORIES.find(item => item.slug === c.slug);
          const s = byCategory.get(Number(c.id));
          return (
            <Link key={c.id} to={href(c.slug)} data-testid="profession-card"
              className="group bg-surface rounded-card border border-border p-4 flex gap-3 items-start no-underline hover:border-primary hover:shadow-card transition">
              <span className="w-12 h-12 rounded-card grid place-items-center text-2xl shrink-0"
                style={look ? { background: look.bg, color: look.tint } : undefined}>{c.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[15.5px] font-extrabold text-fg m-0 truncate">{localizedName(c, lang)}</h3>
                  <span className="text-primary text-[13px] font-bold shrink-0 rtl:rotate-180" aria-hidden="true">→</span>
                </div>
                {look && <p className="text-[12.5px] text-fg-muted m-0 mt-0.5 line-clamp-1">{tx(look.desc, lang)}</p>}
                {stats?.area ? (
                  <div className="flex flex-wrap gap-1.5 mt-2 text-[12px]">
                    <span className="px-2 py-0.5 rounded-pill bg-primary-soft text-primary-text font-semibold">👷 {t('for_you.stat_providers', { count: s?.providers || 0 })}</span>
                    {s?.available > 0 && <span className="px-2 py-0.5 rounded-pill bg-success-soft text-success font-semibold">🟢 {t('for_you.stat_available', { count: s.available })}</span>}
                    {s?.featured > 0 && <span className="px-2 py-0.5 rounded-pill bg-amber-100 text-amber-800 font-semibold">👑 {t('for_you.stat_featured', { count: s.featured })}</span>}
                    {s?.rating_avg && <span className="px-2 py-0.5 rounded-pill bg-surface-alt text-fg-muted font-semibold">⭐ {s.rating_avg}</span>}
                    {s?.open_requests > 0 && <span className="px-2 py-0.5 rounded-pill bg-surface-alt text-fg-muted font-semibold">📨 {t('for_you.stat_open', { count: s.open_requests })}</span>}
                  </div>
                ) : (
                  <p className="text-[12px] text-fg-subtle m-0 mt-2">{user ? t('for_you.no_area_hint') : t('for_you.sign_in_for_stats')}</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
