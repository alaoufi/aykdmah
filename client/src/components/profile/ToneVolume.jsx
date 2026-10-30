import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { chime, getToneVolume, setToneVolume } from '../../utils/ringtone';
import api, { apiError } from '../../services/api';

// Notification volume (AYK-057): the message tone and the call ring inside the site.
export default function ToneVolume() {
  const { t } = useTranslation();
  const [volume, setVolume] = useState(getToneVolume);
  const change = value => { setVolume(value); setToneVolume(value); };
  // A real notification to this account's devices (AYK-061).
  const [test, setTest] = useState('');
  const sendTest = async () => {
    setTest('⏳');
    try { const { data } = await api.post('/push/test'); setTest(data.data.sent ? t('tone.test_sent') : t('tone.test_none')); }
    catch (err) { setTest(apiError(err)); }
  };
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
      <div className="mt-3 pt-3 border-t border-border">
        <button type="button" className="btn btn-primary btn-sm" onClick={sendTest} data-testid="push-test">🔔 {t('tone.test')}</button>
        {test && <p className="text-[13px] font-semibold mt-2 mb-0" role="status">{test}</p>}
        <details className="mt-2 text-[12.5px] text-fg-muted">
          <summary className="font-semibold text-primary cursor-pointer">{t('tone.android_title')}</summary>
          <ol className="ps-5 mt-1 mb-0 space-y-1">{t('tone.android_steps').split('|').map(step => <li key={step}>{step}</li>)}</ol>
        </details>
      </div>
    </div>
  );
}
