import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminListSupport, adminGetSupport, adminReplySupport, adminSupportStatus } from '../../services/supportService';
import { apiError } from '../../services/api';
import { formatDate, truncate } from '../../utils/formatters';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import SupportThread from '../../components/support/SupportThread';

const TOPICS = ['support', 'suggestion', 'admin'];
const STATUSES = ['open', 'answered', 'closed'];
const ICONS = { support: '🛠️', suggestion: '💡', admin: '🏛️' };

// The administration's inbox (AYK-046): unread threads first, reply, close or reopen.
export default function AdminSupportPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState({ status: '', topic: '' });
  const [ticket, setTicket] = useState(null);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (id) { setTicket(null); adminGetSupport(id).then(setTicket).catch(err => setProblem(apiError(err))); return; }
    setItems(null);
    adminListSupport(Object.fromEntries(Object.entries(filter).filter(([, v]) => v))).then(setItems).catch(err => { setItems([]); setProblem(apiError(err)); });
  }, [id, filter.status, filter.topic]);

  const setStatus = async status => {
    try { await adminSupportStatus(ticket.id, status); setTicket({ ...ticket, status }); } catch (err) { setProblem(apiError(err)); }
  };
  const sel = 'px-3 py-2 rounded-xl border border-slate-200 bg-white text-[13px]';

  if (id) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={t('support.admin_title')} />
        <Link to="/admin/support" className="text-[13px] font-semibold text-brand-700">← {t('support.admin_title')}</Link>
        {problem && <div role="alert" className="text-rose-700 text-[13px]">{problem}</div>}
        {ticket && (
          <div className="bg-white rounded-card border border-slate-100 p-5 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-extrabold">{ICONS[ticket.topic]} {t(`support.topic_${ticket.topic}`)} — {ticket.full_name}
                <span className="text-[12px] text-slate-500 font-normal"> · {ticket.referral_code || ''} · <span dir="ltr">{ticket.phone || ''}</span></span></div>
              <select className={sel} value={ticket.status} onChange={e => setStatus(e.target.value)} aria-label={t('support.status')}>
                {STATUSES.map(s => <option key={s} value={s}>{t(`support.status_${s}`)}</option>)}
              </select>
            </div>
            <SupportThread ticket={ticket} asAdmin onReply={async text => setTicket(await adminReplySupport(ticket.id, text))} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="admin-support">
      <AdminPageHeader title={t('support.admin_title')} count={items?.length} />
      <div className="flex gap-2 flex-wrap">
        <select className={sel} value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} aria-label={t('support.status')}>
          <option value="">{t('common.all')}</option>
          {STATUSES.map(s => <option key={s} value={s}>{t(`support.status_${s}`)}</option>)}
        </select>
        <select className={sel} value={filter.topic} onChange={e => setFilter(f => ({ ...f, topic: e.target.value }))} aria-label={t('support.topic')}>
          <option value="">{t('common.all')}</option>
          {TOPICS.map(s => <option key={s} value={s}>{ICONS[s]} {t(`support.topic_${s}`)}</option>)}
        </select>
      </div>
      {problem && <div role="alert" className="text-rose-700 text-[13px]">{problem}</div>}
      {items === null ? <p className="text-slate-500">…</p> : items.length === 0 ? <p className="text-slate-500 text-[13px]">{t('support.none')}</p> : (
        <div className="space-y-2">
          {items.map(row => (
            <Link key={row.id} to={`/admin/support/${row.id}`} className={`flex items-center gap-3 bg-white rounded-card border p-3 no-underline text-inherit ${Number(row.admin_unread) > 0 ? 'border-brand-300' : 'border-slate-100'}`}>
              <span className="text-xl">{ICONS[row.topic]}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[14px]">{row.full_name} <span className="text-[12px] text-slate-500 font-normal">· {row.referral_code || ''} · {t(`support.status_${row.status}`)}</span></div>
                <div className="text-[13px] text-slate-600 truncate">{truncate(row.last_body || '', 100)}</div>
                <div className="text-[11px] text-slate-400">{formatDate(row.updated_at, true)}</div>
              </div>
              {Number(row.admin_unread) > 0 && <span className="px-2 py-0.5 rounded-pill bg-rose-500 text-white text-[11px] font-bold">{row.admin_unread}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
