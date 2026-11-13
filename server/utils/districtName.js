// National-address/OSM imports sometimes append an English abbreviation.
// Only district.name_en is normalized; IDs, Arabic names and other catalogs stay intact.
function normalizeDistrictEnglishName(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const clean = trimmed.replace(/\s+Dist\.?$/i, '').trim();
  return clean || trimmed;
}

module.exports = { normalizeDistrictEnglishName };
