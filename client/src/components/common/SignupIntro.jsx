import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import GuideBook from './GuideBook';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import useCountry from '../../hooks/useCountry';

// The sign-up guide (owner's request, AYK-296). The first time someone opens the sign-up page, they
// choose their language, then a book shows how to sign up, step by step, with pictures of the page
// itself in that language. «Start signing up» closes it; the button on the page opens it again.
export const SIGNUP_STEPS = ['types', 'account', 'location', 'work', 'schedule', 'finish'];
const SEEN = 'ayk_signup_intro_seen';

export function signupIntroSeen() {
  try { return localStorage.getItem(SEEN) === '1'; } catch (_) { return true; }
}

// The labels the text quotes are the page's own, in the reader's language, so they always match.
export function signupLabels(t) {
  return {
    client: t('auth.role_client'), provider: t('auth.role_provider'), both: t('auth.role_both'),
    profile: t('nav.profile'), signin: t('auth.login_button'), forgot: t('auth.forgot_password'),
    map: t('auth.pick_on_map'), all: t('provider.coverage_all'), coupon: t('auth.have_coupon'),
    create: t('auth.register_button'), terms: t('auth.terms_link'), extras: t('auth.provider_extras'),
  };
}

export default function SignupIntro({ open, startWithLanguage = true, onClose }) {
  const { t, i18n } = useTranslation();
  const { country } = useCountry();
  const [stage, setStage] = useState(startWithLanguage ? 'language' : 'book');
  useEffect(() => { if (open) setStage(startWithLanguage ? 'language' : 'book'); }, [open, startWithLanguage]);
  useEffect(() => {
    if (!open) return undefined;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = before; };
  }, [open]);
  if (!open) return null;

  const enabled = Array.isArray(country?.languages_enabled) && country.languages_enabled.length
    ? country.languages_enabled : SUPPORTED_LANGUAGES.map(l => l.code);
  const languages = SUPPORTED_LANGUAGES.filter(l => enabled.includes(l.code));
  const lang = (i18n.resolvedLanguage || 'ar').split(/[-_]/)[0];
  const labels = signupLabels(t);

  const close = () => {
    try { localStorage.setItem(SEEN, '1'); } catch (_) { /* private mode */ }
    if (window.location.hash.startsWith('#signup-')) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[4500] bg-bg overflow-y-auto" role="dialog" aria-modal="true" aria-label={t('signup_guide.title')} data-testid="signup-intro">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {stage === 'language' ? (
          <div className="min-h-[80vh] grid place-items-center" data-testid="signup-intro-language">
            <div className="w-full max-w-md text-center">
              <div className="text-5xl mb-3" aria-hidden="true">🌐</div>
              <h1 className="text-2xl font-extrabold text-fg mb-2">{t('signup_guide.choose_language')}</h1>
              <p className="text-fg-muted text-sm leading-relaxed mb-5">{t('signup_guide.choose_language_hint')}</p>
              <div className="grid grid-cols-2 gap-2.5">
                {languages.map(l => (
                  <button key={l.code} type="button" lang={l.code} dir={l.dir}
                    onClick={() => i18n.changeLanguage(l.code).finally(() => setStage('book'))}
                    className={`flex items-center justify-center gap-2 min-h-[52px] px-3 rounded-card border-2 text-[15px] font-bold transition ${l.code === lang ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-fg hover:border-primary'}`}
                    data-testid={`signup-intro-lang-${l.code}`}>
                    <span aria-hidden="true">{l.flag}</span>{l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div data-testid="signup-intro-book">
            <p className="text-fg-muted text-sm leading-relaxed mb-1">{t('signup_guide.intro')}</p>
            <GuideBook title={t('signup_guide.title')}
              ids={SIGNUP_STEPS.map(step => `signup-${step}`)}
              titles={SIGNUP_STEPS.map(step => t(`signup_guide.steps.${step}.title`))}
              images={SIGNUP_STEPS.map(step => `/guide/signup/${lang}/${step}.webp`)} illustrationNote={false}>
              {SIGNUP_STEPS.map(step => (
                <div key={step}>
                  <p className="text-fg leading-loose text-[15px]">{t(`signup_guide.steps.${step}.body`, labels)}</p>
                  <p className="text-fg-subtle text-xs mt-3">{t('signup_guide.image_note')}</p>
                </div>
              ))}
            </GuideBook>
            <button type="button" onClick={close} className="btn btn-primary w-full justify-center text-[16px] min-h-[52px]" data-testid="signup-intro-start">
              ✍️ {t('signup_guide.start')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
