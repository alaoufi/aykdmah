import { useTranslation } from 'react-i18next';

export default function CatalogLocationNotice({ loading, error, valid, locationLabel }) {
  const { t } = useTranslation();
  return (
    <div className="my-4 text-sm text-slate-500 space-y-1" aria-live="polite">
      {loading ? <p>{t('common.loading')}</p> : error ? (
        <p role="alert" className="text-rose-700">{t('location.options_unavailable')}</p>
      ) : !valid ? (
        <p role="alert" className="text-rose-700">{t('catalog.location_unavailable')}</p>
      ) : (
        <>
          {locationLabel && <p className="font-semibold text-ink">📍 {t('catalog.request_location')}: {locationLabel}</p>}
          <p>{t('catalog.offers_notice')}</p>
        </>
      )}
    </div>
  );
}
