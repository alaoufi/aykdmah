import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, getCategory, servicesByCategory } from '../../data/servicesCatalog';
import { tx, localizedName } from '../../utils/localize';
import { filterCatalogServices } from '../../utils/catalogFilters';
import useCatalogFilters from '../../hooks/useCatalogFilters';
import { useAuth } from '../../hooks/useAuth';
import { listCategories } from '../../services/serviceService';
import ServiceCard from '../../components/catalog/ServiceCard';
import SearchAndFilters from '../../components/catalog/SearchAndFilters';
import CatalogLocationNotice from '../../components/catalog/CatalogLocationNotice';
import ServiceRequestForm from '../../components/catalog/ServiceRequestForm';
import MatchingProviders from '../../components/catalog/MatchingProviders';
import { EmptyState } from '../../components/common/Spinner';

export default function CategoryServicesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const { slug } = useParams();
  const { user } = useAuth();
  const category = getCategory(slug);
  const discovery = useCatalogFilters();
  const [orderService, setOrderService] = useState(null);
  // The profession as stored on the platform (every category, not only the showcased ones).
  const [dbCategory, setDbCategory] = useState(undefined);
  useEffect(() => {
    listCategories().then(rows => setDbCategory(rows.find(row => row.slug === slug) || null)).catch(() => setDbCategory(null));
  }, [slug]);
  const results = category ? filterCatalogServices(servicesByCategory(slug), CATEGORIES, discovery.filters, lang, discovery.valid) : [];
  const catalogUrl = `/services${discovery.query ? `?${discovery.query}` : ''}`;
  // A signed-in requester sees the providers who serve their own district in this profession.
  const showProviders = user && dbCategory && (user.role === 'client' || Number(user.also_client) === 1);

  if (!category && dbCategory === undefined) return null;
  if (!category && !dbCategory) return (
    <div className="max-w-7xl mx-auto px-4 py-16">
      <EmptyState title={t('catalog.no_results')} />
      <div className="text-center mt-4"><Link to={catalogUrl} className="text-brand-600 font-semibold no-underline">{t('catalog.browse_all')}</Link></div>
    </div>
  );
  const name = category ? tx(category.name, lang) : localizedName(dbCategory, lang);

  return (
    <div className="bg-cream min-h-screen">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-10">
        <div className="flex items-center gap-2 text-[12.5px] text-slate-500 mb-3">
          <Link to={catalogUrl} className="hover:text-brand-700 no-underline">{t('catalog.title')}</Link>
          <span className="rtl:rotate-180">›</span><span className="font-semibold text-ink">{name}</span>
        </div>
        <div className="flex items-center gap-3 mb-6">
          <span className="w-12 h-12 rounded-card grid place-items-center text-2xl shrink-0" style={category ? { background: category.bg, color: category.tint } : undefined}>{category ? category.icon : dbCategory.icon}</span>
          <div><h1 className="text-ink text-2xl md:text-3xl font-extrabold tracking-tight">{name}</h1>{category && <p className="text-slate-500 text-[13.5px]">{tx(category.desc, lang)}</p>}</div>
        </div>
        {showProviders && (
          <div className="mb-8">
            <MatchingProviders categoryId={dbCategory.id} showChips={false} title={t('for_you.providers_in_profession', { name })} />
          </div>
        )}
        {category && <>
          <SearchAndFilters value={discovery.values} onChange={discovery.change} onReset={discovery.reset} options={discovery.options} />
          <CatalogLocationNotice {...discovery} />
          {!discovery.loading && <>
            <div className="text-[12.5px] text-slate-500 my-4">{t('catalog.results_count', { count: results.length })}</div>
            {results.length === 0 ? <EmptyState title={t('catalog.no_results')} /> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.map(service => <ServiceCard key={service.id} service={service} onOrder={setOrderService} query={discovery.query} locationLabel={discovery.locationLabel} />)}
              </div>
            )}
          </>}
        </>}
        {!category && !showProviders && (
          <div className="card text-center">
            <Link to="/requests/new" className="btn btn-primary">{t('home.new_request')}</Link>
          </div>
        )}
      </div>
      <ServiceRequestForm service={orderService} open={!!orderService} onClose={() => setOrderService(null)} />
    </div>
  );
}
