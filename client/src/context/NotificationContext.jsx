import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../services/chatService';
import { useTranslation } from 'react-i18next';
import { localizedNotification } from '../data/notificationLabels';

import { createPollingLoop } from '../utils/polling';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const { socket, realtimeMode } = useSocket();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState([]);

  const pollRef = useRef(null);
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;
  const toastTimers = useRef(new Set());

  const showToast = useCallback((message, notification = null) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, notification }]);
    const timer = setTimeout(() => {
      toastTimers.current.delete(timer);
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
    toastTimers.current.add(timer);
  }, []);

  const refresh = useCallback(() => pollRef.current?.refresh(), []);

  useEffect(() => {
    setItems([]);
    setUnread(0);
    setToasts([]);
    if (!user?.id) return;
    let seenIds = null;
    const poll = createPollingLoop(() => listNotifications({ limit: 30 }), {
      intervalMs: realtimeMode === 'polling' ? 10000 : null,
      onResult: (res) => {
        const next = res.data || [];
        if (seenIds && realtimeMode === 'polling') {
          next.filter(n => !seenIds.has(n.id) && !n.is_read).forEach(n => showToast('', n));
        }
        seenIds = new Set(next.map(n => n.id));
        setItems(next);
        setUnread(Number(res.meta?.unread) || 0);
      },
    });
    pollRef.current = poll;
    return () => {
      poll.stop();
      pollRef.current = null;
      toastTimers.current.forEach(clearTimeout);
      toastTimers.current.clear();
    };
  }, [user?.id, realtimeMode, showToast]);

  useEffect(() => {
    if (!socket) return;
    const onNotif = (notif) => {
      refresh();
      showToast('', notif);
    };
    socket.on('notification:new', onNotif);
    return () => { socket.off('notification:new', onNotif); };
  }, [socket, refresh, showToast]);

  const markRead = async (id) => {
    const userId = user?.id;
    await markNotificationRead(id);
    if (userId !== userIdRef.current) return;
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    setUnread(prev => Math.max(0, prev - 1));
    refresh();
  };

  const markAllRead = async () => {
    const userId = user?.id;
    await markAllNotificationsRead();
    if (userId !== userIdRef.current) return;
    setItems(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setUnread(0);
    refresh();
  };

  return (
    <NotificationContext.Provider value={{ items, unread, toasts, refresh, markRead, markAllRead, showToast }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className="toast">{t.notification ? localizedNotification(t.notification, i18n.language).title : t.message}</div>)}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
