import { useTranslation } from 'react-i18next';
import VoiceNote from '../chat/VoiceNote';
import { safeUrl } from '../../utils/urlSafety';

// A request's voice description, photos and video (AYK-043), shown on the request
// page and at the top of every chat about the request.
const kind = file => {
  const type = String(file.file_type || '').toLowerCase();
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('image/')) return 'image';
  return 'file';
};

export default function RequestMedia({ files = [] }) {
  const { t } = useTranslation();
  if (!files.length) return null;
  return (
    <div className="space-y-2" data-testid="request-media">
      {files.filter(f => kind(f) === 'audio').map(f => (
        <div key={f.id} className="max-w-sm">
          <div className="text-[12px] text-fg-muted mb-1">🎤 {t('requester.voice_media')}</div>
          <VoiceNote src={safeUrl(f.file_url)} seed={f.id} fallbackName={f.file_name} />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {files.filter(f => kind(f) === 'image').map(f => (
          <a key={f.id} href={safeUrl(f.file_url) || undefined} target="_blank" rel="noopener noreferrer">
            <img src={safeUrl(f.file_url) || undefined} alt={f.file_name || ''} loading="lazy" className="w-24 h-24 object-cover rounded-card border border-border" />
          </a>
        ))}
        {files.filter(f => kind(f) === 'video').map(f => (
          <video key={f.id} src={safeUrl(f.file_url) || undefined} controls preload="metadata" className="w-48 max-w-full rounded-card border border-border" />
        ))}
        {files.filter(f => kind(f) === 'file').map(f => (
          <a key={f.id} href={safeUrl(f.file_url) || undefined} target="_blank" rel="noopener noreferrer" className="badge">📎 {f.file_name}</a>
        ))}
      </div>
    </div>
  );
}
