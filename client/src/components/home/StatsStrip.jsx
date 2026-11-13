import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPublicStats } from '../../services/serviceService';

// Bottom-of-homepage live counters. Hits the cached /stats/public
// endpoint, so the server only re-queries once per minute even at
// peak traffic. Empty/zero values are still rendered so the layout
// doesn't collapse on a fresh database.

export default function StatsStrip() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [s, setS] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => getPublicStats().then((d) => { if (alive) setS(d); }).catch(() => {});
    load();
    // Light refresh every 60s — matches server cache TTL.
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const fmt = (n) => n == null ? '—' : Number(n).toLocaleString(lang === 'ar' ? 'ar-EG' : lang);

  // Three tiers so it reads like a story on the page:
  //   1. Reach (countries, cities, providers, clients)
  //   2. Activity (completed orders, offers, reviews + rating)
  //   3. Right-now (last 24h messages, active conversations, online now, urgent)
  const COUNTS = [
    { icon: '🌍', value: fmt(s?.countries),       label: t('home.stats.countries') },
    { icon: '🏙️', value: fmt(s?.cities),          label: t('home.stats.cities') },
    { icon: '🛠️', value: fmt(s?.providers),       label: t('home.stats.providers') },
    { icon: '🙋', value: fmt(s?.clients),         label: t('home.stats.clients') },
  ];
  const ACTIVITY = [
    { icon: '✅', value: fmt(s?.completed),       label: t('home.stats.completed_orders') },
    { icon: '📨', value: fmt(s?.offers),          label: t('home.stats.offers') },
    { icon: '⭐', value: s?.rating_avg ? Number(s.rating_avg).toFixed(1) : '—', label: t('home.stats.avg_rating') },
    { icon: '💬', value: fmt(s?.reviews),         label: t('home.stats.reviews') },
  ];
  const NOW = [
    ...(import.meta.env.VITE_REALTIME_MODE !== 'polling'
      ? [{ icon: '🟢', value: fmt(s?.providers_online), label: t('home.stats.online_now'), live: true }]
      : []),
    { icon: '🗨️', value: fmt(s?.conversations_24h), label: t('home.stats.active_chats_24h') },
    { icon: '✉️', value: fmt(s?.messages_24h),     label: t('home.stats.messages_24h') },
    { icon: '🔥', value: fmt(s?.urgent_open),     label: t('home.stats.urgent_open'),       hot: true },
  ];

  return (
    <section className="bg-surface-alt border-t border-border py-5 md:py-14">
      <div className="container max-w-6xl mx-auto px-4">
        <div className="text-center mb-7 md:mb-9">
          <h2 className="text-ink text-2xl md:text-3xl font-extrabold">{t('home.stats.title')}</h2>
          <p className="text-fg-muted text-sm md:text-base mt-1.5">{t('home.stats.subtitle')}</p>
        </div>

        {/* Tier 1 — reach */}
        <h3 className="text-fg-muted text-[12.5px] font-bold uppercase tracking-wider mb-2.5 md:mb-3">
          {t('home.stats.reach')}
        </h3>
        <Grid items={COUNTS} />

        {/* Tier 2 — activity */}
        <h3 className="text-fg-muted text-[12.5px] font-bold uppercase tracking-wider mt-7 md:mt-9 mb-2.5 md:mb-3">
          {t('home.stats.activity')}
        </h3>
        <Grid items={ACTIVITY} />

        {/* Tier 3 — right now */}
        <h3 className="text-fg-muted text-[12.5px] font-bold uppercase tracking-wider mt-7 md:mt-9 mb-2.5 md:mb-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot inline-block" />
            {t('home.stats.right_now')}
          </span>
        </h3>
        <Grid items={NOW} />

        {s?.generated_at && (
          <div className="text-center text-[11px] text-fg-subtle mt-6">
            {t('home.stats.updated_at', { time: new Date(s.generated_at).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : lang) })}
          </div>
        )}
      </div>
    </section>
  );
}

function Grid({ items }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-4">
      {items.map((it, i) => (
        <div key={i}
          className={`bg-surface rounded-card border ${it.hot ? 'border-rose-200' : it.live ? 'border-emerald-200' : 'border-border'} p-3.5 md:p-4 flex items-center gap-3 shadow-soft hover:shadow-lift transition`}>
          <span className={`text-2xl md:text-3xl shrink-0 grid place-items-center w-10 h-10 md:w-12 md:h-12 rounded-card ${
            it.hot ? 'bg-rose-50' : it.live ? 'bg-emerald-50' : 'bg-surface-alt'
          }`}>{it.icon}</span>
          <div className="min-w-0">
            <div className={`text-[20px] md:text-[24px] font-extrabold leading-none ${it.hot ? 'text-rose-600' : it.live ? 'text-emerald-600' : 'text-ink'}`}>
              {it.value}
            </div>
            <div className="text-[11.5px] md:text-[12.5px] text-fg-muted mt-1 truncate">{it.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
