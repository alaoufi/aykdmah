import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useCountry from './useCountry';
import useLocationOptions from './useLocationOptions';
import { localizedName } from '../utils/localize';
import {
  readCatalogFilters, changeCatalogParams, catalogQuery, findLocationRow,
  isLaunchCity, validateCatalogLocation, rememberCatalogSearch,
} from '../utils/catalogFilters';

export default function useCatalogFilters() {
  const [params, setParams] = useSearchParams();
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const { country } = useCountry();
  const filters = readCatalogFilters(params);
  const regions = useLocationOptions('regions', country?.id);
  const cities = useLocationOptions('allCities', null);
  const city = findLocationRow(cities.rows, filters.city);
  const inferredRegion = city?.region_id || cities.rows.find(row => String(row.governorate_id) === filters.governorate)?.region_id;
  const regionId = filters.region || (inferredRegion ? String(inferredRegion) : '');
  const governorates = useLocationOptions('governorates', regionId);
  const districts = useLocationOptions('districts', city?.id);
  const needsGovernorate = Boolean(filters.governorate || city?.governorate_id);
  const loading = !country || regions.loading || cities.loading ||
    (needsGovernorate && governorates.loading) || (Boolean(filters.district) && districts.loading);
  const error = regions.error || cities.error ||
    (needsGovernorate && governorates.error) || (Boolean(filters.district) && districts.error);
  const valid = !loading && !error && validateCatalogLocation(filters, {
    regions: regions.rows, cities: cities.rows, governorates: governorates.rows, districts: districts.rows,
  });
  const launchCities = cities.rows.filter(isLaunchCity);
  const regionOptions = regions.rows.filter(row => launchCities.some(c => String(c.region_id) === String(row.id)));
  const governorateOptions = governorates.rows.filter(row => launchCities.some(c => String(c.governorate_id) === String(row.id)));
  const cityOptions = launchCities.filter(row => (!regionId || String(row.region_id) === regionId) &&
    (!filters.governorate || String(row.governorate_id) === filters.governorate));
  const selected = [findLocationRow(regions.rows, regionId),
    findLocationRow(governorates.rows, filters.governorate), city,
    findLocationRow(districts.rows, filters.district)].filter(Boolean);
  const locationLabel = valid ? [...new Set(selected.map(row => localizedName(row, lang)))].join('، ') : '';
  const query = catalogQuery(params);

  // Remember validated searches. Opening the unfiltered Services link should
  // not erase Home's previous choice; an explicit reset below clears it.
  useEffect(() => {
    if (valid && query) rememberCatalogSearch(new URLSearchParams(query));
  }, [query, valid]);

  return {
    filters, query, locationLabel, loading, error, valid,
    values: { ...filters, region: regionId },
    options: {
      regions: { ...regions, rows: regionOptions },
      governorates: { ...governorates, rows: governorateOptions },
      cities: { ...cities, rows: cityOptions }, districts,
    },
    change: patch => {
      const next = changeCatalogParams(params, patch);
      if (!catalogQuery(next)) rememberCatalogSearch(new URLSearchParams());
      setParams(next, { replace: Object.keys(patch).length === 1 && 'q' in patch });
    },
    reset: () => {
      rememberCatalogSearch(new URLSearchParams());
      setParams(new URLSearchParams());
    },
  };
}
