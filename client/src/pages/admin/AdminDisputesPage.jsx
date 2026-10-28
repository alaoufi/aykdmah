import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  listDisputes, getDispute, requestChatAccess, getDisputeConversation,
  getDisputeAccessLogs, resolveDispute, closeDispute,
} from '../../services/disputeService';
import { apiError } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import EmptyState from '../../components/admin/EmptyState';
import Avatar from '../../components/common/Avatar';
import { formatRelativeTime, formatTime } from '../../utils/formatters';
import { safeUrl } from '../../utils/urlSafety';

const STATUS_BADGE = {
  open:          'bg-amber-50 text-amber-700',
  under_review:  'bg-brand-50 text-brand-700',
  resolved:      'bg-emerald-50 text-emerald-700',
  closed:        'bg-slate-100 text-slate-600',
};

export default function AdminDisputesPage() {
  const { t } = useTranslation();
  const TABS = [
    { value: '',             label: t('common.all') },
    { value: 'open',         label: t('dispute.status_open') },
    { value: 'under_review', label: t('dispute.status_under_review') },
    { value: 'resolved',     label: t('dispute.status_resolved') },
    { value: 'closed',       label: t('dispute.status_closed') },
  ];

  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState('');
  const [page, setPage] = useState(1);
  const [listError, setListError] = useState('');
  const loadVersion = useRef(0);

  const [openId, setOpenId] = useState(null);
  const [dispute, setDispute] = useState(null);
  const [chat, setChat] = useState(null);
  const [logs, setLogs] = useState([]);
  const [reason, setReason] = useState('');
  const [reasonShown, setReasonShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [resolutionBox, setResolutionBox] = useState(null);
  const [ratingsAllowed, setRatingsAllowed] = useState('both');
  const [closeConfirm, setCloseConfirm] = useState(null);
  const caseVersion = useRef(0);
  const actionInFlight = useRef(false);

  const load = () => {
    const version = ++loadVersion.current;
    setLoading(true); setListError('');
    listDisputes({ status: statusTab, page, limit: 20 })
      .then((res) => { if (version === loadVersion.current) { setItems(res.data || []); setMeta(res.meta); } })
      .catch((e) => { if (version === loadVersion.current) { setItems([]); setMeta(null); setListError(apiError(e)); } })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusTab, page]);

  const openDisputeRow = async (id) => {
    const version = ++caseVersion.current;
    setOpenId(id);
    setDispute(null); setChat(null); setLogs([]);
    setResolutionBox(null); setCloseConfirm(null); setRatingsAllowed('both');
    setErr(''); setReason(''); setReasonShown(true);
    try {
      const d = await getDispute(id);
      if (version !== caseVersion.current) return;
      setDispute(d);
      const l = await getDisputeAccessLogs(id);
      if (version !== caseVersion.current) return;
      setLogs(l);
    } catch (e) {
      if (version === caseVersion.current) setErr(apiError(e));
    }
  };

  const confirmAccess = async () => {
    if (!openId || actionInFlight.current) return;
    if (!reason.trim() || reason.trim().length < 5) {
      setErr(t('dispute.reason_required'));
      return;
    }
    const id = openId;
    const version = caseVersion.current;
    const accessReason = reason.trim();
    actionInFlight.current = true;
    setBusy(true);
    setErr('');
    try {
      await requestChatAccess(id, accessReason);
      if (version !== caseVersion.current) return;
      const data = await getDisputeConversation(id, accessReason);
      if (version !== caseVersion.current) return;
      setChat(data);
      setReasonShown(false);
      const l = await getDisputeAccessLogs(id);
      if (version !== caseVersion.current) return;
      setLogs(l);
    } catch (e) {
      if (version === caseVersion.current) setErr(apiError(e));
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  };

  const close = () => {
    ++caseVersion.current;
    setOpenId(null); setDispute(null); setChat(null);
    setLogs([]); setReason(''); setReasonShown(false); setErr('');
    setResolutionBox(null); setCloseConfirm(null); setRatingsAllowed('both');
  };

  const handleResolve = async (text) => {
    if (!openId || !dispute || dispute.id !== openId || actionInFlight.current) return;
    const id = openId;
    const version = caseVersion.current;
    actionInFlight.current = true;
    setBusy(true);
    try {
      await resolveDispute(id, text, ratingsAllowed);
      if (version !== caseVersion.current) return;
      close();
      load();
    } catch (e) {
      if (version === caseVersion.current) setErr(apiError(e));
    } finally { actionInFlight.current = false; setBusy(false); }
  };

  const handleClose = async () => {
    if (!openId || closeConfirm?.id !== openId || actionInFlight.current) return;
    const id = openId;
    const version = caseVersion.current;
    actionInFlight.current = true;
    setBusy(true);
    try {
      await closeDispute(id);
      if (version !== caseVersion.current) return;
      close();
      load();
    } catch (e) { if (version === caseVersion.current) setErr(apiError(e)); }
    finally {
      actionInFlight.current = false; setBusy(false);
      if (version === caseVersion.current) setCloseConfirm(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('dispute.admin_title')} count={meta?.pagination?.total} />

      {listError && <div role="alert" className="text-rose-700 text-[13px]">{listError}</div>}

      <div className="bg-white rounded-card border border-slate-100 p-4 flex flex-wrap gap-2 shadow-soft">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatusTab(tab.value); setPage(1); }}
            className={`px-4 py-2 rounded-pill text-[13px] font-semibold transition border ${
              statusTab === tab.value
                ? 'bg-ink text-white border-ink'
                : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[100px] rounded-card bg-white border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-card border border-slate-100"><EmptyState icon="⚖️" title={t('admin.no_results')} /></div>
      ) : (
        <div className="space-y-3">
          {items.map((d) => (
            <div key={d.id} className="bg-white rounded-card border border-slate-100 p-4 shadow-soft hover:shadow-card transition cursor-pointer"
                 onClick={() => openDisputeRow(d.id)}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="text-[15px] font-bold text-ink">{d.subject}</div>
                  <div className="text-[12px] text-slate-500 mt-0.5">
                    {d.request_title || '—'} · {d.opened_by_name}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`px-2.5 py-0.5 rounded-pill text-[10.5px] font-bold ${STATUS_BADGE[d.status] || 'bg-slate-100 text-slate-600'}`}>
                    {t(`dispute.status_${d.status}`)}
                  </span>
                  <span className="text-[10.5px] text-slate-400">{formatRelativeTime(d.opened_at)}</span>
                </div>
              </div>
              {d.description && (
                <p className="text-[12.5px] text-slate-600 line-clamp-2">{d.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!openId}
        onClose={close}
        title={dispute?.subject || t('dispute.title')}
        width={760}
      >
        {err && <div role="alert" className="mb-3 text-rose-600 text-[12px]">{err}</div>}
        {!dispute ? (
          <div className="text-center py-8 text-slate-400">…</div>
        ) : reasonShown && !chat ? (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-card p-4 text-amber-800 text-[13px]">
              <div className="font-bold mb-1">⚠️ {t('dispute.privacy_warning_title')}</div>
              <p className="leading-relaxed">{t('dispute.privacy_warning_body')}</p>
            </div>
            <div>
              <label className="block text-[12.5px] font-bold text-ink mb-1">{t('dispute.access_reason')}</label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('dispute.access_reason_placeholder')}
                className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]"
              />
            </div>
            <div className="text-[12px] text-slate-500">
              <div className="font-bold text-ink mb-1">{t('dispute.case_details')}</div>
              <div>{t('dispute.opened_by')}: {dispute.opened_by_name}</div>
              <div>{t('dispute.order')}: {dispute.request_title || '—'}</div>
              <div>{t('dispute.opened_at')}: {formatTime(dispute.opened_at)}</div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button onClick={close} className="px-4 py-2 rounded-pill bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-semibold border border-slate-200">
                {t('admin.cancel_btn')}
              </button>
              <button onClick={confirmAccess} disabled={busy}
                className="px-4 py-2 rounded-pill text-white text-[13px] font-semibold shadow-soft disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}>
                {busy ? t('admin.saving') : t('dispute.confirm_view')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-card p-3 text-[12.5px] text-slate-600">
              <div className="font-bold text-ink mb-1">{dispute.subject}</div>
              <div>{t('dispute.opened_by')}: {dispute.opened_by_name}</div>
              {dispute.description && <p className="mt-1">{dispute.description}</p>}
            </div>

            <div className="border border-slate-200 rounded-card overflow-hidden">
              <div className="bg-slate-100 px-3 py-2 text-[12.5px] font-bold text-slate-700 flex items-center justify-between">
                <span>{t('dispute.chat_evidence')}</span>
                <span className="text-[11px] text-slate-500">{chat?.messages?.length || 0} {t('chat.title')}</span>
              </div>
              <div className="max-h-[400px] overflow-y-auto p-3 bg-slate-50 space-y-2">
                {chat?.messages?.length ? chat.messages.map((m) => (
                  <div key={m.id} data-deleted={m.deleted_at ? 'true' : undefined}
                    className={`rounded-card p-2.5 border ${m.deleted_at ? 'bg-red-50 border-red-300 text-red-800' : 'bg-white border-slate-100'}`}>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                      <span className="font-bold text-ink">{m.sender_name}</span>
                      <span>
                        {m.deleted_at && <span className="text-rose-600 font-semibold">{t('admin.deleted_by_author')} · </span>}
                        {formatTime(m.created_at)}
                      </span>
                    </div>
                    {m.message_type === 'location' ? (
                      <a href={`https://www.google.com/maps?q=${m.latitude},${m.longitude}`} target="_blank" rel="noreferrer" className="text-brand-700 text-[13px]">
                        📍 {Number(m.latitude).toFixed(5)}, {Number(m.longitude).toFixed(5)}
                      </a>
                    ) : (
                      <div className="text-[13px] text-slate-700 whitespace-pre-wrap">
                        {m.message_type === 'voice' ? '🎙️ ' : m.message_type === 'image' ? '🖼️ ' : m.message_type === 'file' ? '📄 ' : ''}
                        {m.content || (m.files && m.files[0]?.file_name) || '—'}
                      </div>
                    )}
                    {Array.isArray(m.files) && m.files.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {m.files.map(f => safeUrl(f.file_url) ? (
                          <a key={f.id} href={safeUrl(f.file_url)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand-700 underline">
                            {f.file_name}
                          </a>
                        ) : <span key={f.id} className="text-[11px]">{f.file_name}</span>)}
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="text-center py-4 text-slate-400 text-[12px]">{t('chat.no_messages')}</div>
                )}
              </div>
            </div>

            {logs.length > 0 && (
              <div className="border border-slate-200 rounded-card overflow-hidden">
                <div className="bg-slate-100 px-3 py-2 text-[12.5px] font-bold text-slate-700">
                  {t('dispute.access_logs')} ({logs.length})
                </div>
                <div className="max-h-[150px] overflow-y-auto">
                  {logs.map((l) => (
                    <div key={l.id} className="px-3 py-2 border-t border-slate-100 text-[11.5px]">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink">{l.admin_name}</span>
                        <span className="text-slate-400">{formatTime(l.opened_at)}</span>
                      </div>
                      <div className="text-slate-600">{l.action}{l.reason ? ` — ${l.reason}` : ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
              {dispute.status !== 'resolved' && dispute.status !== 'closed' && (
                <button onClick={() => setResolutionBox('')} disabled={busy}
                  className="px-4 py-2 rounded-pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[12.5px] font-semibold">
                  ✓ {t('dispute.mark_resolved')}
                </button>
              )}
              {dispute.status !== 'closed' && (
                <button onClick={() => setCloseConfirm(dispute)} disabled={busy}
                  className="px-4 py-2 rounded-pill bg-slate-100 text-slate-700 hover:bg-slate-200 text-[12.5px] font-semibold">
                  {t('dispute.close')}
                </button>
              )}
              <button onClick={close} className="ms-auto px-4 py-2 rounded-pill bg-white hover:bg-slate-100 text-slate-700 text-[12.5px] font-semibold border border-slate-200">
                {t('admin.cancel_btn')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {resolutionBox != null && (
        <Modal
          open
          onClose={() => setResolutionBox(null)}
          title={t('dispute.mark_resolved')}
          footer={
            <>
              <button onClick={() => setResolutionBox(null)} className="px-4 py-2 rounded-pill bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-semibold border border-slate-200">
                {t('admin.cancel_btn')}
              </button>
              <button onClick={() => handleResolve(resolutionBox)} disabled={busy}
                className="px-4 py-2 rounded-pill text-white text-[13px] font-semibold shadow-soft bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
                {t('dispute.mark_resolved')}
              </button>
            </>
          }
        >
          <textarea
            rows={4}
            value={resolutionBox}
            onChange={(e) => setResolutionBox(e.target.value)}
            placeholder={t('dispute.resolution_placeholder')}
            className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px] mb-3"
          />
          <div>
            <label className="block text-[12.5px] font-bold text-ink mb-1.5">{t('dispute.ratings_decision')}</label>
            <div className="grid grid-cols-2 gap-2">
              {['both', 'client_only', 'provider_only', 'none'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setRatingsAllowed(opt)}
                  className={`px-3 py-2 rounded-card text-[12.5px] font-semibold border transition ${
                    ratingsAllowed === opt
                      ? 'bg-primary text-primary-fg border-primary'
                      : 'bg-surface-alt border-border text-fg-muted hover:border-primary/50'
                  }`}
                >
                  {t('dispute.ratings_allowed_' + opt)}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!closeConfirm}
        title={t('dispute.close')}
        body={t('dispute.close_confirm')}
        confirmLabel={t('dispute.close')}
        tone="warning"
        loading={busy}
        onConfirm={handleClose}
        onCancel={() => setCloseConfirm(null)}
      />
    </div>
  );
}
