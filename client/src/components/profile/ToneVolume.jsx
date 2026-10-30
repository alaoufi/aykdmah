import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { chime, getToneVolume, setToneVolume } from '../../utils/ringtone';

// Notification volume (AYK-057): the message tone and the call ring inside the site.
export default function ToneVolume() {
  const { t } = useTranslation();
  const [volume, setVolume] = useState(getToneVolume);
  const change = value => { setVolume(value); setToneVolume(value); };
  return (
    <div className="card mb-4" id="tone-volume" data-testid="tone-volume">
      <label htmlFor="tone-volume-range" className="font-bold block mb-2">
        {volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'} {t('tone.title')}: {volume}%
      </label>
      <div className="flex items-center gap-3">
        <input id="tone-volume-range" type="range" min="0" max="100" step="10" value={volume}
          onChange={e => change(Number(e.target.value))} className="flex-1 accent-[var(--primary)]" />
        <button type="button" className="btn btn-outline btn-sm" onClick={() => chime()} disabled={volume === 0}>▶ {t('tone.try')}</button>
      </div>
      <p className="text-[12.5px] text-fg-muted mt-2 mb-0">{t('tone.hint')}</p>
    </div>
  );
}
