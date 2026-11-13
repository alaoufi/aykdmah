import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// For visitors who have not signed up (AYK-158): what the platform offers each side, with a way
// to look around first (the service providers on the map, the open requests) and to join when
// they are ready. Nothing here asks them to register to keep browsing.
export default function GuestShowcase() {
  const { t } = useTranslation();
  const cards = [
    { key: 'client', icon: '🙋', to: '/register?role=client', browse: '/providers/map', browseLabel: t('join.browse_providers') },
    { key: 'provider', icon: '🛠️', to: '/register?role=provider', browse: '/opportunities', browseLabel: t('join.browse_requests') },
  ];
  return (
    <section className="container max-w-5xl mx-auto px-4 my-6" data-testid="guest-showcase">
      <h2 className="text-center text-[20px] font-extrabold text-fg mb-1">{t('join.showcase_title')}</h2>
      <p className="text-center text-[14px] text-fg-muted mb-4">{t('join.showcase_subtitle')}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cards.map(({ key, icon, to, browse, browseLabel }) => (
          <div key={key} className={`card ${key === 'provider' ? 'tone-provider' : 'tone-request'} p-4 flex flex-col`}>
            <div className="flex items-center gap-3 mb-2">
              <span className="grid place-items-center w-12 h-12 rounded-full bg-brand-50 text-[24px]" aria-hidden="true">{icon}</span>
              <h3 className="m-0 text-[17px] font-extrabold text-fg">{t(`join.showcase_${key}_title`)}</h3>
            </div>
            <p className="text-[13.5px] text-fg-muted leading-relaxed mb-4 flex-1">{t(`join.showcase_${key}_body`)}</p>
            <div className="flex flex-wrap gap-2">
              <Link to={to} className="btn btn-primary btn-sm">{t(`join.showcase_${key}_cta`)}</Link>
              <Link to={browse} className="btn btn-outline btn-sm">{browseLabel}</Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
