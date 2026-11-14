import { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { canRequestService } from '../utils/canRequest';
import { useTranslation } from 'react-i18next';
import usePublicSettings from '../hooks/usePublicSettings';
import { hiddenFields, requiredFields } from '../data/formFields';
import { listCategories, listServices } from '../services/serviceService';
import { createRequest } from '../services/requestService';
import { useAuth } from '../hooks/useAuth';
import useRequestLocation from '../hooks/useRequestLocation';
import { requestLocationFields, appendRequestLocation } from '../utils/requestLocation';
import useCountry from '../hooks/useCountry';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import RequestLocationFields from '../components/common/RequestLocationFields';
import { localizedName } from '../utils/localize';
import useVoiceRecording from '../hooks/useVoiceRecording';
import { addChatAttachments, CHAT_MEDIA_MAX_BYTES, recordingTime } from '../utils/chatMedia';
import VoiceNote from '../components/chat/VoiceNote';
import ProblemNotice from '../components/common/ProblemNotice';

const EMPTY_FORM = { category_id: '', service_id: '', title: '' };

export default function CreateRequestPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, refresh } = useAuth();
  const [params] = useSearchParams();
  const { country } = useCountry();
  const requestLocation = useRequestLocation({ user, params, fallbackCountryId: country?.id });

  // A profession page links here with ?category=<id> already chosen.
  const startForm = () => ({ ...EMPTY_FORM, category_id: params.get('category') || '', service_id: params.get('service') || '' });
  const [form, setForm] = useState(startForm);
  const operation = useRef(0);

  useEffect(() => {
    operation.current += 1;
    setForm(startForm()); setError(''); setLoading(false);
    return () => { operation.current += 1; };
  }, [user?.id]);
  useEffect(() => {
    listCategories().then(setCategories).catch(() => {});
  }, []);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v, ...(k === 'category_id' ? { service_id: '' } : {}) }));
  // The problem is described by voice, with optional photos or a short video (AYK-043).
  const [voiceFile, setVoiceFile] = useState(null);
  const [media, setMedia] = useState([]);
  const [mediaError, setMediaError] = useState('');
  const voice = useVoiceRecording(file => setVoiceFile(file), user?.id);
  const voiceUrl = useRef(null);
  if (voiceFile && !voiceUrl.current) voiceUrl.current = URL.createObjectURL(voiceFile);
  const clearVoice = () => { if (voiceUrl.current) URL.revokeObjectURL(voiceUrl.current); voiceUrl.current = null; setVoiceFile(null); };
  const addMedia = selected => {
    const result = addChatAttachments(voiceFile ? [voiceFile, ...media] : media, selected);
    if (result.error) { setMediaError(t(result.error)); return; }
    setMediaError('');
    setMedia(result.files.filter(file => file !== voiceFile));
  };
  // The sub-service is optional and listed only for the chosen profession.
  const [services, setServices] = useState([]);
  useEffect(() => {
    setServices([]);
    if (form.category_id) listServices(form.category_id).then(rows => setServices(rows || [])).catch(() => {});
  }, [form.category_id]);
  const optional = label => `${label} (${t('common.optional')})`;
  // Optional fields the owner hid in «حقول النماذج» are left out of the form (AYK-215).
  const { settings } = usePublicSettings();
  const hidden = hiddenFields(settings.form_fields_hidden, 'request');
  // And the ones made required there (AYK-218): marked with *, and the button waits for them.
  const required = requiredFields(settings.form_fields_required, settings.form_fields_hidden, 'request');
  const fieldLabel = (key, label) => (required.has(key) ? `${label} *` : optional(label));

  // The only thing a request truly needs is where the service is.
  // The location is taken from the device automatically when the account has none,
  // and stays editable; without it the requester picks region, city and district from lists (AYK-044).
  const autoLocated = useRef(false);
  useEffect(() => {
    if (requestLocation.ready && !requestLocation.city && !requestLocation.locating && !autoLocated.current && navigator.geolocation) {
      autoLocated.current = true;
      requestLocation.useDeviceLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestLocation.ready, requestLocation.city]);
  const locationMissing = !form.category_id ? t('requester.choose_profession') : !requestLocation.ready ? null
    : requestLocation.locating ? t('auth.locating')
      : !requestLocation.city ? t('auth.simple_location_required')
        : requestLocation.districts.length > 0 && !requestLocation.district ? t('auth.simple_district_required') : null;

  const requiredMissing = required.has('service') && services.length > 0 && !form.service_id ? t('requester.sub_service')
    : required.has('title') && !String(form.title || '').trim() ? t('requester.request_title')
      : required.has('voice') && !voiceFile ? t('requester.voice_label')
        : required.has('attachments') && media.length === 0 ? t('requester.attach_label') : null;

  const submit = async (e) => {
    e.preventDefault();
    if (loading || requiredMissing || !form.category_id || !requestLocation.ready || !requestLocation.city
        || (requestLocation.districts.length > 0 && !requestLocation.district)) return;
    const current = ++operation.current;
    const locationSnapshot = requestLocationFields(requestLocation.location, requestLocation.remember);
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if ((k === 'title' && hidden.has('title')) || (k === 'service_id' && hidden.has('service'))) return;
        if (v !== '' && v !== null && v !== undefined) fd.append(k, v);
      });
      if (voiceFile && !hidden.has('voice')) fd.append('files', voiceFile);
      if (!hidden.has('attachments')) media.forEach(file => fd.append('files', file));
      appendRequestLocation(fd, locationSnapshot);
      const created = await createRequest(fd);
      if (locationSnapshot.remember_location && current === operation.current) await refresh();
      if (current === operation.current) navigate(`/requests/${created.id}`);
    } catch (err) {
      // The raw error keeps the server's reason and code for the message card (AYK-219).
      if (current === operation.current) setError(err);
    } finally {
      if (current === operation.current) setLoading(false);
    }
  };

  // The fields in their two groups (AYK-222): required ones (made so in «حقول النماذج») with the
  // profession and the location, optional ones below. Hidden fields are in neither.
  const FIELD_ORDER = ['service', 'title', 'voice', 'attachments'];
  const shownField = key => !hidden.has(key) && (key !== 'service' || services.length > 0);
  const requiredKeys = FIELD_ORDER.filter(key => shownField(key) && required.has(key));
  const optionalKeys = FIELD_ORDER.filter(key => shownField(key) && !required.has(key));
  const renderField = key => {
    if (key === 'service') return <div key="service"><div className="form-group">
          <label className="form-label">{fieldLabel('service', t('requester.sub_service'))}</label>
          <select className="select" value={form.service_id} onChange={(e) => update('service_id', e.target.value)} data-testid="request-service">
            <option value="">{t('common.select')}</option>
            {services.map(s => <option key={s.id} value={s.id}>{localizedName(s, lang)}</option>)}
          </select>
        </div></div>;
    if (key === 'title') return <div key="title"><Input
          label={fieldLabel('title', t('requester.request_title'))}
          value={form.title}
          maxLength={200}
          onChange={(e) => update('title', e.target.value)}
          placeholder={t('requester.request_title_ph')}
          data-testid="request-title"
        /></div>;
    if (key === 'voice') return <div key="voice"><div className="form-group" data-testid="request-voice">
          <label className="form-label">🎤 {t('requester.voice_label')}{required.has('voice') ? ' *' : ''}</label>
          {voiceFile ? (
            <div className="flex items-center gap-2 flex-wrap">
              <VoiceNote src={voiceUrl.current} seed="request-draft" />
              <button type="button" className="text-[13px] font-semibold text-danger" onClick={clearVoice}>✕ {t('requester.voice_delete')}</button>
            </div>
          ) : voice.status !== 'idle' ? (
            <div className="flex items-center gap-3">
              <span className="text-danger font-bold" role="status">● {recordingTime(voice.elapsedMs)}</span>
              <Button type="button" size="sm" variant="primary" onClick={voice.stop}>⏹ {t('requester.voice_stop')}</Button>
              <button type="button" className="text-[13px] text-fg-muted" onClick={voice.cancel}>{t('admin.cancel_btn')}</button>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => voice.start(CHAT_MEDIA_MAX_BYTES - media.reduce((sum, file) => sum + file.size, 0))}>
              🎤 {t('requester.voice_record')}</Button>
          )}
          {voice.error && <p role="alert" className="form-error mt-1">{t(voice.error)}</p>}
          <p className="text-[12px] text-fg-muted mt-1 mb-0">{t('requester.voice_hint')}</p>
        </div></div>;
    return <div key="attachments"><div className="form-group" data-testid="request-attachments">
          <label className="form-label" htmlFor="request-files">📷 {fieldLabel('attachments', t('requester.attach_label'))}</label>
          <input id="request-files" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            onChange={(e) => { addMedia(e.target.files); e.target.value = ''; }} />
          {media.length > 0 && <div className="flex flex-wrap gap-2 mt-2">
            {media.map((file, index) => <span key={`${file.name}-${index}`} className="badge">
              {file.type.startsWith('video/') ? '🎬' : '🖼️'} {file.name}
              <button type="button" className="ms-1" aria-label={t('requester.voice_delete')} onClick={() => setMedia(list => list.filter((_, i) => i !== index))}>✕</button>
            </span>)}
          </div>}
          {mediaError && <p role="alert" className="form-error mt-1">{mediaError}</p>}
        </div></div>;
  };
  const publishButton = testId => (
    <div className="mt-2">
      <Button type="submit" block size="lg" loading={loading} variant="primary" data-testid={testId}
        disabled={!requestLocation.ready || !!locationMissing || !!requiredMissing}>
        {t('requester.publish')}
      </Button>
      <p className="text-center text-[12.5px] text-fg-muted mt-2 mb-0" data-testid="publish-hint">{t('requester.publish_hint')}</p>
      {(locationMissing || requiredMissing) && <p className="text-center text-[12px] text-fg-muted mt-1" data-testid="request-missing">{t('auth.complete_to_enable', { item: locationMissing || requiredMissing })}</p>}
    </div>
  );

  // A provider-only account works from its requests board.
  if (!canRequestService(user)) return <Navigate to="/provider" replace />;

  return (
    <div className="container page">
      <h2 className="mb-4">{t('request.create_title')}</h2>

      {error && <ProblemNotice error={error} onClose={() => setError('')} />}

      <form onSubmit={submit} className="card" style={{ padding: 24 }}>
        {/* Required first, then «نشر» right under them; optional fields below with «نشر» again
            (AYK-222). The area comes from the account as one line, with «تغيير الموقع». */}
        <div className="form-group">
          <label className="form-label">{t('requester.profession')} *</label>
          <select className="select" required value={form.category_id} onChange={(e) => update('category_id', e.target.value)} data-testid="request-category">
            <option value="">{t('common.select')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {localizedName(c, lang)}</option>)}
          </select>
        </div>
        {requiredKeys.map(renderField)}
        <RequestLocationFields control={requestLocation} disabled={loading} />
        {publishButton('request-publish-required')}
        {optionalKeys.length > 0 && <>
          <div className="flex items-center gap-2 mt-6 mb-3" data-testid="request-optional">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[13px] font-bold text-fg-muted">{t('requester.optional_section')}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {optionalKeys.map(renderField)}
          {publishButton('request-publish-optional')}
        </>}
      </form>
    </div>
  );
}
