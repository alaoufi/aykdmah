import { useEffect, useState } from 'react';
import { getPublicSettings } from '../services/serviceService';

// In-memory cache shared across the app — public settings change rarely
// and the result is small, so a single fetch per session is enough.
let cached = null;
let inflight = null;

export function fetchPublicSettings() {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = getPublicSettings()
    .then((data) => { cached = data || {}; return cached; })
    .catch(() => ({}))
    .finally(() => { inflight = null; });
  return inflight;
}

export default function usePublicSettings() {
  const [settings, setSettings] = useState(cached || {});
  const [loading, setLoading] = useState(!cached);
  useEffect(() => {
    let alive = true;
    fetchPublicSettings().then((s) => { if (alive) { setSettings(s); setLoading(false); } });
    return () => { alive = false; };
  }, []);
  return { settings, loading };
}

// Subscriptions are switched on from the administration; while off, every subscription page and
// link is hidden (AYK-147).
export const subscriptionsOn = settings => [true, 1, '1', 'true'].includes(settings?.subscriptions_enabled);

// CSV setting → array of trimmed non-empty strings
export function csvToList(value, fallback = '') {
  return String(value ?? fallback).split(',').map((s) => s.trim()).filter(Boolean);
}
