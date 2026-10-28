import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, SERVICES } from '../../data/servicesCatalog';
import { filterCatalogServices } from '../../utils/catalogFilters';
import useCatalogFilters from '../../hooks/useCatalogFilters';
import ProfessionsSection from '../../components/catalog/ProfessionsSection';
import ServiceCard from '../../components/catalog/ServiceCard';
import SearchAndFilters from '../../components/catalog/SearchAndFilters';
import CatalogLocationNotice from '../../components/catalog/CatalogLocationNotice';
import ServiceRequestForm from '../../components/catalog/ServiceRequestForm';
import { EmptyState } from '../../components/common/Spinner';
import MatchingProviders from '../../components/catalog/MatchingProviders';
import { useAuth } from '../../hooks/useAuth';

export default function ServicesCatalogPage() {
  const { t, i18n } = useTranslation();
  const [orderService, setOrderService] = useState(null);
  const discovery = useCatalogFilters();
  const { user } = useAuth();
  const isRequester = user && (user.role === 'client' || Number(user.also_client) === 1);
  const results = filterCatalogServices(SERVICES, CATEGORIES, discovery.filters,
    i18n.resolvedLanguage || 'ar', discovery.valid);

  return (
    <div className="bg-cream min-h-screen">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12">
        <div className="text-center max-w-2xl mx-auto mb-8 md:mb-12">
          <div className="text-[12px] font-bold text-sand-600 mb-2">{t('common.brand')}</div>
          <h1 className="text-ink text-3xl md:text-4xl font-extrabold tracking-tight">{t('catalog.hero_title')}</h1>
          <p className="text-slate-500 text-sm md:text-[15px] mt-3">{t('catalog.hero_subtitle')}</p>
        </div>
        {isRequester && <div className="mb-8"><MatchingProviders /></div>}
        <SearchAndFilters value={discovery.values} onChange={discovery.change} onReset={discovery.reset} options={discovery.options} />
        <CatalogLocationNotice {...discovery} />
        <ProfessionsSection query={discovery.query} />
        {!discovery.loading && <>
          <div className="flex flex-wrap items-end justify-between gap-2 mb-5">
            <h2 className="text-ink text-xl md:text-2xl font-extrabold">{t('catalog.popular_title')}</h2>
            <span className="text-sm text-slate-500">{t('catalog.results_count', { count: results.length })}</span>
          </div>
          {results.length === 0 ? <EmptyState title={t('catalog.no_results')} /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map(service => <ServiceCard key={service.id} service={service} onOrder={setOrderService} query={discovery.query} locationLabel={discovery.locationLabel} />)}
            </div>
          )}
        </>}
        <div className="text-center text-[11px] text-slate-400 mt-10">{t('catalog.demo_notice')}</div>
      </div>
      <ServiceRequestForm service={orderService} open={!!orderService} onClose={() => setOrderService(null)} />
    </div>
  );
}
