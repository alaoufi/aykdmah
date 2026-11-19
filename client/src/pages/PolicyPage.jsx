import { localizedTerms } from '../utils/localizeTerms';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import usePublicSettings from '../hooks/usePublicSettings';
import SafeHtml from '../components/common/SafeHtml';

const PRIVACY_SECTIONS = ['data', 'purpose', 'location', 'sharing', 'records', 'controls', 'deletion'];

export default function PolicyPage({ kind }) {
  const { t, i18n } = useTranslation();
  const { settings, loading } = usePublicSettings();
  const terms = kind === 'terms';
  const termsHtml = localizedTerms(settings, i18n.resolvedLanguage, t);
  const title = t(terms ? 'footer.terms' : 'footer.privacy');

  return (
    <article className="max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-14">
      <Link to="/" className="text-primary font-semibold text-sm no-underline">{t('nav.home')}</Link>
      <h1 className="text-3xl font-extrabold text-fg mt-5 mb-6">{title}</h1>
      <div className="bg-surface border border-border rounded-card p-5 md:p-8 text-fg-muted leading-loose">
        {terms ? (
          loading ? <p role="status">{t('common.loading')}</p> : termsHtml ? (
            <SafeHtml
              html={termsHtml}
              className="space-y-4 [&_h3]:text-fg [&_h3]:font-bold [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5"
            />
          ) : <p>{t('policy.terms_unavailable')}</p>
        ) : (
          <>
            <p className="mb-6">{t('policy.privacy_intro')}</p>
            <div className="space-y-6">
              {PRIVACY_SECTIONS.map((section) => (
                <section key={section}>
                  <h2 className="text-fg font-bold text-lg mb-2">{t(`policy.${section}_title`)}</h2>
                  <p>{t(`policy.${section}_body`)}</p>
                </section>
              ))}
            </div>
            <Link to="/terms" className="inline-block text-primary font-semibold mt-7">{t('footer.terms')}</Link>
          </>
        )}
      </div>
    </article>
  );
}
