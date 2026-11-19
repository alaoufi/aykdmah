import { useEffect, useState } from 'react';
import {
  listRegions, listGovernorates, listCities, listDistricts,
} from '../services/serviceService';

const LOADERS = {
  regions: (id) => listRegions({ countryId: id }),
  governorates: listGovernorates,
  cities: (id) => listCities({ governorateId: id }),
  regionCities: (id) => listCities({ regionId: id }),
  allCities: () => listCities(),
  districts: listDistricts,
};

// Tie every result to its parent selection. A delayed response from a
// previous city must never replace the current city's neighborhoods.
export default function useLocationOptions(level, parentId, enabled = true, retryKey = '') {
  const active = enabled && (level === 'allCities' || Boolean(parentId));
  const key = `${level}:${parentId || ''}:${active}:${retryKey}`;
  const [state, setState] = useState({ key: '', rows: [], loading: false, error: false });

  useEffect(() => {
    if (!active) return undefined;
    let current = true;
    setState({ key, rows: [], loading: true, error: false });
    LOADERS[level](parentId)
      .then((rows) => {
        if (current) setState({ key, rows, loading: false, error: false });
      })
      .catch(() => {
        if (current) setState({ key, rows: [], loading: false, error: true });
      });
    return () => { current = false; };
  }, [level, parentId, key, active]);

  if (!active || state.key !== key) return { rows: [], loading: active, error: false };
  return state;
}
