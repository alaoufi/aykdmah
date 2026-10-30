import { safeUrl } from '../../utils/urlSafety';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isValidCoordinates } from '../../utils/geolocation.mjs';
import { formatTime } from '../../utils/formatters';
import VoiceNote from './VoiceNote';
import { useAutoTranslation } from './AutoTranslation';

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

// WhatsApp-style bubble: tail on the first message of a run, time and ticks inside the
// bubble, voice notes with a waveform, photos that open full screen, inline video.
export default function MessageBubble({ message, isMine, onReply, onDelete, onForward, renderTranslation, firstInRun = true }) {
  const { t } = useTranslation();
  const [showMenu, setShowMenu] = useState(false);
  // The other side's words in my language, in place of the original (AYK-065).
  const translated = useAutoTranslation(message, isMine);
  const [showOriginal, setShowOriginal] = useState(false);
  const [viewer, setViewer] = useState(null);
  const rowRef = useRef(null);

  // The message menu and the photo viewer close with Escape; the menu also on a tap elsewhere.
  useEffect(() => {
    if (!showMenu && !viewer) return undefined;
    const onKey = e => { if (e.key === 'Escape') { setShowMenu(false); setViewer(null); } };
    const onDown = e => { if (showMenu && !rowRef.current?.querySelector('.menu')?.contains(e.target)) setShowMenu(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [showMenu, viewer]);

  const files = Array.isArray(message.files) ? message.files.filter(f => safeUrl(f.file_url)) : [];
  const kind = f => (f.file_type || '').split('/')[0];
  const hasMedia = files.some(f => ['audio', 'video', 'image'].includes(kind(f)));
  const isLocation = message.message_type === 'location' && message.latitude != null && message.longitude != null && isValidCoordinates(Number(message.latitude), Number(message.longitude));
  const isSystem = message.message_type === 'system';
  const mediaOnly = !message.content && files.length > 0 && files.every(f => ['image', 'video'].includes(kind(f)));

  if (isSystem) {
    return (
      <div className="text-center my-3">
        <span className="wa-system">{message.content}</span>
      </div>
    );
  }

  return (
    <div ref={rowRef} className={`bubble-row ${isMine ? 'mine' : 'theirs'} ${firstInRun ? 'first' : ''}`} onDoubleClick={() => setShowMenu(true)}>
      <div className={`bubble ${isMine ? 'mine' : 'theirs'} ${isLocation ? 'has-location' : ''} ${mediaOnly ? 'media-only' : ''} ${firstInRun ? 'tail' : ''}`}>
        {message.reply_to_id && message.reply_content !== undefined && (
          <ReplyPreview message={message} />
        )}
        {isLocation && (
          <LocationCard lat={Number(message.latitude)} lng={Number(message.longitude)} />
        )}

        {files.length > 0 && (
          <div className="files">
            {files.map(f => {
              const url = safeUrl(f.file_url);
              if (kind(f) === 'image') {
                return (
                  <button key={f.id} type="button" className="wa-photo" onClick={() => setViewer({ type: 'image', url, name: f.file_name })}
                    aria-label={t('chat.open_photo')}>
                    <img src={url} alt={f.file_name || t('chat.image')} loading="lazy" />
                  </button>
                );
              }
              if (kind(f) === 'audio') {
                return <VoiceNote key={f.id} src={url} seed={f.id} knownDuration={f.duration_seconds} fallbackName={f.file_name} />;
              }
              if (kind(f) === 'video') {
                return (
                  <video key={f.id} controls playsInline preload="metadata" src={`${url}#t=0.1`} className="video-player" aria-label={t('chat.video_message')}>
                    {t('chat.video_unavailable')} <a href={url} target="_blank" rel="noopener noreferrer">{f.file_name || t('chat.attachment')}</a>
                  </video>
                );
              }
              return (
                <a key={f.id} href={url} target="_blank" rel="noopener noreferrer" className="file-link">
                  <span className="file-icon" aria-hidden="true">📄</span>
                  <span className="file-name">{f.file_name || t('chat.attachment')}</span>
                </a>
              );
            })}
          </div>
        )}

        {message.content && <div className={`content ${isLocation ? 'content-after-location' : ''}`} data-testid={translated && !showOriginal ? 'auto-translation' : undefined}>
          {translated && !showOriginal ? translated : message.content}<span className="meta-spacer" aria-hidden="true" /></div>}
        {translated && (
          <button type="button" className="translated-note" onClick={() => setShowOriginal(v => !v)}>
            🌐 {t(showOriginal ? 'chat.show_translation' : 'chat.translated_show_original')}
          </button>
        )}

        <div className={`meta ${mediaOnly ? 'on-media' : ''}`}>
          <span>{formatTime(message.created_at)}</span>
          {isMine && (
            <span className={`read-ticks ${message.is_read ? 'read' : ''}`} aria-label={t(message.is_read ? 'chat.read' : 'chat.sent')}>
              {message.is_read ? '✓✓' : '✓'}
            </span>
          )}
        </div>

        {/* Shown beside the requester's own message in a request chat (AYK-043). */}
        {onForward && <button type="button" className="msg-forward" data-testid="forward-message" onClick={() => onForward(message)}>↪ {t('requester.forward')}</button>}

        <button className="msg-action" onClick={() => setShowMenu(v => !v)} aria-label={t('common.more')}>⌄</button>
        {showMenu && (
          <div className="menu" onMouseLeave={() => setShowMenu(false)}>
            {onReply && (
              <button onClick={() => { setShowMenu(false); onReply(message); }}>↩ {t('chat.reply')}</button>
            )}
            {/* Forwarding is the requester's only (onForward is never given to providers). */}
            {onForward && (
              <button onClick={() => { setShowMenu(false); onForward(message); }} data-testid="menu-forward">↪ {t('requester.forward')}</button>
            )}
            {message.content && navigator.clipboard && (
              <button onClick={() => { setShowMenu(false); navigator.clipboard.writeText(message.content).catch(() => {}); }}>📋 {t('chat.copy')}</button>
            )}
            {isMine && onDelete && (
              <button className="danger" onClick={() => { setShowMenu(false); onDelete(message); }}>🗑 {t('chat.delete_message')}</button>
            )}
          </div>
        )}
      </div>

      {viewer && (
        <div className="wa-viewer" role="dialog" aria-modal="true" aria-label={t('chat.open_photo')} onClick={() => setViewer(null)}>
          <button type="button" className="wa-viewer-close" onClick={() => setViewer(null)} aria-label={t('common.close')}>✕</button>
          <img src={viewer.url} alt={viewer.name || ''} onClick={e => e.stopPropagation()} />
          <a href={viewer.url} target="_blank" rel="noopener noreferrer" className="wa-viewer-open" onClick={e => e.stopPropagation()}>↗ {t('chat.open_original')}</a>
        </div>
      )}

      <style>{`
        .bubble-row { display: flex; margin: 1px 0; padding: 0 6px; }
        .bubble-row.first { margin-top: 8px; }
        .bubble-row.mine { justify-content: flex-end; }
        .bubble-row.theirs { justify-content: flex-start; }
        .bubble {
          position: relative; max-width: min(80%, 480px); padding: 6px 8px 6px 9px; border-radius: 8px;
          word-wrap: break-word; overflow-wrap: anywhere; color: var(--wa-text);
          box-shadow: 0 1px .5px rgba(11,20,26,.13);
        }
        .bubble.mine { background: var(--wa-out); }
        .bubble.theirs { background: var(--wa-in); }
        /* The small tail on the first bubble of a run (inline-end for mine, inline-start for theirs). */
        .bubble.tail.mine { border-start-end-radius: 0; }
        .bubble.tail.theirs { border-start-start-radius: 0; }
        .bubble.tail::before {
          content: ''; position: absolute; top: 0; width: 8px; height: 13px; background: inherit;
        }
        .bubble.tail.mine::before { inset-inline-end: -8px; clip-path: polygon(0 0, 100% 0, 0 100%); }
        .bubble.tail.theirs::before { inset-inline-start: -8px; clip-path: polygon(0 0, 100% 0, 100% 100%); }
        [dir="rtl"] .bubble.tail.mine::before { clip-path: polygon(0 0, 100% 0, 100% 100%); }
        [dir="rtl"] .bubble.tail.theirs::before { clip-path: polygon(0 0, 100% 0, 0 100%); }
        .bubble.has-location, .bubble.media-only { padding: 3px; }
        .content { white-space: pre-wrap; line-height: 1.45; font-size: 14.2px; padding: 0 2px; }
        .meta-spacer { display: inline-block; width: 64px; }
        .content-after-location { padding: 6px 6px 0; }
        .files { display: flex; flex-direction: column; gap: 4px; }
        .files + .content { margin-top: 4px; }
        .wa-photo { display: block; padding: 0; border: 0; background: none; cursor: zoom-in; border-radius: 6px; overflow: hidden; }
        .wa-photo img { display: block; width: min(300px, 100%); min-width: min(200px, 60vw); min-height: 140px; max-height: 340px; object-fit: cover; background: var(--wa-chip); }
        .video-player { display: block; width: min(300px, 100%); max-height: 360px; border-radius: 6px; background: #000; }
        .file-link { display: flex; align-items: center; gap: 8px; padding: 10px; border-radius: 6px; background: var(--wa-chip); color: inherit; text-decoration: none; font-size: 13px; }
        .file-icon { font-size: 26px; }
        .file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: ltr; }
        .meta {
          float: inline-end; margin: -12px 0 -4px; position: relative; top: 4px;
          font-size: 11px; color: var(--wa-meta); display: flex; gap: 3px; align-items: center; white-space: nowrap;
          padding-inline-start: 6px;
        }
        .meta.on-media {
          position: absolute; bottom: 8px; inset-inline-end: 10px; top: auto; margin: 0; float: none;
          color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.6);
        }
        .translated-note { display: block; font-size: 11px; opacity: .6; background: none; border: 0; padding: 0; margin-top: 2px; color: inherit; cursor: pointer; }
        .read-ticks { letter-spacing: -3px; font-weight: 700; padding-inline-end: 3px; }
        .read-ticks.read { color: var(--wa-tick); }
        .reply-preview {
          background: var(--wa-chip); border-inline-start: 4px solid var(--wa-accent);
          padding: 5px 8px; border-radius: 6px; margin-bottom: 4px; font-size: 12.5px;
        }
        .reply-name { font-weight: 700; color: var(--wa-accent); margin-bottom: 1px; }
        .reply-body { color: var(--wa-meta); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .location-card { display: block; color: inherit; border-radius: 6px; overflow: hidden; background: var(--wa-chip); margin-bottom: 2px; }
        .map-thumb { max-width: none !important; }
        .location-meta { padding: 6px 8px 14px; }
        .location-title { font-weight: 700; font-size: 13px; }
        .location-coords { font-size: 11px; color: var(--wa-meta); margin-top: 1px; font-family: ui-monospace, monospace; }
        .location-open { font-size: 12px; margin-top: 3px; font-weight: 600; color: var(--wa-accent); }
        .voice-note { display: flex; align-items: center; gap: 8px; width: min(280px, 72vw); padding: 4px 2px 10px; }
        .voice-note-play {
          flex: 0 0 34px; height: 34px; border: 0; border-radius: 50%; cursor: pointer;
          background: transparent; color: var(--wa-meta); font-size: 18px; line-height: 1;
        }
        .voice-note-body { flex: 1; min-width: 0; }
        .voice-note-wave { display: flex; align-items: center; gap: 2px; height: 26px; cursor: pointer; }
        .voice-note-wave span { flex: 1; min-width: 2px; border-radius: 2px; background: var(--wa-wave); }
        .voice-note-wave span.played { background: var(--wa-tick); }
        .voice-note-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--wa-meta); margin-top: 2px; }
        .voice-note-speed { border: 0; border-radius: 10px; padding: 0 6px; background: var(--wa-chip); color: var(--wa-meta); font-size: 11px; cursor: pointer; }
        .voice-note-mic {
          flex: 0 0 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
          background: var(--wa-chip); font-size: 18px;
        }
        .voice-note-audio { display: none; }
        .msg-forward { display: block; margin-top: 4px; padding: 2px 10px; border-radius: 999px; border: 1px solid currentColor;
          background: transparent; color: var(--primary); font: inherit; font-size: 11.5px; font-weight: 700; cursor: pointer; }
        .msg-action {
          position: absolute; top: 2px; inset-inline-end: 2px; width: 24px; height: 22px; border-radius: 50%; border: 0;
          background: var(--wa-action-bg); color: var(--wa-meta); opacity: 0; cursor: pointer; font-size: 15px; line-height: 1;
          transition: opacity .15s;
        }
        .bubble:hover .msg-action, .msg-action:focus-visible { opacity: 1; }
        @media (hover: none) { .msg-action { opacity: .55; } }
        .menu {
          position: absolute; top: 26px; inset-inline-end: 4px; z-index: 10;
          background: var(--wa-in); color: var(--wa-text); border-radius: 8px; box-shadow: 0 6px 18px rgba(11,20,26,.25);
          padding: 6px 0; min-width: 160px; display: flex; flex-direction: column;
        }
        .menu button { background: transparent; border: 0; padding: 9px 16px; text-align: start; cursor: pointer; font-size: 14px; color: inherit; }
        .menu button:hover { background: var(--wa-chip); }
        .menu button.danger { color: #ea0038; }
        .wa-system { display: inline-block; padding: 5px 12px; border-radius: 8px; background: var(--wa-system); color: var(--wa-meta); font-size: 12px; box-shadow: 0 1px .5px rgba(11,20,26,.13); }
        .wa-viewer { position: fixed; inset: 0; z-index: 1000; background: rgba(11,20,26,.94); display: grid; place-items: center; padding: 48px 12px; }
        .wa-viewer img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .wa-viewer-close { position: absolute; top: 10px; inset-inline-end: 12px; width: 44px; height: 44px; border: 0; border-radius: 50%; background: rgba(255,255,255,.12); color: #fff; font-size: 20px; cursor: pointer; }
        .wa-viewer-open { position: absolute; bottom: 14px; color: #fff; font-size: 13px; opacity: .85; }
      `}</style>
    </div>
  );
}
