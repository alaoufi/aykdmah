import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export default function ChatCameraPreview({ stream }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    video.srcObject = stream;
    const playback = video.play();
    playback?.catch(() => {});
    return () => { video.pause(); video.srcObject = null; };
  }, [stream]);
  return <video ref={ref} className="chat-camera-preview" autoPlay playsInline muted aria-label={t('chat.camera_preview')} />;
}
