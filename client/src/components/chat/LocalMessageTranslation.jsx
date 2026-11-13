import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useLocalLanguageSession from '../../hooks/useLocalLanguageSession';
import { recordedAudioSamples } from '../../utils/localRecordedAudio';
import {
  LOCAL_LANGUAGES, LOCAL_TEXT_MAX_CHARACTERS, LOCAL_AUDIO_MAX_SECONDS,
  guessLocalSourceLanguage, localLanguageSupported, localVoiceForLanguage,
  normalizeLocalLanguage, abortLocalLanguage,
} from '../../utils/localLanguage.js';

const languageKeys = { ar: 'arabic', en: 'english', ur: 'urdu', hi: 'hindi', bn: 'bengali', ml: 'malayalam', fil: 'filipino', id: 'indonesian', ne: 'nepali', am: 'amharic', tr: 'turkish' };
const idle = { stage: null, percent: null };

export default function LocalMessageTranslation({ message, sessionKey, targetLanguage }) {
  const { t, i18n } = useTranslation();
  const owner = useId();
  const target = normalizeLocalLanguage(targetLanguage || i18n.resolvedLanguage || i18n.language);
  const files = (Array.isArray(message?.files) ? message.files : []).filter(file => /^(audio|video)\//.test(file.file_type || ''));
  const hasText = typeof message?.content === 'string' && !!message.content.trim();
  const [selection, setSelection] = useState(hasText ? 'text' : 'file:0');
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(idle);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const version = useRef(0);
  const controller = useRef(null);
  const inFlight = useRef(false);
  const utterance = useRef(null);
  const mounted = useRef(false);
  const session = useLocalLanguageSession(sessionKey, () => {
    cancel();
    setResult(null); setError(''); setProgress(idle); setConfirm(false); setReading(false);
  });
  const selectedFile = selection.startsWith('file:') ? files[Number(selection.slice(5))] : null;
  const kind = selectedFile ? 'audio' : 'text';
  const identity = `${message?.id}:${message?.content || ''}:${files.map(file => `${file.id}:${file.file_url}:${file.file_type}:${file.file_size}`).join('|')}`;

  function stopReading() {
    if (utterance.current) {
      utterance.current.onend = null;
      utterance.current.onerror = null;
      window.speechSynthesis?.cancel();
      utterance.current = null;
    }
    if (mounted.current) setReading(false);
  }

  function cancel() {
    version.current++;
    controller.current?.abort();
    controller.current = null;
    session.current?.cancel(owner);
    inFlight.current = false;
    stopReading();
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel(); };
  }, []);

  useEffect(() => {
    cancel(); setResult(null); setProgress(idle); setError('');
    return cancel;
  }, [identity, sessionKey, target, selection, sourceLanguage]);

  useEffect(() => {
    setConfirm(false);
    setOpen(false);
  }, [identity, sessionKey, target]);

  if ((!hasText && !files.length) || ['system', 'location'].includes(message?.message_type)) return null;

  const busy = !!progress.stage;
  const supported = () => localLanguageSupported(window);
  const messageSource = sourceLanguage === 'auto' ? guessLocalSourceLanguage(message?.content) : sourceLanguage;

  async function translate() {
    if (inFlight.current || !session.current?.current()) return;
    if (!supported()) { setError('unsupported'); return; }
    if (kind === 'text' && (!hasText || message.content.length > LOCAL_TEXT_MAX_CHARACTERS)) { setError('too_long'); return; }
    if (kind === 'text' && messageSource === target) { setError('same_language'); return; }
    inFlight.current = true;
    const currentVersion = ++version.current;
    const currentSession = session.current;
    const abort = new AbortController();
    controller.current = abort;
    const isCurrent = () => mounted.current && currentVersion === version.current && !abort.signal.aborted
      && currentSession === session.current && currentSession.current();
    setResult(null); setError(''); setProgress({ stage: 'loading', percent: null });
    try {
      const payload = { kind, sourceLanguage, targetLanguage: target };
      if (kind === 'audio') payload.audio = await recordedAudioSamples(selectedFile, { signal: abort.signal, isCurrent });
      else payload.text = message.content;
      if (!isCurrent()) throw abortLocalLanguage();
      const translated = await currentSession.run(payload, {
        owner, onProgress: update => { if (isCurrent()) setProgress(update); },
      });
      if (isCurrent()) setResult(translated);
    } catch (failure) {
      if (isCurrent() && failure?.name !== 'AbortError') {
        const known = ['failed', 'unsupported', 'too_long', 'same_language', 'audio_unsupported', 'private_file_unavailable', 'busy'];
        setError(known.includes(failure?.code) ? failure.code : 'failed');
      }
    } finally {
      if (currentVersion === version.current) {
        controller.current = null; inFlight.current = false;
        if (mounted.current) setProgress(idle);
      }
    }
  }

  function requestTranslation() {
    setOpen(true); setError('');
    if (!supported()) { setError('unsupported'); return; }
    if (kind === 'text' && message?.content?.length > LOCAL_TEXT_MAX_CHARACTERS) { setError('too_long'); return; }
    if (kind === 'text' && messageSource === target) { setError('same_language'); return; }
    if (!session.current?.allowed(kind)) { setConfirm(true); return; }
    void translate();
  }

  function readResult() {
    if (reading) { stopReading(); return; }
    const text = result?.translation || result?.transcript;
    if (!text || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') { setError('voice_unavailable'); return; }
    const voice = localVoiceForLanguage(window.speechSynthesis.getVoices(), target);
    if (!voice) { setError('voice_unavailable'); return; }
    stopReading();
    const readingVersion = version.current;
    const spoken = new window.SpeechSynthesisUtterance(`${result.numbersChanged ? t('local_translation.numbers_changed', { lng: target }) + ' ' : ''}${text}`);
    spoken.voice = voice;
    spoken.lang = voice.lang;
    const finished = () => {
      if (mounted.current && readingVersion === version.current) setReading(false);
      if (utterance.current === spoken) utterance.current = null;
    };
    spoken.onend = finished;
    spoken.onerror = finished;
    utterance.current = spoken;
    setReading(true);
    window.speechSynthesis.speak(spoken);
  }

  const progressKey = progress.stage === 'downloading'
    ? (progress.percent == null ? 'progress_unknown' : 'downloading') : progress.stage;
  const buttonClass = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-50';

  return (
    <div className="local-message-translation mt-2 text-xs" data-testid="local-message-translation">
      {!busy && (
        <button type="button" onClick={requestTranslation} className={buttonClass} data-testid="local-translate">
          🌐 {t(`local_translation.${kind === 'audio' ? 'translate_audio' : 'translate'}`)}
        </button>
      )}
      {open && (
        <div className="mt-2 space-y-2 rounded-xl border border-slate-300 bg-white p-2.5 text-slate-800" dir={i18n.dir()}>
          {(hasText && files.length > 0 || files.length > 1) && (
            <label className="block space-y-1">
              <span>{t('local_translation.select_attachment')}</span>
              <select value={selection} onChange={event => setSelection(event.target.value)} disabled={busy} className="block w-full rounded-lg border border-slate-300 bg-white p-1.5 text-xs">
                {hasText && <option value="text">{t('local_translation.text_option')}</option>}
                {files.map((file, index) => <option key={file.id || index} value={`file:${index}`}>{t('local_translation.media_option', { name: file.file_name || t('chat.attachment') })}</option>)}
              </select>
            </label>
          )}
          <label className="block space-y-1">
            <span>{t('local_translation.source_language')}</span>
            <select value={sourceLanguage} onChange={event => setSourceLanguage(event.target.value)} disabled={busy} className="block w-full rounded-lg border border-slate-300 bg-white p-1.5 text-xs" data-testid="local-source-language">
              <option value="auto">{t('local_translation.auto_detect')}</option>
              {LOCAL_LANGUAGES.map(language => <option key={language} value={language}>{t(`language.${languageKeys[language]}`)}</option>)}
            </select>
          </label>
          {kind === 'audio' && <p className="text-slate-600">{t('local_translation.audio_source_hint')}</p>}
          {confirm && (
            <div role="group" aria-label={t('local_translation.download_title')} className="space-y-2 rounded-lg bg-slate-100 p-2">
              <p className="font-semibold">{t('local_translation.download_title')}</p>
              <p>{t('local_translation.download_notice', { size: kind === 'audio' ? 720 : 670 })}</p>
              <p>{t('local_translation.privacy_notice')}</p>
              <p>{t('local_translation.cache_notice')}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass} data-testid="local-download-confirm" onClick={() => { session.current?.allow(kind); setConfirm(false); void translate(); }}>{t('local_translation.download_confirm')}</button>
                <button type="button" className={buttonClass} onClick={() => setConfirm(false)}>{t('local_translation.download_cancel')}</button>
              </div>
            </div>
          )}
          {busy && (
            <div className="space-y-2" aria-live="polite">
              <p role="status">{t(`local_translation.${progressKey}`, { percent: progress.percent })}</p>
              <button type="button" className={buttonClass} onClick={() => { cancel(); setProgress(idle); }}>{t('local_translation.stop')}</button>
            </div>
          )}
          {error && <p role="alert" className="font-medium text-amber-800">{t(`local_translation.${error}`, { seconds: LOCAL_AUDIO_MAX_SECONDS, characters: LOCAL_TEXT_MAX_CHARACTERS })}</p>}
          {result && (
            <div className="space-y-2" data-testid="local-translation-result">
              {result.transcript && <div><strong>{t('local_translation.transcript')}</strong><p className="whitespace-pre-wrap" dir={['ar', 'ur'].includes(result.sourceLanguage) ? 'rtl' : 'ltr'} lang={result.sourceLanguage}>{result.transcript}</p></div>}
              {result.translation && <div><strong>{t('local_translation.translated')}</strong><p className="whitespace-pre-wrap" dir={['ar', 'ur'].includes(target) ? 'rtl' : 'ltr'} lang={target}>{result.translation}</p></div>}
              {result.numbersChanged && <p role="alert" className="rounded-lg border border-amber-500 bg-amber-50 p-2 font-semibold text-amber-900">{t('local_translation.numbers_changed')}</p>}
              <p className="text-slate-600">{t('local_translation.machine_notice')}</p>
              <button type="button" className={buttonClass} onClick={readResult}>{reading ? '⏹' : '🔊'} {t(`local_translation.${reading ? 'stop_reading' : 'read_aloud'}`)}</button>
            </div>
          )}
          {!busy && <button type="button" className={buttonClass} onClick={() => { cancel(); setResult(null); setConfirm(false); setOpen(false); }}>{t('local_translation.hide')}</button>}
        </div>
      )}
    </div>
  );
}
