import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { listCountries } from '../services/serviceService';
import { setActiveCurrency } from '../utils/formatters';

const STORAGE_KEY = 'lsm_active_country_code';

// One in-memory cache shared across calls so the country list isn't
// re-fetched for every component that wants it.
let _countriesCache = null;
let _inflight = null;
async function ensureCountries() {
  if (_countriesCache) return _countriesCache;
  if (_inflight) return _inflight;
  _inflight = listCountries()
    .then((rows) => { _countriesCache = rows || []; return _countriesCache; })
    .catch(() => { _countriesCache = []; return _countriesCache; })
    .finally(() => { _inflight = null; });
  return _inflight;
}

// Resolves the visitor's active country:
//   1. Logged-in user's country_id (if set)
//   2. Last country code stored in localStorage
//   3. The first country returned by /api/countries (the default)
export default function useCountry() {
  const { user } = useAuth();
  const [country, setCountry] = useState(null);
  const [countries, setCountries] = useState([]);

  useEffect(() => {
    let alive = true;
    ensureCountries().then((rows) => {
      if (!alive) return;
      setCountries(rows);
      const stored = (() => {
        try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
      })();
      let pick = null;
      if (user?.country_id) pick = rows.find((c) => Number(c.id) === Number(user.country_id));
      if (!pick && stored)  pick = rows.find((c) => c.code === stored);
      if (!pick)            pick = rows[0];
      setCountry(pick || null);
      if (pick?.currency_code) setActiveCurrency({ code: pick.currency_code, symbol: pick.currency_symbol });
    });
    return () => { alive = false; };
  }, [user?.country_id]);

  const select = (code) => {
    const next = countries.find((c) => c.code === code);
    if (!next) return;
    setCountry(next);
    if (next.currency_code) setActiveCurrency({ code: next.currency_code, symbol: next.currency_symbol });
    try { localStorage.setItem(STORAGE_KEY, code); } catch (_) {}
  };

  return { country, countries, select };
}
