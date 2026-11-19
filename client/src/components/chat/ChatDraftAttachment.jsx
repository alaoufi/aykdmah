import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { chatAttachmentKind } from '../../utils/chatMedia';

export default function ChatDraftAttachment({ file, onRemove, disabled }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const kind = chatAttachmentKind(file);
  useEffect(() => {
    if (!['audio', 'video', 'image'].includes(kind)) return undefined;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, kind]);

  return (
    <div className={`chat-draft-attachment chat-draft-${kind}`}>
      {kind === 'audio' && url && (
        <><p>{t('chat.recording_preview')}</p><audio controls preload="metadata" src={url} aria-label={t('chat.draft_audio')} /></>
      )}
      {kind === 'video' && url && <video controls playsInline preload="metadata" src={url} aria-label={t('chat.draft_video')} />}
      {kind === 'image' && url && <img src={url} alt={file.name} />}
      <div className="chat-draft-file-details">
        <span title={file.name}>{file.name}</span>
        <button type="button" onClick={onRemove} disabled={disabled} aria-label={t('chat.remove_attachment', { name: file.name })}>✕</button>
      </div>
    </div>
  );
}
