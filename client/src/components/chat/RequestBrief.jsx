import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRequest } from '../../services/requestService';
import { localizedJoinedName } from '../../utils/localizeJoined';
import RequestMedia from '../requests/RequestMedia';
import { requestMapsUrl } from '../../utils/directions';

// The request's own description (voice, photos, video) pinned at the top of every chat
// about it, so the requester never has to repeat it to each provider (AYK-043).
export default function RequestBrief({ requestId }) {
  const { t, i18n } = useTranslation();
  const [request, setRequest] = useState(null);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    let alive = true;
    setRequest(null);
    getRequest(requestId).then(row => { if (alive) setRequest(row); }).catch(() => {});
    return () => { alive = false; };
  }, [requestId]);
  if (!request) return null;
  const category = localizedJoinedName(request, 'category', i18n.resolvedLanguage);
  const text = request.description && request.description !== request.title ? request.description : '';
  return (
    <div className="request-brief" data-testid="request-brief">
      <button type="button" className="request-brief-head" onClick={() => setOpen(value => !value)} aria-expanded={open}>
        <span>📌 {t('requester.brief_title')}: <strong>{request.title}</strong>{category ? ` · ${category}` : ''}</span>
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="request-brief-body">
        {text && <p className="m-0 mb-2 text-[13px]">{text}</p>}
        <RequestMedia files={request.files || []} />
        <div className="flex gap-3 flex-wrap mt-1">
          {requestMapsUrl(request) && <a href={requestMapsUrl(request)} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold text-primary" data-testid="brief-maps">🗺️ {t('requester.open_maps')}</a>}
          <Link to={`/requests/${request.id}`} className="text-[12px] font-semibold text-primary">{t('request.details_title')}</Link>
        </div>
      </div>}
      <style>{`
        .request-brief { border-bottom: 1px solid var(--border); background: var(--bg-soft, var(--bg-card)); }
        .request-brief-head { width: 100%; display: flex; justify-content: space-between; gap: 8px; padding: 8px 12px; font: inherit; font-size: 13px; background: none; border: 0; cursor: pointer; text-align: start; color: inherit; }
        .request-brief-body { padding: 0 12px 10px; max-height: 40vh; overflow-y: auto; }
      `}</style>
    </div>
  );
}
