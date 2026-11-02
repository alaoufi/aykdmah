import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import CallButtons from '../components/calls/CallButtons';
import { useCall } from '../context/CallContext';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  listConversations, getConversation, getMessages, sendMessage, markRead, forwardMessage,
  deleteMessage, sendLocationMessage, nudgeConversation, setUserBlocked, setConversationFavorite,
} from '../services/chatService';
import { apiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { useSocket } from '../hooks/useSocket';
import MessageBubble from '../components/chat/MessageBubble';
import ChatInput from '../components/chat/ChatInput';
import ChatSettings from '../components/chat/ChatSettings';
import ChatHeaderMenu from '../components/chat/ChatHeaderMenu';
import { useChatPrefs } from '../utils/chatPrefs';
import RequestBrief from '../components/chat/RequestBrief';
import Avatar from '../components/common/Avatar';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { LoadingState, EmptyState } from '../components/common/Spinner';
import { formatRelativeTime, formatTime, truncate, dayLabel, isSameDay } from '../utils/formatters';
import { getCurrentPosition } from '../utils/geo';
import { sentTone } from '../utils/ringtone';
import { createPollingLoop } from '../utils/polling';
import { agreeRequest, saveToDirectory } from '../services/requestService';
import { askConfirm, askText, showAlert } from '../components/common/AppDialog';
import AdSlot from '../components/ads/AdSlot';

// A bold back arrow toward the start side: right in Arabic, left in English (AYK-137).
function BackArrow() {
  return (
    <svg className="back-arrow" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
      strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export default function ChatPage() {
  // The saved message text size applies as soon as the chat opens (AYK-126).
  useChatPrefs();
  const { t } = useTranslation();
  const { id: activeId } = useParams();
  const { user } = useAuth();
  // Reading a chat updates the unread count on "Chats".
  const { refresh: refreshBadges } = useNotifications();
  const { socket, realtimeMode } = useSocket();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState([]);
  // Chats and their archive (AYK-044): a chat about a finished or closed request, or
  // one closed when the requester agreed with someone else, moves to the archive.
  const [searchParams, setSearchParams] = useSearchParams();
  const showArchive = searchParams.get('archive') === '1';
  const archived = c => Boolean(c.request_id) && (!c.can_send || ['completed', 'closed', 'cancelled'].includes(c.request_status));
  const [listOwnerId, setListOwnerId] = useState(null);
  const [active, setActive] = useState(null);
  const [blockProblem, setBlockProblem] = useState('');
  const listMenuRef = useRef(null);
  const [listSettingsOpen, setListSettingsOpen] = useState(false);
  const [blockDone, setBlockDone] = useState('');
  const { start: startCall } = useCall();
  const [agreeing, setAgreeing] = useState(false);
  const [activeScope, setActiveScope] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [typingUserId, setTypingUserId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [sharingLocation, setSharingLocation] = useState(false);
  const endRef = useRef(null);
  const listPollRef = useRef(null);
  const messagePollRef = useRef(null);
  const typingTimerRef = useRef(null);
  const scopeRef = useRef(null);
  const sessionKey = `${user?.id}:${activeId || ''}`;
  scopeRef.current = sessionKey;
  const activeReady = activeScope === sessionKey && Number(active?.id) === Number(activeId);
  const canSend = activeReady && active.can_send !== false;
  const canShareLocation = canSend && active.can_share_location !== false;
  const [listError, setListError] = useState(false);
  const [messageError, setMessageError] = useState(false);
  const [messageErrorScope, setMessageErrorScope] = useState(null);
  const listReady = listOwnerId === user?.id;
  const currentMessageError = messageError && messageErrorScope === sessionKey;

  const loadList = useCallback(() => listPollRef.current?.refresh(), []);

  useEffect(() => {
    setConversations([]);
    setListOwnerId(null);
    setLoadingList(true);
    setListError(false);
    if (!user?.id) { setLoadingList(false); return; }
    const poll = createPollingLoop(listConversations, {
      intervalMs: realtimeMode === 'polling' ? 10000 : null,
      onResult: (items) => {
        setConversations(items || []);
        setListOwnerId(user.id);
        setLoadingList(false);
        setListError(false);
      },
      onError: () => { setListOwnerId(user.id); setLoadingList(false); setListError(true); },
    });
    listPollRef.current = poll;
    return () => { poll.stop(); listPollRef.current = null; };
  }, [user?.id, realtimeMode]);

  useEffect(() => {
    setActive(null);
    setActiveScope(null);
    setMessages([]);
    setReplyTo(null);
    setDeleteCandidate(null);
    setSharingLocation(false);
    setTypingUserId(null);
    setMessageError(false);
    setMessageErrorScope(null);
    if (!activeId || !user?.id) { setLoadingMsgs(false); return; }
    setLoadingMsgs(true);
    const scope = `${user.id}:${activeId}`;
    let markingRead = false;
    const poll = createPollingLoop(
      () => Promise.all([getConversation(activeId), getMessages(activeId, { limit: 80 })]),
      {
        // With the socket too, every 15 s: read ticks (✓✓) and missed messages after a dropped connection.
        intervalMs: realtimeMode === 'polling' ? 5000 : 15000,
        onResult: ([conv, msgs]) => {
          setActive(conv);
          setActiveScope(scope);
          setMessages(msgs || []);
          setLoadingMsgs(false);
          setMessageError(false);
          setMessageErrorScope(null);
          if (!markingRead && msgs?.some(m => m.sender_id !== user.id && !m.is_read)) {
            markingRead = true;
            markRead(activeId).then(() => { loadList(); refreshBadges(); }).catch(() => {}).finally(() => { markingRead = false; });
          }
        },
        onError: (error) => {
          setLoadingMsgs(false);
          setMessageError(true);
          setMessageErrorScope(scope);
          if ([403, 404].includes(error?.response?.status)) navigate('/chat', { replace: true });
        },
      },
    );
    messagePollRef.current = poll;
    return () => { poll.stop(); messagePollRef.current = null; };
  }, [activeId, user?.id, realtimeMode, navigate, loadList]);

  useEffect(() => () => {
    scopeRef.current = null;
    clearTimeout(typingTimerRef.current);
  }, []);

  useEffect(() => {
    if (!socket || !activeId) return;
    const scope = `${user?.id}:${activeId || ''}`;
    socket.emit('chat:join', Number(activeId));
    const onMessage = (msg) => {
      if (scopeRef.current !== scope) return;
      if (Number(msg.conversation_id) === Number(activeId)) {
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        markRead(activeId).then(refreshBadges).catch(() => {});
      }
      loadList();
    };
    const onTyping = (data) => {
      if (scopeRef.current !== scope) return;
      if (Number(data.conversationId) === Number(activeId) && data.userId !== user.id) {
        setTypingUserId(data.isTyping ? data.userId : null);
        if (data.isTyping) {
          clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => setTypingUserId(null), 2500);
        }
      }
    };
    const onDeleted = (payload) => {
      if (scopeRef.current !== scope) return;
      if (Number(payload.conversationId) === Number(activeId)) {
        setMessages(prev => prev.filter(m => m.id !== payload.messageId));
      }
    };
    const onRead = (payload) => {
      if (scopeRef.current !== scope) return;
      if (Number(payload.conversationId) === Number(activeId) && payload.userId !== user.id) {
        setMessages(prev => prev.map(m =>
          m.sender_id === user.id && !m.is_read ? { ...m, is_read: 1 } : m
        ));
      }
    };
    socket.on('chat:message', onMessage);
    socket.on('chat:typing', onTyping);
    socket.on('chat:deleted', onDeleted);
    socket.on('chat:read', onRead);
    // Reached the other phone (AYK-122): ✓ becomes a grey ✓✓.
    const onDelivered = (payload) => {
      if (scopeRef.current !== scope || Number(payload.conversationId) !== Number(activeId)) return;
      const ids = new Set((payload.ids || []).map(Number));
      setMessages(prev => prev.map(m => ids.has(Number(m.id)) && !m.delivered_at ? { ...m, delivered_at: new Date().toISOString() } : m));
    };
    socket.on('chat:delivered', onDelivered);
    return () => {
      socket.off('chat:delivered', onDelivered);
      clearTimeout(typingTimerRef.current);
      socket.emit('chat:leave', Number(activeId));
      socket.off('chat:message', onMessage);
      socket.off('chat:typing', onTyping);
      socket.off('chat:deleted', onDeleted);
      socket.off('chat:read', onRead);
    };
  }, [socket, activeId, user, loadList]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages.at(-1)?.id, typingUserId]);

  // "Forward" (AYK-043): after sending, the requester forwards their own message (a
  // voice note, a video, text) to every provider on this request, or to one of them.
  const siblings = active?.request_id && Number(active.request_client_id) === Number(user.id)
    ? conversations.filter(c => Number(c.request_id) === Number(active.request_id) && Number(c.id) !== Number(activeId) && c.can_send) : [];
  const isRequestOwner = Boolean(active?.request_id) && Number(active.request_client_id) === Number(user.id);
  const [forwarding, setForwarding] = useState(null);
  const [forwardNote, setForwardNote] = useState('');
  // "🔔 Remind": shown while my last message is unread (AYK-052).
  const [nudgeNote, setNudgeNote] = useState('');
  useEffect(() => { setNudgeNote(''); }, [activeId]);
  const lastMessage = messages[messages.length - 1];
  const canNudge = lastMessage && lastMessage.sender_id === user.id && !lastMessage.is_read;
  const sendNudge = async () => {
    // The sender hears the same tone the other side gets (AYK-106), so the tap is confirmed.
    try {
      const result = await nudgeConversation(activeId);
      sentTone();
      setNudgeNote(result?.reached === false ? t('chat.nudge_unreachable', { name: otherParticipant?.full_name || '' }) : t('chat.nudge_sent'));
    }
    catch (err) { setNudgeNote(err?.response?.data?.message || t('chat.nudge_failed')); }
  };
  const forwardTo = async target => {
    const message = forwarding;
    setForwarding(null);
    try {
      const result = await forwardMessage(activeId, message.id, target);
      setForwardNote(t('requester.forward_done', { count: result.count }));
      loadList();
    } catch (_) { setForwardNote(t('errors.generic')); }
  };

  const handleSend = async ({ content, files }) => {
    if (!activeId || !canSend) return false;
    const scope = scopeRef.current;
    try {
      const fd = new FormData();
      if (content) fd.append('content', content);
      const isVoice = files.length === 1 && files[0].type?.startsWith('audio/');
      if (isVoice) fd.append('message_type', 'voice');
      else if (files.length && !content) fd.append('message_type', 'file');
      if (replyTo) fd.append('reply_to_id', String(replyTo.id));
      files.forEach(f => fd.append('files', f));
      const msg = await sendMessage(activeId, fd);
      if (scopeRef.current !== scope) return false;
      messagePollRef.current?.refresh();
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      sentTone();
      setReplyTo(null);
      loadList();
      return true;
    } catch (err) {
      if (scopeRef.current === scope) showAlert({ message: t('errors.generic') });
      return false;
    }
  };

  const handleShareLocation = async () => {
    if (!activeId || !canShareLocation || sharingLocation) return;
    const scope = scopeRef.current;
    setSharingLocation(true);
    try {
      const pos = await getCurrentPosition();
      if (scopeRef.current !== scope) return;
      const msg = await sendLocationMessage(activeId, {
        latitude: pos.latitude, longitude: pos.longitude,
        accuracy_m: pos.accuracy_m,
        reply_to_id: replyTo ? replyTo.id : undefined,
      });
      if (scopeRef.current !== scope) return;
      messagePollRef.current?.refresh();
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      setReplyTo(null);
      loadList();
    } catch (err) {
      if (scopeRef.current === scope) showAlert({ message: t('location.geolocation_failed') });
    } finally {
      if (scopeRef.current === scope) setSharingLocation(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteCandidate || !activeReady) return;
    const scope = scopeRef.current;
    try {
      await deleteMessage(activeId, deleteCandidate.id);
      if (scopeRef.current !== scope) return;
      messagePollRef.current?.refresh();
      setMessages(prev => prev.filter(m => m.id !== deleteCandidate.id));
    } catch (_) {}
    if (scopeRef.current === scope) setDeleteCandidate(null);
  };

  // Render with date separators
  const renderedMessages = useMemo(() => {
    const out = [];
    let lastDate = null;
    for (const m of messages) {
      if (!isSameDay(lastDate, m.created_at)) {
        out.push({ __type: 'separator', key: `sep-${m.id}`, date: m.created_at });
        lastDate = m.created_at;
      }
      out.push(m);
    }
    return out;
  }, [messages]);

  const otherParticipant = activeReady ? active?.participants?.find(p => p.id !== user.id) : null;
  const requestId = activeReady ? active?.request_id : null;
  const handleAgree = async () => {
    if (!requestId || !otherParticipant || agreeing) return;
    if (!(await askConfirm({ message: t('chat.agreed_confirm', { name: otherParticipant.full_name }) }))) return;
    setAgreeing(true);
    try {
      await agreeRequest(requestId, otherParticipant.id);
      setActive(current => (current && current.id === active.id ? { ...current, request_status: 'assigned' } : current));
    } catch (_) { /* the request page shows the reason */ } finally { setAgreeing(false); }
  };

  // "📇 Save to My directory" under a chosen name (AYK-109); tapping again renames it.
  const saveContact = async () => {
    const peerId = otherParticipant?.id;
    if (!peerId || !active) return;
    const name = await askText({ title: t('directory.save_title'), message: t('directory.name_prompt'), value: active.directory_name || otherParticipant.full_name || '', required: true, maxLength: 80 });
    if (name === null) return;
    setBlockProblem('');
    try {
      await saveToDirectory(peerId, true, name.trim());
      setActive(current => (current && current.id === active.id ? { ...current, in_directory: true, directory_name: name.trim() || null } : current));
      setNudgeNote(t('directory.saved_note', { name: name.trim() || otherParticipant.full_name }));
    } catch (err) { setBlockProblem(apiError(err)); }
  };

  // ⭐ Favourite conversation (AYK-130): starred chats stay at the top of the list.
  const isFavorite = Boolean(Number(conversations.find(c => c.id === Number(activeId))?.is_favorite));
  const toggleFavorite = async () => {
    const id = Number(activeId);
    const next = !isFavorite;
    setConversations(list => list.map(c => (c.id === id ? { ...c, is_favorite: next ? 1 : 0 } : c)));
    try { await setConversationFavorite(id, next); }
    catch (err) {
      setConversations(list => list.map(c => (c.id === id ? { ...c, is_favorite: next ? 0 : 1 } : c)));
      setBlockProblem(apiError(err));
    }
  };

  // "🚫 Block" / "✅ Unblock" the other side (AYK-084); refused while working together or in warranty.
  const toggleBlock = async () => {
    const peerId = otherParticipant?.id;
    if (!peerId || !active) return;
    const next = !active.blocked_by_me;
    const name = otherParticipant.full_name || '';
    // Asked first, confirmed after, both ways (AYK-115).
    if (!(await askConfirm({ message: t(next ? 'chat.block_confirm' : 'chat.unblock_confirm', { name }), tone: next ? 'danger' : undefined }))) return;
    setBlockProblem(''); setBlockDone('');
    try {
      await setUserBlocked(peerId, next);
      const fresh = await getConversation(active.id);
      setActive(current => (current && current.id === fresh.id ? { ...current, ...fresh } : current));
      setBlockDone(t(next ? 'chat.block_done' : 'chat.unblock_done', { name }));
      setTimeout(() => setBlockDone(''), 6000);
    } catch (err) { setBlockProblem(apiError(err)); }
  };

  return (
    <div className="chat-page">
      <aside className={`chat-sidebar ${activeId ? 'hide-on-mobile' : ''}`}>
        <div className="sidebar-header">
          {/* The chats page has no site header, so it carries its own way back (AYK-044). */}
          <div className="flex items-center justify-between gap-2">
            {/* The way home in place of the title (AYK-137); the archive shows beside it when open. */}
            <div className="flex items-center gap-2 min-w-0">
              <Link to="/" className="list-home" data-testid="chat-home"><BackArrow /><span>{t('nav.home')}</span></Link>
              {showArchive && <span className="text-[13px] font-bold text-fg-muted whitespace-nowrap">🗄️ {t('requester.chat_archive')}</span>}
            </div>
            {/* The list's ⋮ (AYK-133): chats or their archive, the messages' settings (which belong
                to all chats, AYK-129), and the way back home (AYK-044). */}
            <ChatHeaderMenu buttonRef={listMenuRef}>
              <button type="button" role="menuitem" aria-current={!showArchive} className={!showArchive ? 'current' : ''} onClick={() => setSearchParams({})} data-testid="chat-tab-active">
                💬 {t('chat.title')} ({conversations.filter(c => !archived(c)).length})</button>
              <button type="button" role="menuitem" aria-current={showArchive} className={showArchive ? 'current' : ''} onClick={() => setSearchParams({ archive: '1' })} data-testid="chat-tab-archive">
                🗄️ {t('requester.chat_archive')} ({conversations.filter(archived).length})</button>
              <button type="button" role="menuitem" onClick={() => setListSettingsOpen(true)} data-testid="chat-settings">⚙️ {t('chat.settings')}</button>
            </ChatHeaderMenu>
            <ChatSettings anchorRef={listMenuRef} open={listSettingsOpen} onClose={() => setListSettingsOpen(false)} />
          </div>
          {listReady && listError && <p role="alert" className="text-xs text-danger">{t('errors.generic')}</p>}
        </div>
        {loadingList || !listReady ? <LoadingState /> :
         conversations.filter(c => archived(c) === showArchive).length === 0 ? <EmptyState title={t(showArchive ? 'requester.chat_archive_empty' : 'chat.no_conversations')} /> :
         (
          <div className="conv-list">
            {!showArchive && <div className="px-3 pt-2"><AdSlot placement="chat_sidebar" /></div>}
            {conversations.filter(c => archived(c) === showArchive)
              .sort((a, b) => Number(Boolean(Number(b.is_favorite))) - Number(Boolean(Number(a.is_favorite))))
              .map(c => {
              const other = typeof c.other_user === 'string' ? JSON.parse(c.other_user) : c.other_user;
              const last = typeof c.last_message === 'string' ? JSON.parse(c.last_message) : c.last_message;
              const isActive = Number(activeId) === c.id;
              const lastPreview = last
                ? last.message_type === 'location' ? '📍 ' + t('chat.shared_location')
                  : last.message_type === 'system' && /^call:missed:/.test(last.content || '') ? '📞 ' + t('calls.missed_short')
                : last.message_type === 'voice' ? '🎙️ ' + t('chat.voice_message')
                  : last.message_type === 'image' ? '🖼️ ' + (last.content || t('chat.image'))
                  : last.content || '📎'
                : t('chat.no_messages');
              return (
                // A tidy row like the phone's own chat lists (AYK-154): picture, name with its number,
                // the time, the last message, and the unread count under the time.
                <Link key={c.id} to={`/chat/${c.id}`} className={`conv-item ${isActive ? 'active' : ''} ${c.unread_count > 0 ? 'unread' : ''}`}>
                  {other?.role === 'client' && !other?.avatar
                    ? <span className="conv-avatar-person" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.2 0-8 2.1-8 5v1.2c0 .4.4.8.8.8h14.4c.4 0 .8-.4.8-.8V19c0-2.9-3.8-5-8-5Z" /></svg></span>
                    : <Avatar src={other?.avatar} name={other?.full_name} />}
                  <div className="conv-text">
                    <div className="conv-top">
                      <span className="conv-name">
                        {Number(c.is_favorite) ? <span aria-label={t('chat.favorite')}>⭐</span> : null}
                        <span className="conv-name-text">{other?.full_name || '—'}</span>
                        {other?.referral_code && <span className="conv-code" dir="ltr">{other.referral_code}</span>}
                      </span>
                      <span className="conv-time">{last ? (isSameDay(last.created_at, new Date()) ? formatTime(last.created_at) : dayLabel(last.created_at, t)) : ''}</span>
                    </div>
                    <div className="conv-bottom">
                      <span className="conv-preview">{truncate(lastPreview, 60)}</span>
                      {c.unread_count > 0 && <span className="conv-unread">{c.unread_count}</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </aside>

      <section className={`chat-main ${!activeId ? 'hide-on-mobile' : ''}`}>
        {!activeId ? (
          <div className="empty-state" style={{ flex: 1 }}>
            <div style={{ fontSize: 48 }}>💬</div>
            <h3>{t('chat.title')}</h3>
            <p>{t('chat.no_conversations')}</p>
          </div>
        ) : loadingMsgs || (!activeReady && !currentMessageError) ? (
          <LoadingState />
        ) : (
          <>
            <header className="chat-header">
              <Link to="/chat" className="back-btn" aria-label={t('chat.title')}><BackArrow /></Link>
              {otherParticipant && (
                <>
                  <Avatar src={otherParticipant.avatar} name={otherParticipant.full_name} />
                  <div className="chat-peer">
                    <div className="chat-peer-name">
                      {isFavorite && <span aria-label={t('chat.favorite')}>⭐</span>}
                      <strong>{otherParticipant.full_name}</strong>
                      {otherParticipant.referral_code && <span className="chat-peer-code" dir="ltr" data-testid="chat-peer-code">{otherParticipant.referral_code}</span>}
                    </div>
                    <div className="chat-peer-status">
                      {realtimeMode === 'polling'
                        ? t('chat.periodic_updates', { defaultValue: 'تُحدّث الرسائل كل 5 ثوانٍ' })
                        : otherParticipant.is_online
                        ? '🟢 ' + t('chat.online')
                        : otherParticipant.last_seen_at
                          ? `${t('chat.last_seen')} ${dayLabel(otherParticipant.last_seen_at, t)} ${formatTime(otherParticipant.last_seen_at)}`
                          : ''}
                    </div>
                  </div>
                  {canSend && <CallButtons conversationId={Number(activeId)} compact />}
                  <ChatHeaderMenu>
                    {/* Live tracking works only for the agreed pair, so it shows only then. */}
                    {requestId && canShareLocation && (
                      <Link to={`/requests/${requestId}/track`} role="menuitem">📍 {t('tracking.title')}</Link>
                    )}
                    {/* Already in the directory: nothing to show. Removed from it, saving comes back
                        (in_directory is read from the directory each time the chat opens). */}
                    {!active?.in_directory && (
                      <button type="button" role="menuitem" onClick={saveContact} data-testid="chat-save-contact">📇 {t('directory.save')}</button>
                    )}
                    <button type="button" role="menuitem" onClick={toggleFavorite} data-testid="chat-favorite" aria-pressed={isFavorite}>
                      {isFavorite ? '⭐' : '☆'} {t(isFavorite ? 'chat.unfavorite' : 'chat.favorite')}
                    </button>
                    <button type="button" role="menuitem" onClick={toggleBlock} data-testid="chat-block">
                      {active?.blocked_by_me ? '✅' : '🚫'} {t(active?.blocked_by_me ? 'chat.unblock' : 'chat.block')}
                    </button>
                    <Link to="/" role="menuitem" data-testid="chat-home-inside">🏠 {t('nav.home')}</Link>
                  </ChatHeaderMenu>
                </>
              )}
            </header>
            {currentMessageError && <p role="alert" className="text-xs text-danger p-2">{t('errors.generic')}</p>}
            {activeReady && requestId && <RequestBrief requestId={requestId} />}
            <div className="chat-body">
              {messages.length === 0 ? (
                <EmptyState title={t('chat.no_messages')} />
              ) : (
                renderedMessages.map((item, index) => {
                  if (item.__type === 'separator') {
                    return (
                      <div key={item.key} className="date-separator">
                        <span>{dayLabel(item.date, t)}</span>
                      </div>
                    );
                  }
                  return (
                    <MessageBubble
                      key={item.id}
                      message={item}
                      isMine={item.sender_id === user.id}
                      firstInRun={index === 0 || renderedMessages[index - 1].__type === 'separator' || renderedMessages[index - 1].sender_id !== item.sender_id}
                      onReply={canSend ? setReplyTo : undefined}
                      onForward={item.sender_id === user.id && isRequestOwner && item.message_type !== 'location' ? message => { setForwardNote(''); setForwarding(message); } : undefined}
                      onDelete={setDeleteCandidate}
                      onCallBack={canSend ? kind => startCall(Number(activeId), kind) : undefined}
                    />
                  );
                })
              )}
              {typingUserId && (
                <div className="typing-indicator">
                  <span /><span /><span />
                </div>
              )}
              <div ref={endRef} />
            </div>
            {canSend && replyTo && (
              <div className="reply-bar">
                <div className="reply-bar-content">
                  <div className="reply-name">↩ {replyTo.sender_name}</div>
                  <div className="reply-text">
                    {replyTo.message_type === 'location' ? '📍 ' + t('chat.shared_location')
                      : truncate(replyTo.content || '📎', 80)}
                  </div>
                </div>
                <button onClick={() => setReplyTo(null)} aria-label={t('common.close')}>✕</button>
              </div>
            )}
            {blockProblem && <p role="alert" className="text-sm text-danger p-3">{blockProblem}</p>}
            {blockDone && <p role="status" className="m-2 p-3 rounded-card bg-success-soft text-success text-sm font-bold" data-testid="block-done">{blockDone}</p>}
            {activeReady && active.can_send === false && (
              active.blocked_by_me ? (
                <div role="status" className="m-2 p-3 rounded-card bg-danger-soft text-danger text-sm flex items-center gap-2 flex-wrap" data-testid="blocked-by-me">
                  <span className="flex-1">🚫 {t('chat.you_blocked', { name: otherParticipant?.full_name || '' })}</span>
                  <button type="button" className="btn btn-primary btn-sm" onClick={toggleBlock} data-testid="unblock">✅ {t('chat.unblock')}</button>
                </div>
              ) : active.blocked_me ? (
                <p role="status" className="m-2 p-3 rounded-card bg-surface-alt text-fg-muted text-sm" data-testid="blocked-me">🚫 {t('chat.they_blocked', { name: otherParticipant?.full_name || '' })}</p>
              ) : <p role="status" className="text-sm text-muted p-3" data-testid="chat-closed-reason">{t(active.closed_reason ? `chat.closed_${active.closed_reason}` : 'chat.read_only')}</p>
            )}
            {/* "Agreed?": the requester may talk to several providers; agreeing with one
                assigns the request and closes the other conversations about it. */}
            {/* The provider's side shows nothing here: how agreeing works is told once, where they
                set up their services (AYK-128). */}
            {activeReady && requestId && active.request_status === 'open' && canSend && otherParticipant
              && Number(active.request_client_id) === Number(user.id) && (
              <div className="chat-agree" data-testid="chat-agree">
                <span>{t('chat.agreed_question', { name: otherParticipant.full_name })}</span>
                <button type="button" className="btn btn-primary btn-sm" disabled={agreeing} onClick={handleAgree}>✅ {t('request.agreed')}</button>
              </div>
            )}
            {forwarding && (
              <div className="chat-audience" role="dialog" aria-label={t('requester.forward_title')} data-testid="chat-forward">
                <span>↪ {t(siblings.length ? 'requester.forward_title' : 'requester.forward_none')}</span>
                <div className="flex gap-2 flex-wrap">
                  {siblings.length > 0 && <button type="button" className="btn btn-primary btn-sm" onClick={() => forwardTo(null)} data-testid="forward-all">
                    📣 {t('requester.forward_all', { count: siblings.length })}</button>}
                  {siblings.map(c => (
                    <button key={c.id} type="button" className="btn btn-outline btn-sm" onClick={() => forwardTo(c.id)} data-testid="forward-one">
                      👤 {c.other_user?.full_name}{c.other_user?.referral_code ? ` · ${t('requester.number')} ${c.other_user.referral_code}` : ''}</button>
                  ))}
                  <button type="button" className="btn btn-sm" onClick={() => setForwarding(null)}>{t('admin.cancel_btn')}</button>
                </div>
              </div>
            )}
            {forwardNote && <p role="status" className="chat-agree" onClick={() => setForwardNote('')}>✓ {forwardNote}</p>}
            {activeReady && canSend && (canNudge || nudgeNote) && (
              <div className="chat-agree" data-testid="chat-nudge">
                <span className="text-muted">{nudgeNote || t('chat.not_read_yet')}</span>
                {canNudge && <button type="button" className="btn btn-outline btn-sm" onClick={sendNudge} data-testid="nudge-button">🔔 {t('chat.nudge')}</button>}
              </div>
            )}
            <ChatInput
              key={sessionKey}
              sessionKey={sessionKey}
              onSend={handleSend}
              onShareLocation={canShareLocation ? handleShareLocation : undefined}
              sharingLocation={sharingLocation}
              disabled={!canSend || (realtimeMode === 'socket' && !socket)}
            />
            <p className="chat-admin-notice" data-testid="chat-admin-notice">🔒 {t('chat.admin_notice')}</p>
          </>
        )}
      </section>

      <ConfirmDialog
        open={activeReady && !!deleteCandidate}
        title={t('chat.delete_message_title')}
        body={t('chat.delete_message_body')}
        confirmLabel={t('chat.delete_message')}
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteCandidate(null)}
      />

      <style>{`
        .chat-page {
          display: grid; grid-template-columns: 340px 1fr;
          height: calc(100vh - var(--header-h)); background: var(--wa-panel);
          --wa-bg: #efeae2; --wa-out: #d9fdd3; --wa-in: #ffffff; --wa-text: #111b21; --wa-meta: #667781;
          --wa-tick: #53bdeb; --wa-accent: #00a884; --wa-chip: rgba(11,20,26,.05); --wa-wave: #b4bcc0;
          --wa-system: #ffeecd; --wa-panel: #f0f2f5; --wa-action-bg: rgba(255,255,255,.85); --wa-doodle: rgba(11,20,26,.045);
        }
        [data-theme="dark"] .chat-page {
          --wa-bg: #0b141a; --wa-out: #005c4b; --wa-in: #202c33; --wa-text: #e9edef; --wa-meta: #8696a0;
          --wa-chip: rgba(255,255,255,.06); --wa-wave: #5d6a71; --wa-system: #182229; --wa-panel: #111b21;
          --wa-action-bg: rgba(32,44,51,.85); --wa-doodle: rgba(255,255,255,.03);
        }
        .chat-sidebar {
          border-inline-end: 1px solid var(--border); background: var(--bg-card);
          display: flex; flex-direction: column; overflow: hidden;
        }
        .sidebar-header { padding: 14px 16px; border-bottom: 1px solid rgba(127,127,127,.16); }
        /* Cards and menu entries are buttons, not text links: no underline, also in high contrast. */
        .conv-item, .conv-item *, .chat-menu > a, .back-btn { text-decoration: none !important; }
        .chat-home { padding: 6px 12px; border-radius: 999px; background: var(--bg-soft); color: var(--text); font-size: 13px; font-weight: 700; text-decoration: none; white-space: nowrap; }
        .chat-home-compact { padding: 6px 9px; font-size: 16px; }
        .chat-tabs { display: flex; gap: 6px; margin-top: 8px; }
        .chat-tabs button { flex: 1; padding: 6px 8px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-card); font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
        .chat-tabs button.active { background: var(--primary); color: #fff; border-color: var(--primary); }
        .conv-list { overflow-y: auto; flex: 1; }
        /* The chats list (AYK-154): airy rows, a light line under the text only, as on phones. */
        .conv-list { padding: 4px 0; }
        .conv-item {
          display: flex; align-items: center; gap: 14px; padding: 0 16px;
          cursor: pointer; color: inherit; text-decoration: none; transition: background .15s;
        }
        .conv-item:hover { background: var(--bg-soft); text-decoration: none; }
        .conv-item.active { background: rgba(135,98,57,.08); }
        .conv-item .avatar, .conv-avatar-person { width: 52px; height: 52px; flex-shrink: 0; font-size: 18px; }
        .conv-avatar-person { display: grid; place-items: center; border-radius: 50%; background: var(--bg-soft); color: var(--text-secondary); }
        .conv-text { flex: 1; min-width: 0; padding: 14px 0; border-bottom: 1px solid rgba(127,127,127,.16); }
        .conv-item:last-child .conv-text { border-bottom: 0; }
        .conv-top, .conv-bottom { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .conv-bottom { margin-top: 3px; }
        .conv-name { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 16px; font-weight: 700; color: var(--text); }
        .conv-name-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .conv-code { flex-shrink: 0; padding: 1px 7px; border-radius: 999px; background: var(--bg-soft); font-size: 11px; font-weight: 700; color: var(--text-secondary); letter-spacing: .3px; }
        .conv-time { flex-shrink: 0; font-size: 12px; color: var(--text-secondary); }
        .conv-preview { flex: 1; min-width: 0; font-size: 14px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .conv-unread { flex-shrink: 0; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; display: grid; place-items: center; background: #25a244; color: #fff; font-size: 12px; font-weight: 800; }
        .conv-item.unread .conv-time { color: #25a244; font-weight: 700; }
        .conv-item.unread .conv-preview { color: var(--text); font-weight: 600; }
        .chat-main {
          display: flex; flex-direction: column; height: 100%; overflow: hidden;
        }
        .chat-header {
          padding: 8px 12px; background: var(--bg-card); min-height: 60px;
          border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px;
          box-shadow: 0 1px 3px rgba(15,23,42,.04);
        }
        .chat-peer { flex: 1; min-width: 0; line-height: 1.3; }
        .chat-peer-name { display: flex; align-items: center; gap: 6px; min-width: 0; }
        .chat-peer-name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; }
        .chat-peer-code { flex-shrink: 0; padding: 1px 7px; border-radius: 999px; background: var(--bg-soft); font-size: 11.5px; font-weight: 700; color: var(--text-secondary); }
        .chat-peer-status { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chat-header .chat-calls { flex-shrink: 0; }
        .chat-icon-btn {
          flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%; border: 0;
          display: grid; place-items: center; background: transparent; color: var(--text);
          font-size: 22px; font-weight: 700; cursor: pointer;
        }
        .chat-icon-btn:hover, .chat-icon-btn[aria-expanded="true"] { background: var(--wa-chip, rgba(0,0,0,.06)); }
        .chat-menu { display: flex; flex-direction: column; padding: 4px 0; }
        .chat-menu > * {
          display: flex; align-items: center; gap: 10px; padding: 11px 16px; font: inherit; font-size: 14.5px;
          color: var(--text); background: transparent; border: 0; text-align: start; text-decoration: none; cursor: pointer;
        }
        .chat-menu > *:hover { background: var(--bg-soft); }
        .chat-menu > .current { font-weight: 800; color: var(--primary); background: var(--bg-soft); }
        .chat-menu > [aria-disabled="true"] { cursor: default; color: var(--text-secondary); }
        .back-arrow { display: block; }
        [dir="rtl"] .back-arrow { transform: scaleX(-1); }
        .list-home { display: inline-flex; align-items: center; gap: 6px; font-size: 19px; font-weight: 800; color: var(--text); text-decoration: none !important; }
        .back-btn {
          display: none; background: transparent; border: 0; font-size: 20px; padding: 6px; margin-inline-start: -6px;
          color: var(--text); text-decoration: none;
        }
        .track-btn {
          width: 38px; height: 38px; border-radius: 50%;
          display: grid; place-items: center;
          background: #ecfdf5; color: #047857; font-size: 18px;
          text-decoration: none; transition: transform .15s;
        }
        .track-btn:hover { transform: scale(1.08); }
        .track-btn.track-labelled { width: auto; display: flex; align-items: center; border-radius: 999px; padding: 0 10px; gap: 4px; font-size: 12px; font-weight: 700; white-space: nowrap; }
        .chat-body {
          flex: 1; overflow-y: auto; padding: 10px 4% 12px;
          background-color: var(--wa-bg);
          background-image: radial-gradient(var(--wa-doodle) 1.2px, transparent 1.3px), radial-gradient(var(--wa-doodle) 1.2px, transparent 1.3px);
          background-size: 22px 22px; background-position: 0 0, 11px 11px;
        }
        .chat-header { background: var(--wa-panel) !important; }
.chat-audience { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
          margin: 0 10px 6px; padding: 10px 12px; border-radius: 12px; background: var(--bg-soft); border: 1px solid var(--primary); font-size: 13px; font-weight: 600; }
        .chat-agree { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
          margin: 0 10px 6px; padding: 8px 12px; border-radius: 12px; background: var(--bg-soft); font-size: 13px; }
        .chat-admin-notice {
          margin: 0; padding: 2px 10px 4px; text-align: center; font-size: 10px; line-height: 1.4;
          color: var(--wa-meta); background: var(--wa-panel);
        }
        .date-separator {
          text-align: center; margin: 16px 0 8px;
        }
        .date-separator { position: sticky; top: 0; z-index: 2; }
        .date-separator span {
          display: inline-block; background: var(--wa-in);
          padding: 5px 12px; border-radius: 8px;
          font-size: 12px; color: var(--wa-meta);
          box-shadow: 0 1px .5px rgba(11,20,26,.13);
        }
        .typing-indicator {
          display: inline-flex; gap: 4px; padding: 8px 14px;
          background: var(--wa-in); border-radius: 8px; margin: 4px 6px;
          box-shadow: 0 1px 1px rgba(0,0,0,.06);
        }
        .typing-indicator span {
          width: 6px; height: 6px; border-radius: 50%;
          background: #94a3b8; animation: bounce 1.2s infinite;
        }
        .typing-indicator span:nth-child(2) { animation-delay: .15s; }
        .typing-indicator span:nth-child(3) { animation-delay: .3s; }
        @keyframes bounce {
          0%, 60%, 100% { opacity: .3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
        .reply-bar {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 12px; background: #f1f5f9;
          border-top: 1px solid var(--border);
        }
        .reply-bar-content {
          flex: 1; min-width: 0; padding: 6px 10px;
          border-inline-start: 3px solid #876239;
          background: #fff; border-radius: 8px;
        }
        .reply-bar-content .reply-name { font-size: 12px; font-weight: 700; color: #876239; }
        .reply-bar-content .reply-text { font-size: 12.5px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .reply-bar button { background: transparent; border: 0; font-size: 16px; cursor: pointer; color: #64748b; }
        @media (max-width: 768px) {
          .chat-page { grid-template-columns: 1fr; }
          .chat-sidebar.hide-on-mobile, .chat-main.hide-on-mobile { display: none; }
          .back-btn { display: inline-block; }
        }
      `}</style>
    </div>
  );
}
