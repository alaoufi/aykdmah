import { useTranslation } from 'react-i18next';
import StoreBadges from '../components/home/StoreBadges';

// aykdmh.com/app on a computer (AYK-351): both stores, one tap each. Phones go straight to theirs.
export default function AppLinksPage() {
  const { t } = useTranslation();
  return (
    <section className="max-w-3xl mx-auto px-4 py-10 text-center" data-testid="app-links">
      <h1 className="text-2xl md:text-3xl font-extrabold text-fg mb-6">📲 {t('home.get_app')}</h1>
      <StoreBadges />
    </section>
  );
}
