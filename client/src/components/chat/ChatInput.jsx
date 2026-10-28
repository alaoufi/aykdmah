import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useVoiceRecording, { useVideoRecording } from '../../hooks/useVoiceRecording';
import {
  addChatAttachments, CHAT_ATTACHMENT_ACCEPT, CHAT_MEDIA_MAX_BYTES, CHAT_MEDIA_MAX_FILES,
  recordingTime, VIDEO_MAX_SECONDS, VOICE_MAX_SECONDS,
} from '../../utils/chatMedia';
import ChatDraftAttachment from './ChatDraftAttachment';
import ChatCameraPreview from './ChatCameraPreview';

const EMOJIS = ['😀', '😂', '😍', '👍', '🙏', '🔥', '✅', '❤️', '👏', '💯', '🎉', '😎'];

export default function ChatInput({ onSend, onShareLocation, sharingLocation, disabled, sessionKey }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const captureRef = useRef(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const mountedRef = useRef(false);
  const sendingRef = useRef(false);
  const ownerRevisionRef = useRef(0);

  const addFiles = selected => {
    const result = addChatAttachments(filesRef.current, selected);
    setError(result.error);
    if (!result.error) {
      filesRef.current = result.files;
      setFiles(result.files);
    }
  };
  const voice = useVoiceRecording(file => addFiles([file]), sessionKey);
  const video = useVideoRecording(file => addFiles([file]), sessionKey);
  const videoRecording = video.status !== 'idle';
  const activeRecorder = videoRecording ? video : voice;
  const recording = voice.status !== 'idle' || videoRecording;
  const busy = disabled || sending || recording;
  const visibleError = error || video.error || voice.error;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ownerRevisionRef.current += 1;
    };
  }, []);

  useEffect(() => {
    ownerRevisionRef.current += 1;
    sendingRef.current = false;
    filesRef.current = [];
    setText('');
    setFiles([]);
    setError(null);
    setSending(false);
    setShowEmoji(false);
    setShowVideo(false);
  }, [sessionKey]);

  useEffect(() => {
    if (disabled) { voice.cancel(); video.cancel(); }
  }, [disabled, voice.cancel, video.cancel]);

  const handleSend = async () => {
    if (disabled || sendingRef.current || recording) return;
    const trimmed = text.trim();
    const attachments = filesRef.current;
    if (!trimmed && attachments.length === 0) return;
    const ownerRevision = ownerRevisionRef.current;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      const sent = await onSend({ content: trimmed, files: attachments });
      if (sent === false || !mountedRef.current || ownerRevision !== ownerRevisionRef.current) return;
      setText('');
      filesRef.current = [];
      setFiles([]);
      setShowEmoji(false);
      setShowVideo(false);
      inputRef.current?.focus();
    } catch (_) { /* A failed send keeps the text and playable attachments for retry. */ }
    finally {
      if (ownerRevision === ownerRevisionRef.current) {
        sendingRef.current = false;
        if (mountedRef.current) setSending(false);
      }
    }
  };

  const handleKey = event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSend();
    }
  };
  const removeFile = file => {
    const next = filesRef.current.filter(item => item !== file);
    filesRef.current = next;
    setFiles(next);
    setError(null);
  };
  const selectFiles = event => {
    voice.cancel();
    video.cancel();
    addFiles(event.target.files);
    // Choosing the same file after cancelling or deleting it must work again.
    event.target.value = '';
    setShowVideo(false);
  };
  const startRecording = () => {
    if (busy) return;
    video.cancel();
    setError(null);
    setShowEmoji(false);
    setShowVideo(false);
    if (filesRef.current.length >= CHAT_MEDIA_MAX_FILES) { setError('chat.media_limit'); return; }
    voice.start(CHAT_MEDIA_MAX_BYTES - filesRef.current.reduce((sum, file) => sum + file.size, 0));
  };
  const startVideoRecording = () => {
    if (busy) return;
    voice.cancel();
    setError(null);
    setShowEmoji(false);
    setShowVideo(false);
    if (filesRef.current.length >= CHAT_MEDIA_MAX_FILES) { setError('chat.media_limit'); return; }
    video.start(CHAT_MEDIA_MAX_BYTES - filesRef.current.reduce((sum, file) => sum + file.size, 0));
  };

  return (
    <div className="chat-input">
      {visibleError && (
        <p className="chat-composer-error" role="alert">
          {t(visibleError, { count: CHAT_MEDIA_MAX_FILES, size: '3.5' })}
        </p>
      )}
      {files.length > 0 && (
        <div className="chat-draft-attachments">
          {files.map((file, index) => (
            <ChatDraftAttachment key={`${file.name}:${file.lastModified}:${index}`} file={file} disabled={busy} onRemove={() => removeFile(file)} />
          ))}
        </div>
      )}

      {recording && (
        <div className="chat-active-recording">
          {videoRecording && video.stream && <ChatCameraPreview stream={video.stream} />}
          <div className="chat-recording-controls">
            <span className="chat-recording-status" role="status" aria-live="polite">
              {activeRecorder.status === 'pending'
                ? t(videoRecording ? 'chat.camera_pending' : 'chat.microphone_pending')
                : t(videoRecording ? 'chat.video_recording_time' : 'chat.recording_time', { time: recordingTime(activeRecorder.elapsedMs), limit: videoRecording ? VIDEO_MAX_SECONDS : VOICE_MAX_SECONDS })}
            </span>
            {activeRecorder.status === 'recording' && <button type="button" onClick={activeRecorder.stop}>⏹ {t('chat.stop_recording')}</button>}
            <button type="button" onClick={activeRecorder.cancel}>{t('chat.cancel_recording')}</button>
          </div>
        </div>
      )}

      {showEmoji && (
        <div className="emoji-row">
          {EMOJIS.map(emoji => (
            <button type="button" key={emoji} disabled={busy} onClick={() => { setText(prev => prev + emoji); inputRef.current?.focus(); }}>{emoji}</button>
          ))}
        </div>
      )}

      {showVideo && (
        <div className="chat-video-actions" id="chat-video-actions">
          <button type="button" onClick={startVideoRecording} disabled={busy}>🔴 {t('chat.record_video')}</button>
          <button type="button" onClick={() => videoRef.current?.click()} disabled={busy}>📁 {t('chat.choose_video')}</button>
          <button type="button" onClick={() => captureRef.current?.click()} disabled={busy}>📹 {t('chat.native_capture_video')}</button>
        </div>
      )}

      <div className="input-row">
        <div className="wa-pill">
          <button type="button" onClick={() => { setShowEmoji(value => !value); setShowVideo(false); }} aria-label={t('chat.emoji')} aria-expanded={showEmoji} disabled={busy}>😀</button>
          <input ref={inputRef} type="text" value={text} onChange={event => setText(event.target.value)} onKeyDown={handleKey} placeholder={t('chat.placeholder')} aria-label={t('chat.placeholder')} disabled={busy} />
          <button type="button" onClick={() => fileRef.current?.click()} aria-label={t('request.attachments')} title={t('request.attachments')} disabled={busy}>📎</button>
          <button type="button" onClick={() => { setShowVideo(value => !value); setShowEmoji(false); }} aria-label={t('chat.video_message')} title={t('chat.video_message')} aria-expanded={showVideo} aria-controls="chat-video-actions" disabled={busy}>📷</button>
          {onShareLocation && (
            <button type="button" onClick={onShareLocation} disabled={busy || sharingLocation} aria-label={t('chat.share_location')} title={t('chat.share_location')}>📍</button>
          )}
        </div>
        {/* Like WhatsApp: a microphone while there is nothing to send, then the send arrow. */}
        {!text.trim() && files.length === 0 && !recording ? (
          <button type="button" className="send-btn" onClick={startRecording} disabled={busy} aria-label={t('chat.voice_message')} title={t('chat.voice_message')}>🎙️</button>
        ) : (
          <button type="button" className="send-btn" onClick={handleSend} disabled={busy || (!text.trim() && files.length === 0)} aria-label={t('common.send')}>➤</button>
        )}
        <input ref={fileRef} type="file" multiple hidden accept={CHAT_ATTACHMENT_ACCEPT} onChange={selectFiles} />
        <input ref={videoRef} type="file" hidden accept="video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.mov,.ogv" onChange={selectFiles} />
        <input ref={captureRef} type="file" hidden accept="video/*" capture="environment" onChange={selectFiles} />
      </div>

      <style>{`
        .chat-input { background: var(--wa-panel, var(--bg-card)); padding: 6px 8px 4px; min-width: 0; }
        .input-row { display: flex; align-items: flex-end; gap: 6px; }
        .wa-pill { flex: 1; min-width: 0; display: flex; align-items: center; gap: 0; background: var(--wa-in, var(--bg-card)); border-radius: 24px; padding: 0 4px; box-shadow: 0 1px .5px rgba(11,20,26,.13); }
        .wa-pill input { flex: 1; min-width: 0; padding: 11px 6px; border: 0; background: transparent; font: inherit; font-size: 15px; color: var(--wa-text, var(--text)); }
        .wa-pill input:focus { outline: none; }
        .wa-pill:focus-within { box-shadow: 0 0 0 2px var(--wa-accent, var(--primary)); }
        .wa-pill > button { min-width: 38px; font-size: 20px; padding: 4px; color: var(--wa-meta, var(--text-secondary)); }
        .chat-input button { cursor: pointer; font: inherit; color: var(--text-secondary); border: 0; background: transparent; border-radius: 8px; min-height: 44px; }
        .chat-input button:disabled { opacity: .45; cursor: not-allowed; }
        .chat-input button:focus-visible { outline: 2px solid var(--wa-accent, var(--primary)); outline-offset: 2px; }
        .wa-pill > button:hover:not(:disabled) { background: var(--wa-chip, var(--bg-soft)); border-radius: 50%; }
        .input-row .send-btn { flex: 0 0 48px; width: 48px; height: 48px; border-radius: 50%; background: var(--wa-accent, var(--primary)); color: #fff; font-size: 20px; box-shadow: 0 1px 2px rgba(11,20,26,.2); }
        .input-row .send-btn:hover:not(:disabled) { filter: brightness(.95); }
        .chat-composer-error { margin: 0 0 6px; padding: 8px; border-radius: 8px; color: var(--danger); background: var(--bg-soft); font-size: 13px; }
        .chat-recording-controls { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px 10px; background: var(--wa-in, var(--bg-soft)); border-radius: 24px; margin-bottom: 6px; }
        .chat-recording-status { flex: 1 1 160px; font-size: 13px; color: var(--danger); }
        .chat-recording-controls button, .chat-video-actions button { padding: 6px 10px; border: 1px solid var(--border); }
        .chat-camera-preview { display: block; width: 100%; max-height: 150px; object-fit: contain; background: #000; border-radius: 8px; margin-bottom: 5px; }
        .chat-video-actions { display: flex; gap: 6px; flex-wrap: wrap; padding: 6px; margin-bottom: 6px; border-radius: 12px; background: var(--wa-in, var(--bg-card)); }
        .chat-draft-attachments { display: flex; flex-wrap: wrap; gap: 8px; max-height: 220px; overflow-y: auto; padding: 6px 0; }
        .chat-draft-attachment { flex: 1 1 200px; min-width: 0; max-width: 100%; border: 1px solid var(--border); background: var(--bg-soft); border-radius: 8px; padding: 6px; }
        .chat-draft-attachment p { font-size: 12px; margin: 0 0 5px; color: var(--text-secondary); }
        .chat-draft-attachment audio { display: block; width: 100%; height: 44px; }
        .chat-draft-attachment video { display: block; width: 100%; max-height: 140px; border-radius: 6px; background: #000; }
        .chat-draft-attachment img { display: block; max-width: 100%; height: 80px; object-fit: contain; }
        .chat-draft-file-details { display: flex; gap: 6px; align-items: center; }
        .chat-draft-file-details span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; direction: ltr; }
        .chat-draft-file-details button { flex: 0 0 44px; }
        .emoji-row { padding: 6px; display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; border-radius: 12px; background: var(--wa-in, var(--bg-card)); }
        .emoji-row button { font-size: 22px; padding: 4px 6px; }
      `}</style>
    </div>
  );
}
