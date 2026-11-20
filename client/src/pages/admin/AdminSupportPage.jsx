import { useAdminBack } from '../../components/admin/AdminBackNavigation';
import { useNavigate } from 'react-router-dom';
import { useAdminConfirmation } from '../../components/admin/confirmAdminChange';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminListSupport, adminGetSupport, adminReplySupport, adminSupportStatus } from '../../services/supportService';
import { apiError } from '../../services/api';
import { formatRelativeTime, truncate } from '../../utils/formatters';
import SupportThread from '../../components/support/SupportThread';
import TranslatedText from '../../components/common/TranslatedText';

const TOPICS = ['support', 'complaint', 'suggestion', 'admin'];
const STATUSES = ['open', 'answered', 'closed'];
const ICONS = { support: '🛠️', complaint: '⚠️', suggestion: '💡', admin: '🏛️' };

// The administration's inbox (AYK-046): unread threads first, reply, close or reopen.
export default function AdminSupportPage() {
  const { t } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const { id } = useParams();
  const navigate = useNavigate();
  useAdminBack(id ? () => navigate('/admin/support') : null);
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
    if (!(await confirmAdminChange(t))) return;
    try { await adminSupportStatus(ticket.id, status); setTicket({ ...ticket, status }); } catch (err) { setProblem(apiError(err)); }
  };
  const sel = 'px-3 py-2 rounded-xl border border-slate-200 bg-white text-[13px]';
  // AYK-330 (the owner: the page looked plain and repeated its title): the title is in the top bar
  // only; the list is cards with the writer's initial, coloured state and topic, and filter chips.
  const STATUS_TONE = { open: 'bg-amber-100 text-amber-800', answered: 'bg-emerald-100 text-emerald-800', closed: 'bg-slate-200 text-slate-600' };
  const chip = on => `px-3 py-1.5 rounded-pill text-[12.5px] font-bold border transition ${on ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'}`;
  const initial = name => Array.from(String(name || '؟').trim())[0] || '؟';

  if (id) {
    return (
      <div className="space-y-3" data-testid="admin-support-ticket">
        {problem && <div role="alert" className="text-rose-700 text-[13px]">{problem}</div>}
        {ticket && (
          <div className="bg-white rounded-card border border-slate-100 shadow-soft overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
              <span aria-hidden="true" className="w-11 h-11 rounded-full bg-primary-soft text-primary grid place-items-center text-lg font-extrabold shrink-0">{initial(ticket.full_name)}</span>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-[15px] text-ink break-words">{ticket.full_name}</div>
                <div className="text-[12px] text-slate-500 flex flex-wrap gap-x-2">
                  <span>{ICONS[ticket.topic]} {t(`support.topic_${ticket.topic}`)}</span>
                  {ticket.referral_code && <span dir="ltr">{ticket.referral_code}</span>}
                  {ticket.phone && <a href={`tel:${ticket.phone}`} dir="ltr" className="no-underline text-slate-500">{ticket.phone}</a>}
                </div>
              </div>
              <select className={sel} value={ticket.status} onChange={e => setStatus(e.target.value)} aria-label={t('support.status')}>
                {STATUSES.map(s => <option key={s} value={s}>{t(`support.status_${s}`)}</option>)}
              </select>
            </div>
            <div className="p-4">
              <SupportThread ticket={ticket} asAdmin collapsedReply onReply={async text => setTicket(await adminReplySupport(ticket.id, text))} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="admin-support">
      <div className="flex gap-2 flex-wrap items-center" role="group" aria-label={t('support.status')}>
        {['', ...STATUSES].map(value => (
          <button key={value || 'all'} type="button" className={chip(filter.status === value)} aria-pressed={filter.status === value}
            onClick={() => setFilter(f => ({ ...f, status: value }))}>{value ? t(`support.status_${value}`) : t('common.all')}</button>
        ))}
        {items && <span className="ms-auto text-[12.5px] text-slate-500">{items.length}</span>}
      </div>
      <div className="flex gap-2 flex-wrap" role="group" aria-label={t('support.topic')}>
        {['', ...TOPICS].map(value => (
          <button key={value || 'all'} type="button" className={chip(filter.topic === value)} aria-pressed={filter.topic === value}
            onClick={() => setFilter(f => ({ ...f, topic: value }))}>{value ? `${ICONS[value]} ${t(`support.topic_${value}`)}` : t('common.all')}</button>
        ))}
      </div>
      {problem && <div role="alert" className="text-rose-700 text-[13px]">{problem}</div>}
      {items === null ? <p className="text-slate-500">…</p> : items.length === 0 ? <p className="text-slate-500 text-[13px]">{t('support.none')}</p> : (
        <div className="space-y-2">
          {items.map(row => {
            const unread = Number(row.admin_unread) > 0;
            return (
              <Link key={row.id} to={`/admin/support/${row.id}`} style={{ textDecoration: 'none' }} data-testid="admin-support-row"
                className={`flex items-start gap-3 bg-white rounded-card border p-3 text-inherit shadow-soft ${unread ? 'border-primary' : 'border-slate-100'}`}>
                <span aria-hidden="true" className="w-11 h-11 rounded-full bg-primary-soft text-primary grid place-items-center text-lg font-extrabold shrink-0">{initial(row.full_name)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`flex-1 min-w-0 truncate text-[14.5px] text-ink ${unread ? 'font-extrabold' : 'font-bold'}`}>{row.full_name}</span>
                    <span className="text-[11px] text-slate-400 shrink-0">{formatRelativeTime(row.updated_at)}</span>
                  </div>
                  <div className={`text-[13px] truncate mt-0.5 ${unread ? 'text-ink' : 'text-slate-500'}`}><TranslatedText compact text={truncate(row.last_body || '', 100)} translated={row.last_body_translated && truncate(row.last_body_translated, 100)} /></div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    <span className={`px-2 py-0.5 rounded-pill text-[11px] leading-4 font-bold ${STATUS_TONE[row.status] || STATUS_TONE.closed}`}>{t(`support.status_${row.status}`)}</span>
                    <span className="px-2 py-0.5 rounded-pill text-[11px] leading-4 bg-slate-100 text-slate-600">{ICONS[row.topic]} {t(`support.topic_${row.topic}`)}</span>
                    {row.referral_code && <span dir="ltr" className="text-[11px] text-slate-400">{row.referral_code}</span>}
                    {unread && <span className="ms-auto px-2 py-0.5 rounded-pill bg-rose-500 text-white text-[11px] leading-4 font-bold">{row.admin_unread}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
