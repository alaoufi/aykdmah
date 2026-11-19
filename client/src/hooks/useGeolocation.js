import { useState, useCallback, useEffect, useRef } from 'react';
import { getCurrentPosition } from '../utils/geolocation.mjs';

export function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const request = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const pos = await getCurrentPosition({ signal: controller.signal });
      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
      if (!controller.signal.aborted) setPosition(coords);
      return coords;
    } catch (err) {
      if (!controller.signal.aborted) {
        let msg = 'تعذر الحصول على الموقع';
        if (err.code === 1) msg = 'تم رفض إذن الموقع';
        else if (err.code === 2) msg = 'الموقع غير متاح حالياً';
        else if (err.code === 3) msg = 'انتهت مهلة الموقع';
        setError(msg);
      }
      throw err;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  return { position, error, loading, request };
}
