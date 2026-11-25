import { localizedJoinedName } from '../utils/localizeJoined';
import ContactButtons from '../components/providers/ContactButtons';
import { safeUrl } from '../utils/urlSafety';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  getRequest, getOffersForRequest, acceptOffer, rejectOffer,
  startRequestChat, updateRequestStatus, contactRequest, agreeRequest
} from '../services/requestService';
import MatchingProviders from '../components/catalog/MatchingProviders';
import RequestMedia from '../components/requests/RequestMedia';
import WarrantyBox from '../components/requests/WarrantyBox';
import BlockedNotice from '../components/common/BlockedNotice';
import { requestMapsUrl } from '../utils/directions';
import { useAuth } from '../hooks/useAuth';
import { OFFER_STATUS } from '../utils/constants';
import { formatCurrency, formatRelativeTime } from '../utils/formatters';
import { LoadingState, EmptyState } from '../components/common/Spinner';
import Button from '../components/common/Button';
import Avatar from '../components/common/Avatar';
import ProviderServiceModeBadge from '../components/common/ProviderServiceModeBadge';
import ConfirmDialog from '../components/common/ConfirmDialog';

// Loaded on demand so the request page stays light for viewers who are not a party.
const CallButtons = lazy(() => import('../components/calls/CallButtons'));
const CallHistory = lazy(() => import('../components/calls/CallHistory'));
import { apiError } from '../services/api';
import { createConversation } from '../services/chatService';
import AdSlot from '../components/ads/AdSlot';
import { RequestReach, RequestEdit } from '../components/requests/RequestOwnerTools';
import useRequestTranslation from '../hooks/useRequestTranslation';
import TranslatedNote from '../components/requests/TranslatedNote';
import RatingInline from '../components/reviews/RatingInline';
import RequestStatusBadge from '../components/requests/RequestStatusBadge';
import useContactIntro from '../hooks/useContactIntro';
import ShareMenu from '../components/common/ShareMenu';
import { SITE_URL } from '../utils/site';

export function canReadRequestOffers(user, request, canManageRequests = false) {
  return Boolean(user && request && (
    user.role === 'provider' || user.id === request.client_id ||
    (user.role === 'admin' && canManageRequests)
  ));
}

export default function RequestDetailsPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { user, hasPermission } = useAuth();
  const canManageRequests = hasPermission('requests.manage');
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  // In the reader's language when the requester wrote in another one (AYK-229).
  const translation = useRequestTranslation(request);
  const intro = useContactIntro();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailsScope, setDetailsScope] = useState(null);
  const [confirm, setConfirm] = useState({ open: false });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const [negotiatingOfferId, setNegotiatingOfferId] = useState(null);
  // Who the last failed contact was with, for "✅ Unblock" in the message (AYK-111). Above the
  // early returns: a hook below them broke the page once the request loaded (AYK-140).
  const [errWith, setErrWith] = useState(null);
  // Hooks stay above the early returns below. "Stop" from the requests management
  // page opens the close box directly (#close).
  const { hash } = useLocation();
  const [closing, setClosing] = useState({ open: hash === '#close', found: false, providerId: '' });
  const negotiationRef = useRef(null);
  const scopeRef = useRef(null);
  scopeRef.current = `${user?.id}:${id}`;

  useEffect(() => () => { scopeRef.current = null; }, []);

  const load = () => setReloadVersion(version => version + 1);
  useEffect(() => {
    let ignore = false;
    const scope = `${user?.id}:${id}`;
    setRequest(null);
    setOffers([]);
    setErr('');
    setLoading(true);
    setNegotiatingOfferId(null);
    negotiationRef.current = null;
    const fetchDetails = async () => {
      try {
        const r = await getRequest(id);
        if (ignore) return;
        setRequest(r);
        if (canReadRequestOffers(user, r, canManageRequests)) {
          const o = await getOffersForRequest(id);
          if (!ignore) setOffers(o);
        }
      } catch (e) {
        if (!ignore) !e?.cancelled && setErr(apiError(e));
      } finally {
        if (!ignore) { setDetailsScope(scope); setLoading(false); }
      }
    };
    void fetchDetails();
    return () => { ignore = true; };
  }, [id, user, canManageRequests, reloadVersion]);

  if (loading || detailsScope !== scopeRef.current) return <LoadingState />;
  if (!request) return <EmptyState title={t('request.not_found')} />;

  const isOwner = user && user.id === request.client_id;
  // A provider the requester turned down sees why instead of a button that fails (AYK-080).
  const myOffer = user ? offers.find(offer => Number(offer.provider_id) === Number(user.id)) : null;
  const turnedDown = myOffer?.status === 'rejected';
  // AYK-493: a provider outside the request's profession or coverage (or blocked by its owner) only reads it.
  const canOffer = user && user.role === 'provider' && !isOwner && request.status === 'open' && !turnedDown && request.can_contact !== false;
  const assignedProviderOffer = request.assigned_provider_id
    ? offers.find(offer => Number(offer.provider_id) === Number(request.assigned_provider_id))
    : null;

  const contactOwner = async () => {
    setSubmitting(true);
    setErr('');
    try {
      const { conversation_id } = await contactRequest(request.id);
      navigate(`/chat/${conversation_id}`);
    } catch (e2) {
      setErrWith(request.client_id);
      !e2?.cancelled && setErr(apiError(e2));
    } finally { setSubmitting(false); }
  };

  const contactProvider = async (provider) => {
    setErr('');
    try {
      const { conversation_id } = await contactRequest(request.id, provider.id);
      navigate(`/chat/${conversation_id}`);
    } catch (e2) { setErrWith(provider.id); !e2?.cancelled && setErr(apiError(e2)); }
  };

  const onAccept = async (offerId) => {
    try { await acceptOffer(offerId); await load(); } catch (e) { !e?.cancelled && setErr(apiError(e)); }
  };

  const onReject = async (offerId) => {
    try { await rejectOffer(offerId); await load(); } catch (e) { !e?.cancelled && setErr(apiError(e)); }
  };

  const openChat = async () => {
    try {
      const { conversation_id } = await startRequestChat(request.id);
      navigate(`/chat/${conversation_id}`);
    } catch (e) { !e?.cancelled && setErr(apiError(e)); }
  };

  const negotiateOffer = async (offer) => {
    // AYK-435: the requester can always reach a provider they talked to; the provider while open.
    const mayNegotiate = isOwner || (request.status === 'open' && offer.status === 'pending' &&
      user?.role === 'provider' && Number(user.id) === Number(offer.provider_id));
    if (!mayNegotiate || negotiationRef.current) return;
    const scope = scopeRef.current;
    const pending = { scope, offerId: offer.id };
    negotiationRef.current = pending;
    setNegotiatingOfferId(offer.id);
    setErr('');
    try {
      const conversation = await createConversation({
        user_id: isOwner ? offer.provider_id : request.client_id,
        request_id: request.id,
      });
      if (scopeRef.current !== scope || negotiationRef.current !== pending) return;
      navigate(`/chat/${conversation.id}`);
    } catch (error) {
      if (!error?.cancelled && scopeRef.current === scope && negotiationRef.current === pending) setErr(apiError(error));
    } finally {
      if (scopeRef.current === scope && negotiationRef.current === pending) {
        negotiationRef.current = null;
        setNegotiatingOfferId(null);
      }
    }
  };

  const performStatusChange = async (newStatus) => {
    try { await updateRequestStatus(request.id, { status: newStatus }); await load(); }
    catch (e) { !e?.cancelled && setErr(apiError(e)); }
  };

  // Ask for confirmation before any destructive status change.
  const STATUS_TONE = { cancelled: 'danger', completed: 'warning', in_progress: 'primary' };
  const changeStatus = (newStatus) => {
    setConfirm({
      open: true,
      title: t(`request.confirm_${newStatus}_title`, t('admin.confirm_action')),
      body: t(`request.confirm_${newStatus}_body`, ''),
      tone: STATUS_TONE[newStatus] || 'primary',
      confirmLabel: t(`request.${newStatus}`, t('admin.confirm_action')),
      onConfirm: async () => {
        setConfirm({ open: false });
        await performStatusChange(newStatus);
      },
    });
  };

  // "Stop the request" closes it (AYK-041). With "I found a provider" ticked, the
  // request is agreed with that provider, marked done, and the rating page opens.
  // Providers who withdrew are hidden from the requester; they may contact again (AYK-084).
  const shownOffers = isOwner ? offers.filter(o => o.status !== 'withdrawn') : offers;
  // AYK-487 (the owner: «العروض لا تظهر إلا لصاحب الطلب، وتظهر للباقين كرقم فقط، ولا يفتح التفاصيل إلا صاحب
  // الطلب»): the offers list is the requester's (and the administration's). Another provider sees only the
  // number of offers (in the request's details line) and, if he made one, his own offer; never an empty
  // «no offers yet» that would say there are none.
  const seesAllOffers = Boolean(isOwner || (user?.role === 'admin' && canManageRequests));
  const contactedProviders = shownOffers.filter((o, i) => shownOffers.findIndex(x => x.provider_id === o.provider_id) === i);
  const closeRequest = async () => {
    setSubmitting(true);
    setErr('');
    try {
      if (closing.found && closing.providerId) {
        await agreeRequest(request.id, Number(closing.providerId));
        await updateRequestStatus(request.id, { status: 'completed' });
        navigate(`/requests/${request.id}/review`);
        return;
      }
      await updateRequestStatus(request.id, { status: 'cancelled' });
      setClosing({ open: false, found: false, providerId: '' });
      await load();
    } catch (e) { !e?.cancelled && setErr(apiError(e)); } finally { setSubmitting(false); }
  };

  return (
    <div className="container page">
      <AdSlot placement="request_details_top" className="mb-4" />
      {/* What each side can do with this request, at the top and in words (AYK-071). */}
      {(isOwner || (user && user.id === request.assigned_provider_id)) && ['assigned', 'in_progress'].includes(request.status) && (
        <div className="card mb-4" data-testid="request-manage" style={{ borderInlineStart: '4px solid var(--primary)' }}>
          <strong>🗂️ {t('request.manage_title')}</strong>
          <p className="text-sm text-muted mt-1 mb-3">{t(isOwner ? 'request.manage_owner_hint' : 'request.manage_provider_hint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => changeStatus('completed')} data-testid="manage-complete">✅ {t('request.complete')}</Button>
            {isOwner
              ? <Button variant="danger" onClick={() => changeStatus('cancelled')} data-testid="manage-cancel">✖ {t('request.cancel')}</Button>
              : <Button variant="outline" onClick={() => changeStatus('open')} data-testid="manage-withdraw">↩ {t('request.withdraw')}</Button>}
          </div>
        </div>
      )}
      {(isOwner || (user && user.id === request.assigned_provider_id)) && request.assigned_provider_id && ['assigned', 'in_progress', 'completed', 'cancelled', 'closed'].includes(request.status) && (
        <WarrantyBox request={request} userId={user?.id} onChange={load} />
      )}
      {/* AYK-399/402: who the open request reaches, and editing it before an agreement. */}
      {isOwner && request.status === 'open' && !request.assigned_provider_id && <RequestReach requestId={request.id} version={request.updated_at} />}
      {isOwner && request.status === 'open' && !request.assigned_provider_id && <div className="mb-4"><RequestEdit request={request} onSaved={load} /></div>}
      {/* An open request should not hang: the requester closes it once agreed with someone. */}
      {isOwner && request.status === 'open' && (
        <div className="card mb-4" data-testid="request-found-check" style={{ borderInlineStart: '4px solid var(--primary)' }}>
          <strong>{t('request.found_title')}</strong>
          <p className="text-sm text-muted mt-1 mb-3">{t('request.found_hint')}</p>
          {!closing.open ? <Button variant="primary" size="sm" onClick={() => setClosing(c => ({ ...c, open: true }))} data-testid="close-request">{t('request.found_stop')}</Button>
            : <div className="space-y-2" data-testid="close-request-box">
              <label className="flex items-center gap-2 text-[14px] font-semibold cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-primary" checked={closing.found} data-testid="found-provider"
                  onChange={e => setClosing(c => ({ ...c, found: e.target.checked, providerId: e.target.checked && contactedProviders.length === 1 ? String(contactedProviders[0].provider_id) : '' }))} />
                {t('requester.found_provider')}
              </label>
              {closing.found && (contactedProviders.length === 0
                ? <p className="text-xs text-muted m-0">{t('requester.found_none')}</p>
                : <select className="select" value={closing.providerId} data-testid="found-provider-select" aria-label={t('requester.found_which')}
                  onChange={e => setClosing(c => ({ ...c, providerId: e.target.value }))}>
                  <option value="">{t('requester.found_which')}</option>
                  {contactedProviders.map(o => <option key={o.provider_id} value={o.provider_id}>{o.provider_name}</option>)}
                </select>)}
              {closing.found && closing.providerId && <p className="text-xs text-muted m-0">⭐ {t('requester.found_rate_next')}</p>}
              <div className="flex gap-2 flex-wrap">
                <Button variant="primary" size="sm" loading={submitting} disabled={closing.found && !closing.providerId} onClick={closeRequest} data-testid="close-request-confirm">
                  {closing.found ? t('requester.close_and_rate') : t('requester.close_request')}</Button>
                <Button variant="outline" size="sm" onClick={() => setClosing({ open: false, found: false, providerId: '' })}>{t('admin.cancel_btn')}</Button>
              </div>
            </div>}
        </div>
      )}
      {err && <BlockedNotice message={err} otherId={errWith} onUnblocked={() => setErr('')} className="form-error mb-3 p-2.5 rounded-lg bg-danger-soft" />}

      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {request.is_urgent && <span className="badge badge-urgent">⚡ {t('request.urgent')}</span>}
          </div>
          <span className="flex items-center gap-2">
            <span className="text-sm text-muted">{formatRelativeTime(request.created_at)}</span>
            {/* AYK-436: share this request (its owner or a provider), on the main address. */}
            {/* AYK-455: anyone shares a published request. */}<ShareMenu url={`${SITE_URL}/requests/${request.id}`} title={translation.title}
              text={t('share.request_text', { title: translation.title })} testId="request-page-share" />
          </span>
        </div>

        {/* AYK-432: the state beside the title; open reads «متاح» in fixed green. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="min-w-0 m-0">{translation.title}</h2>
          <RequestStatusBadge status={request.status} />
        </div>
        {translation.description.trim() !== translation.title.trim() && <p className="text-secondary" style={{ whiteSpace: 'pre-wrap' }} data-testid="request-description">{translation.description}</p>}
        <TranslatedNote translation={translation} className="mb-3" />

        <div className="grid grid-2 mt-4 text-sm">
          <div>📁 <strong>{t('request.category')}:</strong> {localizedJoinedName(request, 'category', i18n.resolvedLanguage) || '-'}</div>
          <div>🛠️ <strong>{t('request.service')}:</strong> {localizedJoinedName(request, 'service', i18n.resolvedLanguage) || '-'}</div>
          <div>📍 <strong>{t('location.city')}:</strong> {localizedJoinedName(request, 'city', i18n.resolvedLanguage) || '-'}{request.district_name ? ` · ${localizedJoinedName(request, 'district', i18n.resolvedLanguage)}` : ''}
            {requestMapsUrl(request) && <a href={requestMapsUrl(request)} target="_blank" rel="noopener noreferrer" className="ms-2 text-primary font-semibold" data-testid="request-maps">🗺️ {t('requester.open_maps')}</a>}</div>
          <div>💰 <strong>{t('request.budget')}:</strong> {request.budget_min ? `${formatCurrency(request.budget_min)}${request.budget_max ? ` - ${formatCurrency(request.budget_max)}` : ''}` : t('request.budget_not_set')}</div>
          <div>📨 <strong>{t('request.offers_count')}:</strong> {request.offers_count}</div>
          {request.views_count != null && <div>👁️ <strong>{t('request.views_count')}:</strong> {request.views_count}</div>}
        </div>

        {request.files && request.files.length > 0 && (
          <div className="mt-4">
            <h4>{t('request.attachments')}</h4>
            <RequestMedia files={request.files} />
          </div>
        )}

        {assignedProviderOffer && (
          <div
            data-assigned-provider-id={assignedProviderOffer.provider_id}
            className="mt-4 p-3 rounded-card"
            style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)' }}
          >
            <div className="text-xs text-muted mb-2">{t('auth.role_provider')}</div>
            <div className="flex items-center gap-3">
              <Avatar src={assignedProviderOffer.provider_avatar} name={assignedProviderOffer.provider_name} size="sm" />
              <strong className="text-sm">{assignedProviderOffer.provider_name}</strong>
            </div>
            <ProviderServiceModeBadge mode={assignedProviderOffer.location_mode} className="mt-2" />
          </div>
        )}

        <div className="flex gap-2 mt-4 flex-wrap">
          {request.assigned_provider_id && (user?.id === request.client_id || user?.id === request.assigned_provider_id) && (
            <>
              <Button variant="primary" onClick={openChat}>{t('request.open_chat')}</Button>
              <Button variant="outline" onClick={() => navigate(`/requests/${request.id}/track`)}>
                🗺️ {t('tracking.title')}
              </Button>
              <Suspense fallback={null}><CallButtons userId={user?.id === request.client_id ? request.assigned_provider_id : request.client_id} /></Suspense>
            </>
          )}
          {isOwner && request.status === 'assigned' && (
            <Button variant="outline" onClick={() => changeStatus('in_progress')}>{t('request.start_progress')}</Button>
          )}
          {isOwner && request.status === 'open' && (
            <Button variant="danger" onClick={() => changeStatus('cancelled')}>{t('request.cancel')}</Button>
          )}
          {request.status === 'completed' && isOwner && (
            <Link to={`/requests/${request.id}/review`} className="btn btn-primary">⭐ {t('review.rate_provider')}</Link>
          )}
          {request.status === 'completed' && user?.id === request.assigned_provider_id && (
            <Link to={`/requests/${request.id}/review`} className="btn btn-primary">⭐ {t('review.rate_requester')}</Link>
          )}
          {(isOwner || user?.id === request.assigned_provider_id) && request.status !== 'open' && (
            <Link to={`/disputes/new/${request.id}`} className="btn btn-outline">⚖️ {t('dispute.open_dispute')}</Link>
          )}
        </div>
        {request.assigned_provider_id && (user?.id === request.client_id || user?.id === request.assigned_provider_id) && (
          <Suspense fallback={null}><CallHistory requestId={request.id} /></Suspense>
        )}
      </div>

      {/* No prices here: the provider contacts the requester and they agree in the chat. */}
      {turnedDown && request.status === 'open' && (
        <div className="card mb-4 text-sm text-muted" data-testid="provider-turned-down">{t('request.turned_down')}</div>
      )}
      {/* AYK-501 (the owner): a visitor fails the contact conditions, so there is no link to follow, only a reminder. */}
      {!user && request.status === 'open' && <p className="card mb-4 text-center text-[14px] font-bold text-fg-muted" data-testid="join-reminder">{t('request.join_reminder')}</p>}
      {canOffer && (
        <div className="card mb-4" data-testid="provider-contact">
          <p className="text-sm text-muted mb-3">{t('request.contact_hint')}</p>
          {/* AYK-427: call, WhatsApp (when the requester shows them) and chat, as clear buttons. */}
          <ContactButtons title={`💬 ${t('request.contact_owner')}`} phone={request.client_contact_phone} whatsapp={request.client_contact_whatsapp}
            busy={submitting} onChat={contactOwner} testId="request-owner-contact" intro={intro({ request: translation.title })} link={`/requests/${request.id}`} />
        </div>
      )}
      {/* AYK-501 (the owner): a requester, and any member who fails a condition, gets NO contact block: no icon, no chat button. */}

      {/* AYK-438: the requester sees what of their details shows on this request, and to whom. */}
      {isOwner && request.status === 'open' && (() => {
        const lv = key => (Number(user?.[key]) ? 1 : 0);
        const label = () => t('contact_privacy.level_providers');
        const rows = [['share_name', 'name_label'], ['share_phone', 'phone_label'], ['share_whatsapp', 'whatsapp_label']].filter(([k]) => lv(k) > 0);
        return (
          <div className="card mb-4 text-[13px]" data-testid="my-visible-details">
            <div className="font-bold mb-1">👁 {t('contact_privacy.my_visible')}</div>
            {rows.length
              ? <ul className="m-0 ps-5">{rows.map(([k, l]) => <li key={k}>{t(`contact_privacy.${l}`)}: <b>{label(lv(k))}</b></li>)}</ul>
              : <p className="m-0 text-fg-muted">{t('contact_privacy.my_visible_none')}</p>}
            <Link to="/profile#contact-privacy" className="inline-block mt-1.5 font-semibold text-primary">{t('contact_privacy.my_visible_edit')}</Link>
          </div>
        );
      })()}
      {isOwner && request.status === 'open' && request.category_id && (
        <div className="mb-4">
          <MatchingProviders categoryId={request.category_id} showChips={false} title={t('request.matching_title')}
            fixedArea={{ city_id: request.city_id, district_id: request.district_id }} onContact={contactProvider} />
        </div>
      )}

      {canReadRequestOffers(user, request, canManageRequests) && (seesAllOffers || myOffer) && <div className="card" data-testid={seesAllOffers ? 'offers-card' : 'my-offer-card'}>
        <h3>{seesAllOffers ? `${t('request.contacts_title')} (${shownOffers.length})` : t('request.my_offer_title')}</h3>
        {shownOffers.length === 0 ? (
          <EmptyState title={t('request.no_offers_yet')} body={t('request.offers_will_appear')} />
        ) : (
          <div className="flex flex-col gap-3">
            {shownOffers.map(o => {
              const oStatus = OFFER_STATUS[o.status] || {};
              return (
                <div key={o.id} className="offer-card" data-offer-id={o.id}>
                  <div className="flex items-center gap-3">
                    <Avatar src={o.provider_avatar} name={o.provider_name} />
                    <div style={{ flex: 1 }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* The provider's name, clear and large, with the account number (AYK-142). */}
                        <strong className="text-[17px] font-extrabold text-ink">{o.provider_name}</strong>
                        {o.provider_code && <span className="px-1.5 py-0.5 rounded-pill bg-surface-alt text-[12px] font-bold text-fg-muted" dir="ltr">{o.provider_code}</span>}
                        {o.provider_verified ? <span className="badge badge-success">{t('offer.verified')}</span> : null}
                        {o.badge_trusted_active ? <span title={t('badge.trusted_name')} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-pill bg-emerald-50 text-emerald-700 text-[10.5px] font-bold">🛡️ {t('badge.trusted_short')}</span> : null}
                        {o.badge_featured_active ? <span title={t('badge.featured_name')} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-pill bg-amber-50 text-amber-700 text-[10.5px] font-bold">⭐ {t('badge.featured_short')}</span> : null}
                        {o.is_featured && !o.badge_featured_active ? <span className="badge badge-warning">{t('offer.featured')}</span> : null}
                      </div>
                      <div className="text-xs text-muted">
                        {Number(o.rating_count) > 0 && <><RatingInline average={o.rating_avg} count={o.rating_count} /> · </>}
                        📦 {o.completed_orders || 0} {t('offer.completed_orders')}
                      </div>
                    </div>
                    <div className="text-end">
                      {Number(o.price) > 0 && <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>
                        {formatCurrency(o.price)}
                      </div>}
                      <span className={`badge ${oStatus.color}`}>{oStatus.i18nKey ? t(oStatus.i18nKey) : ''}</span>
                    </div>
                  </div>
                  <ProviderServiceModeBadge mode={o.location_mode} className="mt-2" />
                  {o.message && <p className="mt-2 text-sm text-secondary">{o.message}</p>}
                  {o.estimated_duration && (
                    <div className="text-xs text-muted">⏱ {t('offer.duration')}: {o.estimated_duration}</div>
                  )}
                  {isOwner && o.status === 'pending' && request.status === 'open' && (
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="primary" onClick={() => onAccept(o.id)}>✅ {t('request.agreed')}</Button>
                      <Button size="sm" variant="outline" onClick={() => onReject(o.id)}>{t('offer.reject')}</Button>
                    </div>
                  )}
                  {(isOwner || (o.status === 'pending' && request.status === 'open' &&
                    user?.role === 'provider' && Number(user.id) === Number(o.provider_id))) && (
                    // AYK-430: call, WhatsApp (when the provider shows them) and chat as clear buttons.
                    <div data-negotiate-offer-id={o.id}>
                      <ContactButtons size="sm" className="mt-2" testId="offer-contact"
                        phone={isOwner ? o.public_phone : null} whatsapp={isOwner ? o.public_whatsapp : null}
                        busy={negotiatingOfferId === o.id || (negotiatingOfferId != null && negotiatingOfferId !== o.id)}
                        onChat={() => negotiateOffer(o)} intro={isOwner ? intro({ myRequest: translation.title }) : intro({ request: translation.title })} link={`/requests/${request.id}`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <style>{`
          .offer-card { padding: 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-soft); }
        `}</style>
      </div>}
      <AdSlot placement="request_details_bottom" className="mt-4" />
      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
    </div>
  );
}
