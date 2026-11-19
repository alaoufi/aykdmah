import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';

// Production basemap for every Leaflet map. OpenFreeMap serves free vector tiles with
// no key or usage cap; MapLibre renders them inside Leaflet so markers, popups and
// polylines keep using the existing react-leaflet code. Self-hosted styles can be
// swapped in with VITE_MAP_STYLE_URL.
export const MAP_STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
const ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> '
  + '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> '
  + 'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

// Loaded on first map render only, so pages without a map never download the renderer.
let rendererPromise = null;
function loadRenderer() {
  rendererPromise ||= Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
    import('maplibre-gl/dist/maplibre-gl.css'),
  ]).then(async ([gl, worker]) => {
    const maplibregl = gl.default || gl;
    // Same-origin worker file keeps the CSP at worker-src 'self'.
    maplibregl.setWorkerUrl(worker.default);
    await import('@maplibre/maplibre-gl-leaflet');
    return maplibregl;
  }).catch(error => { rendererPromise = null; throw error; });
  return rendererPromise;
}

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch { return false; }
}

export default function BaseTileLayer() {
  const { t } = useTranslation();
  const map = useMap();
  // Raster OSM tiles remain only as a fallback for devices without WebGL.
  const [fallback, setFallback] = useState(() => !supportsWebGL());
  const [online, setOnline] = useState(() => navigator.onLine !== false);

  useEffect(() => {
    if (fallback) return undefined;
    let layer = null;
    let cancelled = false;
    loadRenderer().then(() => {
      if (cancelled) return;
      layer = L.maplibreGL({ style: MAP_STYLE_URL, attribution: ATTRIBUTION });
      layer.addTo(map);
    }).catch(() => { if (!cancelled) setFallback(true); });
    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map, fallback]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <>
      {fallback && (
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      )}
      {!online && (
        <div role="status" className="absolute top-2 inset-x-2 z-[1000] rounded-card bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2 text-[12.5px] text-center">
          {t('map.offline')}
        </div>
      )}
    </>
  );
}
