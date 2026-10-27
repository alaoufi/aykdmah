import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="container page text-center">
      <div style={{ fontSize: 80 }}>🔍</div>
      <h1>{t('errors.not_found')}</h1>
      <Link to="/" className="btn btn-primary">{t('nav.home')}</Link>
    </div>
  );
}
