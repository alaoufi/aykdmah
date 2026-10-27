import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  listConversations, getConversation, getMessages, sendMessage, markRead,
  deleteMessage, sendLocationMessage,
} from '../services/chatService';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import MessageBubble from '../components/chat/MessageBubble';
import ChatInput from '../components/chat/ChatInput';
import LocalMessageTranslation from '../components/chat/LocalMessageTranslation';
import Avatar from '../components/common/Avatar';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { LoadingState, EmptyState } from '../components/common/Spinner';
import { formatRelativeTime, truncate, dayLabel, isSameDay } from '../utils/formatters';
import { getCurrentPosition } from '../utils/geo';
import { createPollingLoop } from '../utils/polling';

export default function ChatPage() {
  const { t } = useTranslation();
  const { id: activeId } = useParams();
  const { user } = useAuth();
  const { socket, realtimeMode } = useSocket();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState([]);
  const [listOwnerId, setListOwnerId] = useState(null);
  const [active, setActive] = useState(null);
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
        intervalMs: realtimeMode === 'polling' ? 5000 : null,
        onResult: ([conv, msgs]) => {
          setActive(conv);
          setActiveScope(scope);
          setMessages(msgs || []);
          setLoadingMsgs(false);
          setMessageError(false);
          setMessageErrorScope(null);
          if (!markingRead && msgs?.some(m => m.sender_id !== user.id && !m.is_read)) {
            markingRead = true;
            markRead(activeId).then(loadList).catch(() => {}).finally(() => { markingRead = false; });
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
        markRead(activeId).catch(() => {});
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
    return () => {
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
      setReplyTo(null);
      loadList();
      return true;
    } catch (err) {
      if (scopeRef.current === scope) alert(t('errors.generic'));
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
      if (scopeRef.current === scope) alert(t('location.geolocation_failed'));
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

  return (
    <div className="chat-page">
      <aside className={`chat-sidebar ${activeId ? 'hide-on-mobile' : ''}`}>
        <div className="sidebar-header">
          <h3>{t('chat.title')}</h3>
          {listReady && listError && <p role="alert" className="text-xs text-danger">{t('errors.generic')}</p>}
        </div>
        {loadingList || !listReady ? <LoadingState /> :
         conversations.length === 0 ? <EmptyState title={t('chat.no_conversations')} /> :
         (
          <div className="conv-list">
            {conversations.map(c => {
              const other = typeof c.other_user === 'string' ? JSON.parse(c.other_user) : c.other_user;
              const last = typeof c.last_message === 'string' ? JSON.parse(c.last_message) : c.last_message;
              const isActive = Number(activeId) === c.id;
              const lastPreview = last
                ? last.message_type === 'location' ? '📍 ' + t('chat.shared_location')
                  : last.message_type === 'voice' ? '🎙️ ' + t('chat.voice_message')
                  : last.message_type === 'image' ? '🖼️ ' + (last.content || t('chat.image'))
                  : last.content || '📎'
                : t('chat.no_messages');
              return (
                <Link key={c.id} to={`/chat/${c.id}`} className={`conv-item ${isActive ? 'active' : ''}`}>
                  <Avatar src={other?.avatar} name={other?.full_name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex justify-between">
                      <strong>{other?.full_name || '—'}</strong>
                      <span className="text-xs text-muted">{last ? formatRelativeTime(last.created_at) : ''}</span>
                    </div>
                    <div className="text-sm text-muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {truncate(lastPreview, 50)}
                    </div>
                  </div>
                  {c.unread_count > 0 && <span className="badge badge-primary">{c.unread_count}</span>}
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
              <Link to="/chat" className="back-btn">←</Link>
              {otherParticipant && (
                <>
                  <Avatar src={otherParticipant.avatar} name={otherParticipant.full_name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{otherParticipant.full_name}</strong>
                    <div className="text-xs text-muted">
                      {realtimeMode === 'polling'
                        ? t('chat.periodic_updates', { defaultValue: 'تُحدّث الرسائل كل 5 ثوانٍ' })
                        : otherParticipant.is_online
                        ? '🟢 ' + t('chat.online')
                        : otherParticipant.last_seen_at
                          ? `${t('chat.last_seen')} ${formatRelativeTime(otherParticipant.last_seen_at)}`
                          : ''}
                    </div>
                  </div>
                  {requestId && (
                    <Link
                      to={`/requests/${requestId}/track`}
                      className="track-btn"
                      aria-label={t('tracking.title')}
                      title={t('tracking.title')}
                    >
                      🗺️
                    </Link>
                  )}
                </>
              )}
            </header>
            {currentMessageError && <p role="alert" className="text-xs text-danger p-2">{t('errors.generic')}</p>}
            <div className="chat-body">
              {messages.length === 0 ? (
                <EmptyState title={t('chat.no_messages')} />
              ) : (
                renderedMessages.map((item) => {
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
                      onReply={canSend ? setReplyTo : undefined}
                      onDelete={setDeleteCandidate}
                      renderTranslation={message => <LocalMessageTranslation message={message} sessionKey={sessionKey} />}
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
            {activeReady && active.can_send === false && (
              <p role="status" className="text-sm text-muted p-3">{t('chat.read_only')}</p>
            )}
            <ChatInput
              key={sessionKey}
              sessionKey={sessionKey}
              onSend={handleSend}
              onShareLocation={canShareLocation ? handleShareLocation : undefined}
              sharingLocation={sharingLocation}
              disabled={!canSend || (realtimeMode === 'socket' && !socket)}
            />
          </>
        )}
      </section>

      <ConfirmDialog
        open={activeReady && !!deleteCandidate}
        title={t('chat.delete_message_title')}
        body={t('chat.delete_message_body')}
        confirmLabel={t('admin.delete')}
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteCandidate(null)}
      />

      <style>{`
        .chat-page {
          display: grid; grid-template-columns: 320px 1fr;
          height: calc(100vh - var(--header-h)); background: #f1f5f9;
        }
        .chat-sidebar {
          border-inline-end: 1px solid var(--border); background: var(--bg-card);
          display: flex; flex-direction: column; overflow: hidden;
        }
        .sidebar-header { padding: 16px; border-bottom: 1px solid var(--border); }
        .conv-list { overflow-y: auto; flex: 1; }
        .conv-item {
          display: flex; align-items: center; gap: 12px; padding: 14px 16px;
          border-bottom: 1px solid var(--border); cursor: pointer;
          color: inherit; text-decoration: none;
        }
        .conv-item:hover { background: var(--bg-soft); text-decoration: none; }
        .conv-item.active { background: rgba(135,98,57,.08); }
        .chat-main {
          display: flex; flex-direction: column; height: 100%; overflow: hidden;
        }
        .chat-header {
          padding: 10px 16px; background: var(--bg-card);
          border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px;
          box-shadow: 0 1px 3px rgba(15,23,42,.04);
        }
        .back-btn {
          display: none; background: transparent; border: 0; font-size: 20px;
          color: var(--text); text-decoration: none;
        }
        .track-btn {
          width: 38px; height: 38px; border-radius: 50%;
          display: grid; place-items: center;
          background: #ecfdf5; color: #047857; font-size: 18px;
          text-decoration: none; transition: transform .15s;
        }
        .track-btn:hover { transform: scale(1.08); }
        .chat-body {
          flex: 1; overflow-y: auto; padding: 16px;
          background-image: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
        }
        .date-separator {
          text-align: center; margin: 16px 0 8px;
        }
        .date-separator span {
          display: inline-block; background: rgba(255,255,255,.85);
          padding: 4px 12px; border-radius: 999px;
          font-size: 11px; color: #64748b; font-weight: 600;
          box-shadow: 0 1px 2px rgba(15,23,42,.05);
        }
        .typing-indicator {
          display: inline-flex; gap: 4px; padding: 8px 14px;
          background: #fff; border-radius: 14px; margin: 4px 0;
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
