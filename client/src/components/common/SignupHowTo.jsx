import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// «كيف أسجّل؟» on the sign-up page itself (owner's request, AYK-294): the same steps as the user
// guide's sign-up section, in the reader's language, folded so the form stays in view on a phone.
const STEPS = ['types', 'basics', 'location', 'professions', 'coverage', 'coupon'];

export default function SignupHowTo() {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.resolvedLanguage || 'ar');
  return (
    <details className="rounded-card border-2 border-primary/40 bg-primary-soft p-3 group" data-testid="signup-howto">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-2 font-extrabold text-primary text-[15px]">
        <span>📖 {t('help.signup_title')}</span>
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <p className="text-fg-muted text-sm leading-relaxed mt-2 mb-3">{t('help.signup_intro')}</p>
      <ol className="list-none m-0 p-0 space-y-2.5">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-start gap-2.5 bg-surface rounded-card p-3 border border-border">
            <span aria-hidden="true" className="grid place-items-center w-7 h-7 rounded-full bg-primary-soft text-primary font-extrabold text-sm shrink-0">{number.format(index + 1)}</span>
            <div className="min-w-0">
              <h3 className="text-fg font-bold text-sm leading-relaxed m-0">{t(`help.signup_points.${step}.title`)}</h3>
              <p className="text-fg-muted text-[13px] leading-loose mt-1 mb-0">{t(`help.signup_points.${step}.body`)}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link to="/guide#guide-signup" className="inline-block mt-3 text-sm font-semibold text-primary underline underline-offset-2">{t('help.title')}</Link>
    </details>
  );
}
