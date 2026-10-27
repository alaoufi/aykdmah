import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const WALLET_POINTS = ['coupon', 'invite', 'commission', 'balance', 'withdraw', 'gift', 'security', 'payments'];

const CLIENT_STEPS = ['browse', 'details', 'location', 'offers', 'chat', 'finish'];
const PROVIDER_STEPS = ['signup', 'profile', 'find', 'quote', 'work'];
const QUESTIONS = ['price', 'areas', 'tracking', 'dispute', 'subscription', 'language'];

function GuideSteps({ role, steps, title, intro, icon }) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.resolvedLanguage || 'ar');
  return (
    <section id={`guide-${role}`} aria-labelledby={`guide-${role}-title`} className="scroll-mt-24">
      <div className="flex items-start gap-3 mb-5">
        <span aria-hidden="true" className="grid place-items-center w-12 h-12 rounded-card bg-primary-soft text-2xl shrink-0">{icon}</span>
        <div className="min-w-0">
          <h2 id={`guide-${role}-title`} className="text-xl md:text-2xl font-extrabold text-fg">{title}</h2>
          <p className="text-fg-muted text-sm md:text-base leading-relaxed mt-1">{intro}</p>
        </div>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 list-none m-0 p-0">
        {steps.map((step, index) => (
          <li key={step} className="bg-surface border border-border rounded-card p-5 md:p-6 flex items-start gap-3 shadow-soft">
            <span aria-hidden="true" className="grid place-items-center w-8 h-8 rounded-full bg-primary-soft text-primary font-extrabold shrink-0">
              {number.format(index + 1)}
            </span>
            <div className="min-w-0">
              <h3 className="text-fg font-bold text-base leading-relaxed">{t(`help.${role}_steps.${step}.title`)}</h3>
              <p className="text-fg-muted text-sm leading-loose mt-2">{t(`help.${role}_steps.${step}.body`, { role_client: t('auth.role_client'), role_provider: t('auth.role_provider') })}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function GuidePage() {
  const { t } = useTranslation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  return (
    <article className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12 text-start">
      <div className="max-w-3xl mb-7 md:mb-9">
        <p className="text-primary text-sm font-bold mb-2">{t('common.brand')}</p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-fg leading-tight">{t('help.title')}</h1>
        <p className="text-fg-muted leading-loose text-base mt-4">{t('help.subtitle')}</p>
        <p className="text-fg-subtle text-sm mt-2">{t('help.account_note')}</p>
      </div>

      <nav aria-label={t('help.choose_role')} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10 md:mb-12">
        {[
          { role: 'client', icon: '🏠', label: t('help.client_jump') },
          { role: 'provider', icon: '🛠️', label: t('help.provider_jump') },
        ].map(item => (
          <a key={item.role} href={`#guide-${item.role}`}
            className="flex items-center gap-3 rounded-card border border-border bg-surface-alt text-fg p-4 md:p-5 no-underline font-bold hover:border-primary hover:text-primary transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">
            <span aria-hidden="true" className="text-2xl">{item.icon}</span>
            <span>{item.label}</span>
            <span aria-hidden="true" className="ms-auto text-primary">↓</span>
          </a>
        ))}
      </nav>

      <div className="space-y-10 md:space-y-12">
        <GuideSteps role="client" steps={CLIENT_STEPS} title={t('help.client_title')} intro={t('help.client_intro')} icon="🏠" />
        <GuideSteps role="provider" steps={PROVIDER_STEPS} title={t('help.provider_title')} intro={t('help.provider_intro')} icon="🛠️" />

        <section aria-labelledby="guide-venue-title" className="rounded-card border border-border bg-surface-alt p-5 md:p-7">
          <h2 id="guide-venue-title" className="text-xl md:text-2xl font-extrabold text-fg">{t('help.venue_title')}</h2>
          <p className="text-fg-muted text-sm md:text-base leading-loose mt-3 mb-5">{t('help.venue_intro')}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { mode: 'mobile', icon: '🚙' },
              { mode: 'fixed', icon: '📍' },
              { mode: 'both', icon: '🤝' },
            ].map(item => (
              <div key={item.mode} className="rounded-card bg-surface border border-border p-4">
                <span aria-hidden="true" className="text-2xl block mb-2">{item.icon}</span>
                <h3 className="font-bold text-fg leading-relaxed">{t(`provider.mode_${item.mode}`)}</h3>
                <p className="text-fg-muted text-sm leading-loose mt-2">{t(`provider.mode_${item.mode}_hint`)}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="guide-wallet" aria-labelledby="guide-wallet-title" className="mb-10 md:mb-12">
          <h2 id="guide-wallet-title" className="text-xl md:text-2xl font-extrabold text-fg">💰 {t('help.wallet_title')}</h2>
          <p className="text-fg-muted text-sm md:text-base leading-loose mt-3 mb-5">{t('help.wallet_intro')}</p>
          <ol className="space-y-3">
            {WALLET_POINTS.map((point, index) => (
              <li key={point} className="card p-4">
                <h3 className="text-fg font-bold text-base">{index + 1}. {t(`help.wallet_points.${point}.title`)}</h3>
                <p className="text-fg-muted text-sm leading-loose mt-1">{t(`help.wallet_points.${point}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="guide-faq-title">
          <h2 id="guide-faq-title" className="text-xl md:text-2xl font-extrabold text-fg mb-5">{t('help.faq_title')}</h2>
          <div className="space-y-3">
            {QUESTIONS.map((question, index) => (
              <details key={question} id={`guide-faq-${question}`} open={index === 0}
                className="group bg-surface border border-border rounded-card">
                <summary className="flex items-center justify-between gap-3 px-5 py-4 font-bold text-fg cursor-pointer list-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 rounded-card">
                  <span>{t(`help.faq.${question}.question`)}</span>
                  <span aria-hidden="true" className="text-primary text-xl font-normal shrink-0 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="text-fg-muted text-sm leading-loose px-5 pb-5">{t(`help.faq.${question}.answer`)}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="guide-start-title" className="rounded-card bg-primary-soft border border-primary/20 p-5 md:p-7">
          <h2 id="guide-start-title" className="text-xl md:text-2xl font-extrabold text-fg">{t('help.start_title')}</h2>
          <p className="text-fg-muted leading-loose text-sm md:text-base mt-2 mb-5">{t('help.start_subtitle')}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link to="/services" className="inline-flex justify-center items-center rounded-pill px-6 py-3 bg-primary text-primary-fg font-bold text-sm no-underline hover:opacity-90 transition">
              {t('help.browse_services')}
            </Link>
            <Link to="/register?role=provider" className="inline-flex justify-center items-center rounded-pill px-6 py-3 bg-surface border border-border text-fg font-bold text-sm no-underline hover:border-primary transition">
              {t('help.provider_signup')}
            </Link>
          </div>
        </section>
      </div>
    </article>
  );
}
