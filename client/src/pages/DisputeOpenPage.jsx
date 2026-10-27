import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { openDispute, uploadDisputeEvidence } from '../services/disputeService';
import { apiError } from '../services/api';
import Input from '../components/common/Input';
import Button from '../components/common/Button';

const REASONS = [
  'payment', 'service_quality', 'no_show', 'cancellation',
  'abuse', 'fraud', 'delivery', 'other',
];

export default function DisputeOpenPage() {
  const { t } = useTranslation();
  const { requestId } = useParams();
  const navigate = useNavigate();
  const [reason, setReason] = useState('service_quality');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [createdDispute, setCreatedDispute] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErr(''); setBusy(true);
    try {
      const dispute = createdDispute || await openDispute({
        request_id: Number(requestId),
        subject: `[${reason}] ${subject || t('dispute.reasons.' + reason)}`,
        description,
      });
      setCreatedDispute(dispute);
      if (files.length) {
        await uploadDisputeEvidence(dispute.id, files);
      }
      navigate(`/disputes/${dispute.id}`);
    } catch (e2) { setErr(apiError(e2)); }
    finally { setBusy(false); }
  };

  return (
    <div className="container page max-w-2xl mx-auto">
      <h1 className="text-fg text-2xl md:text-3xl font-extrabold mb-2">{t('dispute.open_dispute')}</h1>
      <p className="text-fg-muted mb-6">{t('dispute.open_hint')}</p>

      {err && (
        <div className="mb-4 px-4 py-3 rounded-card bg-danger-soft text-danger text-sm">{err}</div>
      )}

      <form onSubmit={submit} className="bg-surface border border-border rounded-card p-5 space-y-4 shadow-soft">
        <div>
          <label className="block text-[12.5px] font-bold text-fg mb-1.5">{t('dispute.reason')}</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {REASONS.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`px-3 py-2 rounded-card text-[12.5px] font-semibold border transition ${
                  reason === r
                    ? 'bg-primary text-primary-fg border-primary'
                    : 'bg-surface-alt border-border text-fg-muted hover:border-primary/50'
                }`}
              >
                {t(`dispute.reasons.${r}`)}
              </button>
            ))}
          </div>
        </div>

        <Input label={t('dispute.subject')} value={subject}
          onChange={(e) => setSubject(e.target.value)} placeholder={t('dispute.subject_placeholder')} />

        <Input as="textarea" rows={5} label={t('dispute.description')} required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('dispute.description_placeholder')} />

        <div>
          <label className="block text-[12.5px] font-bold text-fg mb-1.5">
            {t('dispute.evidence')} <span className="text-fg-subtle font-normal">({t('common.optional')})</span>
          </label>
          <input
            type="file" multiple
            accept="image/*,application/pdf,audio/*"
            onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 6))}
            className="text-sm"
          />
          {files.length > 0 && (
            <div className="mt-1 text-[11.5px] text-fg-muted">
              {files.length} {t('dispute.files_attached')}
            </div>
          )}
        </div>

        <Button type="submit" variant="primary" block loading={busy}>
          {t('dispute.submit_dispute')}
        </Button>
      </form>
    </div>
  );
}
