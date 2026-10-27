import { apiError } from '../services/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapContainer, Marker, Polyline, useMap, Popup } from 'react-leaflet';
import BaseTileLayer from '../components/map/BaseTileLayer';
import L from 'leaflet';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import {
  getRequestTracking, shareLocation, stopLocationShare,
} from '../services/chatService';
import { distanceKm, naiveEtaMinutes, formatDistance, getCurrentPosition, watchPosition, openInExternalMaps } from '../utils/geo';
import { LoadingState } from '../components/common/Spinner';
import Avatar from '../components/common/Avatar';
import { IconClose } from '../components/common/Icons';
import { createPollingLoop } from '../utils/polling';
import { formatRelativeTime } from '../utils/formatters';
import { isValidCoordinates } from '../utils/geolocation.mjs';

const fixIcon = () => {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
};

function colouredPin(emoji, bg) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${bg};color:#fff;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-size:18px;border:3px solid #fff;box-shadow:0 4px 12px rgba(15,23,42,.25)">${emoji}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function AutoFit({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 15);
    } else {
      const bounds = L.latLngBounds(points.map(p => [p.latitude, p.longitude]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    }
  }, [points, map]);
  return null;
}

export default function TrackingPage() {
  const { t } = useTranslation();
  const { id: requestId } = useParams();
  const { user } = useAuth();
  const { socket, realtimeMode } = useSocket();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [myPosition, setMyPosition] = useState(null);
  const [otherPosition, setOtherPosition] = useState(null);
  const shareSessionRef = useRef(null);
  const scopeRef = useRef(null);
  scopeRef.current = `${user?.id}:${requestId}`;
  const [sharingAction, setSharingAction] = useState(false);
  const [updateError, setUpdateError] = useState(false);

  useEffect(() => { fixIcon(); }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    setData(null);
    setMyPosition(null);
    setOtherPosition(null);
    setSharing(false);
    setSharingAction(false);
    setUpdateError(false);
    let loaded = false;
    const poll = createPollingLoop(() => getRequestTracking(requestId), {
      intervalMs: realtimeMode === 'polling' ? 10000 : null,
      onResult: (d) => {
        loaded = true;
        const locations = (d.locations || []).filter(loc =>
          (loc.is_live === true || Number(loc.is_live) === 1)
          && loc.latitude != null && loc.longitude != null && isValidCoordinates(Number(loc.latitude), Number(loc.longitude))
          && (!loc.expires_at || Date.parse(loc.expires_at) > Date.now())
        );
        setData({ ...d, locations });
        const mine = locations.find(loc => Number(loc.user_id) === Number(user.id));
        const other = locations.find(loc => Number(loc.user_id) !== Number(user.id));
        if (mine && !shareSessionRef.current) {
          setMyPosition({ latitude: Number(mine.latitude), longitude: Number(mine.longitude), accuracy_m: mine.accuracy_m, created_at: mine.created_at });
        }
        setOtherPosition(other ? {
          latitude: Number(other.latitude), longitude: Number(other.longitude),
          name: other.full_name, role: other.sender_role, created_at: other.created_at,
        } : null);
        setLoading(false);
        setError('');
        setUpdateError(false);
      },
      onError: (err) => {
        if (!loaded || [403, 404].includes(err?.response?.status)) {
          setError(apiError(err));
        } else setUpdateError(true);
        setLoading(false);
      },
    });
    return () => {
      poll.stop();
      const session = shareSessionRef.current;
      if (session) {
        const uploadsDone = session.stop();
        shareSessionRef.current = null;
        Promise.resolve(uploadsDone).then(() => stopLocationShare(session.conversationId)).catch(() => {});
      }
    };
  }, [requestId, user.id, realtimeMode, t]);

  // Subscribe to live location updates via socket
  useEffect(() => {
    if (!socket || !data?.conversation_id) return;
    socket.emit('chat:join', Number(data.conversation_id));
    const onUpdate = (payload) => {
      if (Number(payload.conversationId) !== Number(data.conversation_id)) return;
      if (payload.latitude == null || payload.longitude == null || !isValidCoordinates(Number(payload.latitude), Number(payload.longitude))) return;
      const pos = {
        latitude: Number(payload.latitude),
        longitude: Number(payload.longitude),
        accuracy_m: payload.accuracy_m,
        created_at: payload.created_at,
      };
      if (payload.userId === user.id) {
        setMyPosition(pos);
      } else {
        setOtherPosition({ ...pos, role: payload.sender_role });
      }
    };
    const onStop = (payload) => {
      if (Number(payload.conversationId) !== Number(data.conversation_id)) return;
      if (payload.userId !== user.id) setOtherPosition(null);
    };
    socket.on('location:update', onUpdate);
    socket.on('location:stop', onStop);
    return () => {
      socket.off('location:update', onUpdate);
      socket.off('location:stop', onStop);
      socket.emit('chat:leave', Number(data.conversation_id));
    };
  }, [socket, data?.conversation_id, user.id]);

  const startSharing = async () => {
    if (sharingAction || sharing || !data?.conversation_id) return;
    const scope = scopeRef.current;
    const conversationId = data.conversation_id;
    setSharingAction(true);
    try {
      const pos = await getCurrentPosition();
      if (scopeRef.current !== scope) return;
      await shareLocation(conversationId, pos);
      if (scopeRef.current !== scope) {
        stopLocationShare(conversationId).catch(() => {});
        return;
      }
      setMyPosition(pos);
      const session = { conversationId, pending: null, watch: null };
      const uploads = createPollingLoop(async () => {
        const point = session.pending;
        if (!point) return;
        session.pending = null;
        try { await shareLocation(conversationId, point); }
        catch (err) { session.pending ||= point; throw err; }
      }, { intervalMs: 5000 });
      const updateWatch = () => {
        session.watch?.();
        session.watch = null;
        if (document.visibilityState === 'hidden') { session.pending = null; return; }
        session.watch = watchPosition((point) => {
          if (scopeRef.current !== scope) return;
          setMyPosition(point);
          session.pending = point;
        }, () => {});
      };
      document.addEventListener('visibilitychange', updateWatch);
      session.stop = () => {
        const uploadsDone = uploads.stop();
        session.watch?.();
        document.removeEventListener('visibilitychange', updateWatch);
        return uploadsDone;
      };
      shareSessionRef.current = session;
      updateWatch();
      setSharing(true);
    } catch (err) {
      if (scopeRef.current === scope) alert(t('location.geolocation_failed'));
    } finally {
      if (scopeRef.current === scope) setSharingAction(false);
    }
  };

  const stopSharing = async () => {
    const scope = scopeRef.current;
    const session = shareSessionRef.current;
    const conversationId = session?.conversationId || data?.conversation_id;
    const uploadsDone = session?.stop();
    shareSessionRef.current = null;
    setSharingAction(true);
    try {
      await uploadsDone;
      if (conversationId) await stopLocationShare(conversationId);
      if (scopeRef.current === scope) setSharing(false);
    } catch (err) {
      if (scopeRef.current === scope) setUpdateError(true);
    } finally {
      if (scopeRef.current === scope) setSharingAction(false);
    }
  };

  useEffect(() => () => { scopeRef.current = null; }, []);

  const requestPin = data?.request && data.request.latitude != null && data.request.longitude != null && isValidCoordinates(Number(data.request.latitude), Number(data.request.longitude))
    ? { latitude: Number(data.request.latitude), longitude: Number(data.request.longitude) }
    : null;

  const points = useMemo(() => {
    const arr = [];
    if (myPosition) arr.push(myPosition);
    if (otherPosition) arr.push(otherPosition);
    if (requestPin && !myPosition && !otherPosition) arr.push(requestPin);
    return arr;
  }, [myPosition, otherPosition, requestPin]);

  const focal = otherPosition || requestPin;
  const distKm = myPosition && focal ? distanceKm(myPosition, focal) : null;
  const eta = naiveEtaMinutes(distKm);

  if (loading) return <LoadingState />;
  if (error) {
    return (
      <div className="p-8">
        <div className="max-w-md mx-auto bg-rose-50 border border-rose-200 p-6 rounded-card text-rose-700 text-center">
          <div className="text-4xl mb-2">⚠️</div>
          <p>{error}</p>
          <Link to="/" className="inline-block mt-4 text-brand-700">{t('nav.home')}</Link>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const otherName = otherPosition?.name || (data.locations?.find(l => l.user_id !== user.id)?.full_name);
  const center = otherPosition || myPosition || requestPin || { latitude: 24.7136, longitude: 46.6753 };

  return (
    <div className="relative h-[100dvh] bg-slate-100 overflow-hidden">
      <div className="absolute inset-0">
        <MapContainer
          center={[center.latitude, center.longitude]}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <BaseTileLayer />
          {myPosition && (
            <Marker
              position={[myPosition.latitude, myPosition.longitude]}
              icon={colouredPin('📍', '#0ea5e9')}
            >
              <Popup>{t('tracking.you')}</Popup>
            </Marker>
          )}
          {otherPosition && (
            <Marker
              position={[otherPosition.latitude, otherPosition.longitude]}
              icon={colouredPin(otherPosition.role === 'provider' ? '🛠️' : '🙋', '#10b981')}
            >
              <Popup>{otherName || t('tracking.other')}</Popup>
            </Marker>
          )}
          {requestPin && !otherPosition && (
            <Marker
              position={[requestPin.latitude, requestPin.longitude]}
              icon={colouredPin('🎯', '#f59e0b')}
            >
              <Popup>{data.request.title}</Popup>
            </Marker>
          )}
          {myPosition && (otherPosition || requestPin) && (
            <Polyline
              positions={[
                [myPosition.latitude, myPosition.longitude],
                otherPosition
                  ? [otherPosition.latitude, otherPosition.longitude]
                  : [requestPin.latitude, requestPin.longitude],
              ]}
              pathOptions={{ color: '#876239', weight: 4, opacity: 0.7, dashArray: '8 6' }}
            />
          )}
          <AutoFit points={points} />
        </MapContainer>
      </div>

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-[400] p-3">
        <div className="bg-white/95 backdrop-blur rounded-pill shadow-lift flex items-center gap-2 px-3 py-2 max-w-2xl mx-auto">
          <button onClick={() => navigate(-1)} className="w-9 h-9 grid place-items-center rounded-pill hover:bg-slate-100 text-slate-700">
            <IconClose size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-slate-500 leading-tight">{t('tracking.title')}</div>
            <div className="text-[14px] font-bold text-ink truncate">{data.request.title}</div>
          </div>
          {data.conversation_id && (
            <Link
              to={`/chat/${data.conversation_id}`}
              className="px-3 py-1.5 rounded-pill bg-brand-50 hover:bg-brand-100 text-brand-700 text-[12.5px] font-semibold no-underline"
            >
              💬 {t('nav.chat')}
            </Link>
          )}
        </div>
      </div>

      {/* Bottom sheet */}
      <div className="absolute bottom-0 inset-x-0 z-[400]">
        <div className="bg-white rounded-t-[24px] shadow-lift max-w-2xl mx-auto p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-4" />

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-slate-50 rounded-card p-3 text-center">
              <div className="text-[11px] text-slate-500">{t('tracking.distance')}</div>
              <div className="text-[20px] font-extrabold text-ink mt-0.5">
                {distKm != null ? formatDistance(distKm) : '—'}
              </div>
            </div>
            <div className="bg-slate-50 rounded-card p-3 text-center">
              <div className="text-[11px] text-slate-500">{t('tracking.eta')}</div>
              <div className="text-[20px] font-extrabold text-ink mt-0.5">
                {eta > 0 ? `${eta} ${t('common.minutes')}` : '—'}
              </div>
            </div>
          </div>

          {(otherPosition || data.request.assigned_provider_id) && (
            <div className="flex items-center gap-3 p-3 rounded-card bg-slate-50 mb-3">
              <Avatar name={otherName || t('tracking.other')} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-bold text-ink truncate">{otherName || t('tracking.other')}</div>
                <div className="text-[11.5px] text-slate-500">
                  {otherPosition
                    ? realtimeMode === 'polling'
                      ? `${t('tracking.last_location', { defaultValue: 'آخر موقع مشارك' })} ${formatRelativeTime(otherPosition.created_at)}`
                      : `🟢 ${t('tracking.live_now')}`
                    : t('tracking.not_sharing')}
                </div>
              </div>
            </div>
          )}

          {realtimeMode === 'polling' && (
            <p className="text-[11.5px] text-slate-500 mb-3">
              {t('tracking.periodic_updates', { defaultValue: 'يُحدّث الموقع كل 10 ثوانٍ أثناء فتح الصفحة' })}
            </p>
          )}
          {updateError && <p role="alert" className="text-xs text-rose-700 mb-3">{t('errors.generic')}</p>}
          <div className="flex gap-2 flex-wrap">
            {!sharing ? (
              <button
                onClick={startSharing}
                disabled={sharingAction || !data.conversation_id}
                className="flex-1 px-4 py-3 rounded-pill text-white text-[13.5px] font-bold shadow-soft hover:shadow-lift"
                style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}
              >
                📍 {t('tracking.share_my_location')}
              </button>
            ) : (
              <button
                onClick={stopSharing}
                disabled={sharingAction}
                className="flex-1 px-4 py-3 rounded-pill bg-rose-50 text-rose-700 hover:bg-rose-100 text-[13.5px] font-bold"
              >
                ⏹ {t('tracking.stop_sharing')}
              </button>
            )}
            {focal && (
              <button
                onClick={() => openInExternalMaps(focal)}
                className="px-4 py-3 rounded-pill bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13.5px] font-bold"
              >
                🧭 {t('tracking.open_in_maps')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
