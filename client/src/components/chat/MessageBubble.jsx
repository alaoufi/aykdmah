import { safeUrl } from '../../utils/urlSafety';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isValidCoordinates } from '../../utils/geolocation.mjs';
import { formatTime } from '../../utils/formatters';

function ReplyPreview({ message }) {
  const { t } = useTranslation();
  const preview = message.reply_type === 'image' ? '🖼️ ' + (message.reply_content || '')
    : message.reply_type === 'voice' ? '🎙️ ' + t('chat.voice_message')
    : message.reply_type === 'location' ? '📍 ' + t('chat.shared_location')
    : message.reply_type === 'file' ? '📄 ' + (message.reply_content || '')
    : message.reply_content || '';
  return (
    <div className="reply-preview">
      <div className="reply-name">{message.reply_sender_name || '—'}</div>
      <div className="reply-body">{preview || t('chat.message_deleted')}</div>
    </div>
  );
}

// Map preview built from the same OpenStreetMap tiles the app's maps use (the former
// static-map service no longer answers): a 3×3 tile block positioned so the shared
// point sits under the pin in the middle of the thumbnail.
const THUMB_W = 260, THUMB_H = 140, TILE = 256, ZOOM = 16;
function MapThumb({ lat, lng, label }) {
  const n = 2 ** ZOOM;
  const rad = lat * Math.PI / 180;
  const x = (lng + 180) / 360 * n;
  const y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n;
  const tx = Math.floor(x), ty = Math.floor(y);
  const left = THUMB_W / 2 - (x - tx + 1) * TILE, top = THUMB_H / 2 - (y - ty + 1) * TILE;
  const tiles = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    tiles.push({ key: `${dx}${dy}`, src: `https://tile.openstreetmap.org/${ZOOM}/${(tx + dx + n) % n}/${ty + dy}.png`, dx, dy });
  }
  return (
    <div className="map-thumb relative overflow-hidden bg-surface-alt" style={{ width: '100%', maxWidth: THUMB_W, height: THUMB_H }} role="img" aria-label={label}>
      <div className="absolute" style={{ left: `calc(50% - ${THUMB_W / 2}px + ${left}px)`, top, width: TILE * 3, height: TILE * 3 }}>
        {tiles.map(tile => (
          <img key={tile.key} src={tile.src} alt="" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" draggable="false"
            className="absolute max-w-none" style={{ left: (tile.dx + 1) * TILE, top: (tile.dy + 1) * TILE, width: TILE, height: TILE }}
            onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
        ))}
      </div>
      <span className="map-pin absolute text-2xl leading-none" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -100%)' }} aria-hidden="true">📍</span>
      <span className="absolute bottom-0 end-0 bg-surface/80 text-[9px] text-fg-muted px-1" dir="ltr">© OpenStreetMap</span>
    </div>
  );
}

function LocationCard({ lat, lng }) {
  const { t } = useTranslation();
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  return (
    <a href={gmaps} target="_blank" rel="noopener noreferrer" className="location-card no-underline">
      <MapThumb lat={Number(lat)} lng={Number(lng)} label={t('chat.shared_location')} />
      <div className="location-meta">
        <div className="location-title">{t('chat.shared_location')}</div>
        <div className="location-coords">{Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}</div>
        <div className="location-open">🧭 {t('chat.open_in_maps')}</div>
      </div>
    </a>
  );
}

export default function MessageBubble({ message, isMine, onReply, onDelete, renderTranslation }) {
  const { t } = useTranslation();
  const [showMenu, setShowMenu] = useState(false);

  const hasFiles = Array.isArray(message.files) && message.files.length > 0;
  const hasAudio = hasFiles && message.files.some(file => file.file_type?.startsWith('audio/') && safeUrl(file.file_url));
  const hasVideo = hasFiles && message.files.some(file => file.file_type?.startsWith('video/') && safeUrl(file.file_url));
  const isLocation = message.message_type === 'location' && message.latitude != null && message.longitude != null && isValidCoordinates(Number(message.latitude), Number(message.longitude));
  const isSystem = message.message_type === 'system';

  if (isSystem) {
    return (
      <div className="text-center my-3">
        <span className="inline-block px-3 py-1 rounded-pill bg-slate-100 text-slate-500 text-[11px]">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`bubble-row ${isMine ? 'mine' : 'theirs'}`} onDoubleClick={() => setShowMenu(true)}>
      <div className={`bubble ${isMine ? 'mine' : 'theirs'} ${isLocation ? 'has-location' : ''}`}>
        {message.reply_to_id && message.reply_content !== undefined && (
          <ReplyPreview message={message} />
        )}
        {isLocation && (
          <LocationCard lat={Number(message.latitude)} lng={Number(message.longitude)} />
        )}
        {message.content && !isLocation && <div className="content">{message.content}</div>}
        {message.content && isLocation && <div className="content content-after-location">{message.content}</div>}

        {hasFiles && (
          <div className="files">
            {message.files.map(f => {
              const url = safeUrl(f.file_url);
              if (!url) return null;
              const isImage = (f.file_type || '').startsWith('image/');
              const isAudio = (f.file_type || '').startsWith('audio/');
              const isVideo = (f.file_type || '').startsWith('video/');
              if (isImage) {
                return (
                  <a key={f.id} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={f.file_name} loading="lazy" />
                  </a>
                );
              }
              if (isAudio) {
                return (
                  <audio key={f.id} controls preload="none" src={url} className="voice-player" aria-label={t('chat.voice_message')}>
                    {t('chat.audio_unavailable')} <a href={url} target="_blank" rel="noopener noreferrer">{f.file_name || t('chat.attachment')}</a>
                  </audio>
                );
              }
              if (isVideo) {
                return (
                  <video key={f.id} controls playsInline preload="none" src={url} className="video-player" aria-label={t('chat.video_message')}>
                    {t('chat.video_unavailable')} <a href={url} target="_blank" rel="noopener noreferrer">{f.file_name || t('chat.attachment')}</a>
                  </video>
                );
              }
              return (
                <a key={f.id} href={url} target="_blank" rel="noopener noreferrer" className="file-link">
                  📄 {f.file_name || t('chat.attachment')}
                </a>
              );
            })}
          </div>
        )}
        {(message.content || hasAudio || hasVideo) && renderTranslation?.(message)}

        <div className="meta">
          <span>{formatTime(message.created_at)}</span>
          {isMine && <span className="read-ticks">{message.is_read ? ' ✓✓' : ' ✓'}</span>}
        </div>

        <button className="msg-action" onClick={() => setShowMenu(v => !v)} aria-label={t('common.more')}>⋯</button>
        {showMenu && (
          <div className="menu" onMouseLeave={() => setShowMenu(false)}>
            {onReply && (
              <button onClick={() => { setShowMenu(false); onReply(message); }}>↩ {t('chat.reply')}</button>
            )}
            {isMine && onDelete && (
              <button className="danger" onClick={() => { setShowMenu(false); onDelete(message); }}>🗑 {t('admin.delete')}</button>
            )}
          </div>
        )}
      </div>

      <style>{`
        .bubble-row { display: flex; margin: 6px 0; }
        .bubble-row.mine { justify-content: flex-end; }
        .bubble-row.theirs { justify-content: flex-start; }
        .bubble {
          position: relative;
          max-width: 78%; padding: 8px 12px; border-radius: 14px;
          word-wrap: break-word; overflow-wrap: anywhere;
          box-shadow: 0 1px 1px rgba(0,0,0,.06);
        }
        .bubble.mine {
          background: linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)));
          color: #fff; border-bottom-end-radius: 4px;
        }
        .bubble.theirs { background: #ffffff; color: #0f172a; border-bottom-start-radius: 4px; border: 1px solid rgba(15,23,42,.08); }
        .bubble.has-location { padding: 6px; }
        .content { white-space: pre-wrap; line-height: 1.45; font-size: 14px; padding-bottom: 2px; }
        .content-after-location { padding: 8px 8px 2px 8px; }
        .files { margin-top: 6px; display: flex; flex-direction: column; gap: 6px; }
        .files img { max-width: min(240px, 100%); max-height: 280px; border-radius: 10px; display: block; }
        .voice-player { width: 220px; max-width: 100%; }
        .video-player { display: block; width: min(280px, 100%); max-height: 360px; border-radius: 10px; background: #0f172a; }
        .file-link { color: inherit; text-decoration: underline; opacity: .9; font-size: 13px; }
        .meta {
          font-size: 10.5px; opacity: .7; margin-top: 4px; text-align: end;
          display: flex; gap: 4px; justify-content: flex-end; align-items: center;
        }
        .read-ticks { letter-spacing: -1px; font-weight: 700; }
        .bubble.mine .read-ticks { color: #f0fdfa; }
        .reply-preview {
          background: rgba(255,255,255,.18); border-inline-start: 3px solid rgba(255,255,255,.55);
          padding: 6px 10px; border-radius: 8px; margin-bottom: 6px; font-size: 12.5px;
        }
        .bubble.theirs .reply-preview {
          background: rgb(var(--color-primary) / .08); border-inline-start-color: rgb(var(--color-primary));
        }
        .reply-name { font-weight: 700; opacity: .9; margin-bottom: 2px; }
        .reply-body { opacity: .85; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .location-card {
          display: block; color: inherit; border-radius: 10px; overflow: hidden;
          background: rgba(0,0,0,.05); margin-bottom: 4px;
        }
        .bubble.theirs .location-card { background: #f1f5f9; }
        .map-thumb { position: relative; height: 140px; background: #cbd5e1; }
        .map-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .map-pin { position: absolute; inset: 0; display: grid; place-items: center; font-size: 32px; text-shadow: 0 2px 4px rgba(0,0,0,.4); }
        .location-meta { padding: 8px 10px; }
        .location-title { font-weight: 700; font-size: 13px; }
        .location-coords { font-size: 11px; opacity: .75; margin-top: 1px; font-family: ui-monospace, monospace; }
        .location-open { font-size: 12px; opacity: .9; margin-top: 4px; font-weight: 600; }
        .msg-action {
          position: absolute; top: 4px; inset-inline-end: 4px;
          width: 22px; height: 22px; border-radius: 50%; border: 0;
          background: transparent; color: inherit; opacity: 0;
          cursor: pointer; font-size: 14px; line-height: 1;
          transition: opacity .15s;
        }
        .bubble:hover .msg-action { opacity: .7; }
        .msg-action:hover { background: rgba(0,0,0,.15); opacity: 1; }
        .menu {
          position: absolute; top: 28px; inset-inline-end: 4px;
          background: #fff; color: #0f172a; border: 1px solid #e2e8f0;
          border-radius: 10px; box-shadow: 0 6px 18px rgba(15,23,42,.12);
          padding: 4px; min-width: 130px; z-index: 10;
          display: flex; flex-direction: column;
        }
        .menu button {
          background: transparent; border: 0; padding: 7px 10px;
          text-align: start; cursor: pointer; font-size: 13px; border-radius: 6px;
        }
        .menu button:hover { background: #f1f5f9; }
        .menu button.danger { color: #dc2626; }
      `}</style>
    </div>
  );
}
