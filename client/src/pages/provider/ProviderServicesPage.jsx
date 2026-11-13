import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function ProviderServicesPage() {
  const { t } = useTranslation();
  return (
    <div>
      <h2 className="mb-4">{t('catalog.my_services')}</h2>
      <div className="card">
        <p>{t('catalog.provider_services_unavailable')}</p>
        <Link to="/opportunities" className="btn btn-primary">{t('catalog.browse_requests')}</Link>
      </div>
    </div>
  );
}
