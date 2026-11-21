import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listServices } from '../../services/serviceService';
import api from '../../services/api';
import { understandRequest } from '../../utils/requestIntent.mjs';
import { localizedName } from '../../utils/localize';

// AYK-419 (the owner): «اكتب طلبك بلهجتك» (renamed by the owner). The requester writes what they need in their own words;
// the page picks the profession and the service and writes the title and the details, then says
// what it understood so it can be changed. Free, on the device, no outside service.
export default function UnderstandRequest({ categories, onApply }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [text, setText] = useState('');
  const [services, setServices] = useState([]);
  const [result, setResult] = useState(null);
  // AYK-420: the words the site learned from its people's requests.
  const [learned, setLearned] = useState([]);
  useEffect(() => {
    listServices().then(rows => setServices(rows || [])).catch(() => {});
    api.get('/requests/learned-terms').then(({ data }) => setLearned(Array.isArray(data?.data) ? data.data : [])).catch(() => {});
  }, []);
  const understand = () => {
    const found = understandRequest(text, { categories, services, learned });
    setResult(found);
    onApply({
      category_id: found.category ? String(found.category.id) : '',
      service_id: found.service ? String(found.service.id) : '',
      title: found.title,
      description: found.description,
      urgent: found.urgent,
    });
  };
  const whenLabel = result?.when ? t(`understand.when.${result.when}`, { defaultValue: '' }) : '';
  return (
    <div className="rounded-card border-2 border-primary/40 bg-primary-soft p-3 mb-4" data-testid="understand-request">
      <label htmlFor="understand-text" className="block font-extrabold text-[15px] mb-1">✍️ {t('understand.title')}</label>
      <p className="text-[12.5px] text-fg-muted m-0 mb-2">{t('understand.hint')}</p>
      <textarea id="understand-text" className="input" rows={2} maxLength={500} value={text}
        placeholder={t('understand.placeholder')} onChange={e => { setText(e.target.value); setResult(null); }} data-testid="understand-text" />
      <button type="button" className="btn btn-primary btn-sm mt-2" disabled={text.trim().length < 3} onClick={understand} data-testid="understand-button">
        🔎 {t('understand.button')}
      </button>
      {result && (
        <div role="status" className="mt-2 text-[13px]" data-testid="understand-result">
          {result.category ? (
            <>
              <span className="font-bold">✓ {t('understand.got')}</span>{' '}
              <span>🛠️ {localizedName(result.category, lang)}</span>
              {result.service && <span> · {localizedName(result.service, lang)}</span>}
              {result.urgent && <span> · ⚡ {t('request.urgent')}</span>}
              {whenLabel && <span> · 🗓️ {whenLabel}</span>}
              {result.count && <span> · {t('understand.count', { count: result.count })}</span>}
              {result.budget && <span> · 💰 {result.budget}</span>}
              <span className="block text-[12px] text-fg-muted mt-0.5">{t(result.confidence < 0.6 ? 'understand.check_unsure' : 'understand.check')}</span>
            </>
          ) : (
            <span className="text-fg-muted">{t('understand.not_found')}</span>
          )}
        </div>
      )}
    </div>
  );
}
