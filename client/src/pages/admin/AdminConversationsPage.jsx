import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, Marker, Polyline, CircleMarker, Popup } from 'react-leaflet';
import BaseTileLayer from '../../components/map/BaseTileLayer';
import L from 'leaflet';

import {
  adminListConversations, adminGetConversation, adminListLiveLocations,
} from '../../services/adminService';
import { apiError } from '../../services/api';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import EmptyState from '../../components/admin/EmptyState';
import { safeUrl } from '../../utils/urlSafety';
import { isValidCoordinates } from '../../utils/geolocation.mjs';
import { createPollingLoop } from '../../utils/polling';

const validLocation = (location) => location.latitude != null && location.longitude != null &&
  isValidCoordinates(Number(location.latitude), Number(location.longitude));

// Leaflet default-icon paths break under bundlers. Same fix as MapPicker.
const fixIcon = () => {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
};

export default function AdminConversationsPage() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState('conversations');
  useEffect(fixIcon, []);

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t('admin.conversations_monitor')} />
      <div className="flex gap-1.5 bg-surface-alt rounded-pill p-1 w-fit">
        {[
          { key: 'conversations', label: t('admin.conversations') },
          { key: 'live',          label: t('admin.live_locations') },
        ].map((tabDef) => (
          <button key={tabDef.key} onClick={() => setTab(tabDef.key)}
            className={`px-4 py-1.5 rounded-pill text-[13px] font-semibold transition ${
              tab === tabDef.key ? 'bg-primary text-primary-fg shadow-soft' : 'text-fg-muted hover:bg-surface'
            }`}>{tabDef.label}</button>
        ))}
      </div>

      {tab === 'conversations' && <ConversationsTab locale={i18n.language} />}
      {tab === 'live' && <LiveLocationsTab />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Conversations list + drill-in
// ─────────────────────────────────────────────────────────────────────

function ConversationsTab({ locale }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null); // selected conversation id
  const [error, setError] = useState('');
  const loadVersion = useRef(0);

  const load = (p = page, q = search) => {
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    adminListConversations({ page: p, limit: 30, search: q })
      .then((res) => { if (version === loadVersion.current) { setItems(res.data || []); setTotal(res.total || 0); } })
      .catch((e) => { if (version === loadVersion.current) { setItems([]); setTotal(0); setError(apiError(e)); } })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };
  useEffect(() => { load(1, ''); }, []);

  const onSearch = (e) => { e.preventDefault(); setPage(1); load(1, search); };

  if (open) {
    return <ConversationDetail id={open} onBack={() => setOpen(null)} locale={locale} />;
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onSearch} className="flex gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.search_by_name_email_phone')}
          className="flex-1 px-3 py-2 rounded-card border border-border bg-surface focus:border-primary outline-none text-[14px]" />
        <button type="submit" className="px-4 py-2 rounded-pill bg-primary text-primary-fg text-[13px] font-bold">
          {t('admin.search')}
        </button>
      </form>

      <div className="text-[12px] text-fg-subtle">{t('admin.total_count', { count: total.toLocaleString() })}</div>
      {error && <div role="alert" className="text-rose-700 text-[13px]">{error}</div>}

      {loading ? <Skeleton /> : items.length === 0 ? (
        <div className="bg-surface rounded-card border border-border"><EmptyState icon="💬" title={t('admin.no_results')} /></div>
      ) : (
        <div className="space-y-1.5">
          {items.map((c) => (
            <button key={c.id} onClick={() => setOpen(c.id)}
              className="w-full text-start bg-surface rounded-card border border-border p-3 hover:border-primary transition">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="font-bold text-ink text-[14px] truncate flex-1">{c.participants_names || `#${c.id}`}</div>
                <span className="text-[11px] text-fg-subtle shrink-0">{c.last_message_at ? formatTime(c.last_message_at, locale) : '—'}</span>
              </div>
              <div className="text-[12.5px] text-fg-muted line-clamp-1">{c.last_message || <i className="opacity-60">{t('admin.no_messages')}</i>}</div>
              <div className="flex items-center gap-2 mt-1.5 text-[11px] text-fg-subtle">
                <span>💬 {c.messages_count || 0}</span>
                {c.locations_count > 0 && <span>📍 {c.locations_count}</span>}
                {c.request_id && <span>📋 #{c.request_id}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {total > 30 && (
        <div className="flex items-center justify-between gap-2 pt-3">
          <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p); }}
            className="px-3 py-1.5 rounded-pill bg-surface-alt text-[13px] font-semibold disabled:opacity-40">←</button>
          <span className="text-[12px] text-fg-muted">{page} / {Math.ceil(total / 30)}</span>
          <button disabled={page >= Math.ceil(total / 30)} onClick={() => { const p = page + 1; setPage(p); load(p); }}
            className="px-3 py-1.5 rounded-pill bg-surface-alt text-[13px] font-semibold disabled:opacity-40">→</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Single conversation: messages timeline + locations on map
// ─────────────────────────────────────────────────────────────────────

function ConversationDetail({ id, onBack, locale }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setData(null); setLoading(true); setError('');
    adminGetConversation(id)
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) setError(apiError(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const participantById = useMemo(() => {
    const m = Object.create(null);
    (data?.participants || []).forEach((p) => { m[p.user_id] = p; });
    return m;
  }, [data]);

  const trailByUser = useMemo(() => {
    const groups = Object.create(null);
    (data?.locations || []).forEach((l) => {
      if (!validLocation(l)) return;
      if (!groups[l.user_id]) groups[l.user_id] = [];
      groups[l.user_id].push([Number(l.latitude), Number(l.longitude)]);
    });
    return groups;
  }, [data]);

  const mapCenter = useMemo(() => {
    const all = (data?.locations || []).filter(validLocation);
    if (all.length === 0) return null;
    const lat = all.reduce((s, l) => s + Number(l.latitude), 0) / all.length;
    const lng = all.reduce((s, l) => s + Number(l.longitude), 0) / all.length;
    return [lat, lng];
  }, [data]);

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-[13px] text-primary font-semibold inline-flex items-center gap-1">
        ← {t('common.back')}
      </button>

      {loading && <Skeleton />}
      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-card text-[13px]">{error}</div>}

      {data && (
        <>
          {/* Participants */}
          <div className="bg-surface rounded-card border border-border p-3">
            <div className="text-[12px] font-bold text-fg-muted mb-2">{t('admin.participants')}</div>
            <div className="flex flex-wrap gap-2">
              {data.participants.map((p) => (
                <div key={p.user_id} className="flex items-center gap-2 bg-surface-alt rounded-pill px-2.5 py-1.5">
                  <span className={`w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold text-white ${
                    p.role === 'client' ? 'bg-sky-500' : p.role === 'provider' ? 'bg-emerald-500' : 'bg-violet-500'
                  }`}>{p.role[0].toUpperCase()}</span>
                  <div className="text-[12.5px]">
                    <div className="font-semibold text-ink leading-tight">{p.full_name}</div>
                    <div className="text-[10.5px] text-fg-subtle leading-tight">{p.email || p.phone}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Map of location trail */}
          {mapCenter && (
            <div className="bg-surface rounded-card border border-border overflow-hidden">
              <div className="px-3 py-2 text-[12px] font-bold text-fg-muted border-b border-border">
                📍 {t('admin.location_trail')} ({data.locations.length})
              </div>
              <MapContainer center={mapCenter} zoom={13} style={{ height: 320, width: '100%' }}>
                <BaseTileLayer />
                {Object.entries(trailByUser).map(([uid, pts]) => {
                  const u = participantById[uid] || {};
                  const color = u.role === 'client' ? '#0ea5e9' : u.role === 'provider' ? '#10b981' : '#8b5cf6';
                  return (
                    <Fragment key={uid}>
                      <Polyline positions={pts} pathOptions={{ color, weight: 3, opacity: 0.7 }} />
                      {pts.map((pt, i) => (
                        <CircleMarker key={i} center={pt} radius={5} pathOptions={{ color, fillColor: color, fillOpacity: 1 }}>
                          <Popup>
                            <div className="text-[12px]">
                              <b>{u.full_name || `#${uid}`}</b><br/>
                              {pt[0].toFixed(5)}, {pt[1].toFixed(5)}
                            </div>
                          </Popup>
                        </CircleMarker>
                      ))}
                    </Fragment>
                  );
                })}
              </MapContainer>
            </div>
          )}

          {/* Messages timeline */}
          <div className="bg-surface rounded-card border border-border">
            <div className="px-3 py-2 text-[12px] font-bold text-fg-muted border-b border-border">
              💬 {t('admin.messages')} ({data.messages.length})
            </div>
            <div className="p-3 space-y-2 max-h-[560px] overflow-y-auto">
              {data.messages.length === 0 && <div className="text-center text-fg-subtle text-[13px] py-6">{t('admin.no_messages')}</div>}
              {data.messages.map((m) => {
                const sender = participantById[m.sender_id] || {};
                const isClient = sender.role === 'client';
                return (
                  <div key={m.id} className={`flex ${isClient ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[78%] px-3 py-2 rounded-card text-[13.5px] ${
                      isClient ? 'bg-surface-alt text-ink' : 'bg-primary-soft text-ink'
                    }`}>
                      <div className="text-[10.5px] text-fg-subtle mb-1 flex items-center gap-1.5">
                        <span className="font-bold">{sender.full_name || `#${m.sender_id}`}</span>
                        <span>·</span>
                        <span>{formatTime(m.created_at, locale)}</span>
                        {m.deleted_at && <span className="text-rose-500">· {t('admin.deleted')}</span>}
                      </div>
                      {m.message_type === 'voice' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xl">🎙️</span>
                          <span className="font-semibold">{t('admin.voice_message')}</span>
                          {m.duration_seconds && <span className="text-[11.5px] text-fg-subtle">· {m.duration_seconds}s</span>}
                        </div>
                      ) : m.message_type === 'location' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xl">📍</span>
                          <span>{m.latitude?.toFixed?.(5)}, {m.longitude?.toFixed?.(5)}</span>
                        </div>
                      ) : m.message_type === 'image' || m.message_type === 'file' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xl">📎</span>
                          {safeUrl(m.attachment_url) ? <a href={safeUrl(m.attachment_url)} target="_blank" rel="noopener noreferrer" className="underline">{t('admin.attachment')}</a> : <span>{t('admin.attachment')}</span>}
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{m.content}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Live locations across the platform
// ─────────────────────────────────────────────────────────────────────

function LiveLocationsTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  const load = () => {
    setLoading(true); setError('');
    pollRef.current?.refresh();
  };
  useEffect(() => {
    const poll = createPollingLoop(adminListLiveLocations, {
      intervalMs: 15000,
      onResult: (rows) => { setItems((rows || []).filter(validLocation)); setError(''); setLoading(false); },
      onError: (e) => { setItems([]); setError(apiError(e)); setLoading(false); },
    });
    pollRef.current = poll;
    return () => { poll.stop(); pollRef.current = null; };
  }, []);

  const center = useMemo(() => {
    if (!items.length) return [24.7136, 46.6753]; // default: Riyadh
    const lat = items.reduce((s, i) => s + Number(i.latitude), 0) / items.length;
    const lng = items.reduce((s, i) => s + Number(i.longitude), 0) / items.length;
    return [lat, lng];
  }, [items]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-fg-muted">
          {loading ? t('admin.loading') : t('admin.live_count', { count: items.length })}
        </div>
        <button onClick={load} className="px-3 py-1.5 rounded-pill bg-surface-alt text-[12px] font-semibold">
          ↻ {t('admin.refresh')}
        </button>
      </div>

      {error && <div role="alert" className="text-rose-700 text-[13px]">{error}</div>}

      {items.length === 0 ? (
        <div className="bg-surface rounded-card border border-border"><EmptyState icon="📍" title={t('admin.no_live_locations')} /></div>
      ) : (
        <div className="bg-surface rounded-card border border-border overflow-hidden">
          <MapContainer center={center} zoom={6} style={{ height: 500, width: '100%' }}>
            <BaseTileLayer />
            {items.map((l) => (
              <Marker key={l.id} position={[Number(l.latitude), Number(l.longitude)]}>
                <Popup>
                  <div className="text-[12px]">
                    <b>{l.full_name}</b> ({l.role})<br/>
                    {l.email}<br/>
                    📍 {Number(l.latitude).toFixed(5)}, {Number(l.longitude).toFixed(5)}<br/>
                    {l.accuracy_m && <span>± {l.accuracy_m}m · </span>}
                    {l.speed_kmh && <span>🚗 {Number(l.speed_kmh).toFixed(1)} {t('common.speed_unit')}</span>}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-[68px] rounded-card bg-surface border border-border animate-pulse" />
      ))}
    </div>
  );
}

function formatTime(iso, locale) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(locale || 'ar', { dateStyle: 'short', timeStyle: 'short' });
}
