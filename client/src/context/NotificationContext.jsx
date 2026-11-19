import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { listNotifications, markNotificationRead, markAllNotificationsRead, getChatUnread } from '../services/chatService';
import { useTranslation } from 'react-i18next';
import { localizedNotification } from '../data/notificationLabels';

import { createPollingLoop } from '../utils/polling';
import { chime } from '../utils/ringtone';
import { createBurst, burstSummary } from '../utils/notifyBurst';
import { supportUnread } from '../services/supportService';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { socket, realtimeMode, connected } = useSocket();
  // While the live connection is down, polling also announces new notifications (AYK-056).
  const connectedRef = useRef(connected);
  connectedRef.current = connected;
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  // Unread chat messages, shown on "Chats"; the notification count stays on the bell.
  const [chatUnread, setChatUnread] = useState(0);
  // Unread replies from the administration (AYK-046), shown in the menu.
  const [supportCount, setSupportCount] = useState(0);
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

  // Notifications that arrive in the same moment are announced once: one banner ("3 new
  // messages") and one chime instead of three of each (AYK-259).
  const burstRef = useRef(null);
  if (!burstRef.current) {
    burstRef.current = createBurst(batch => {
      const summary = burstSummary(batch);
      if (summary.single) announceRef.current('', summary.single);
      else announceRef.current(tRef.current(summary.key, { count: summary.count }));
      chime();
    });
  }
  const announceRef = useRef(showToast);
  announceRef.current = showToast;
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => () => burstRef.current.stop(), []);
  const announce = useCallback(notification => burstRef.current.add(notification), []);

  const refresh = useCallback(() => pollRef.current?.refresh(), []);
  const lastLoadRef = useRef(0);

  useEffect(() => {
    setItems([]);
    setUnread(0);
    setChatUnread(0);
    setSupportCount(0);
    setToasts([]);
    if (!user?.id) return;
    let seenIds = null;
    const poll = createPollingLoop(() => (lastLoadRef.current = Date.now()) && Promise.all([listNotifications({ limit: 30 }), getChatUnread().catch(() => null), supportUnread().catch(() => null)])
      .then(([res, chats, support]) => { if (chats !== null) setChatUnread(chats); if (support !== null) setSupportCount(support); return res; }), {
      // AYK-252: with the live connection up, new notifications and messages arrive through it at
      // once, so asking the server every 15 seconds only loads it (three requests each time, from
      // every open app). Connected: a safety check every 90–120 seconds. Not connected: as before.
      intervalMs: () => (realtimeMode === 'polling' ? 10000 : connectedRef.current ? 90000 + Math.floor(Math.random() * 30000) : 15000),
      onResult: (res) => {
        const next = res.data || [];
        if (seenIds && (realtimeMode === 'polling' || !connectedRef.current)) {
          const fresh = next.filter(n => !seenIds.has(n.id) && !n.is_read);
          fresh.forEach(announce);
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
  }, [user?.id, realtimeMode, showToast, announce]);

  // Whatever arrived while the live connection was down is fetched the moment it is back.
  // Not when the first load has only just gone out (AYK-282: start-up asked for everything twice).
  useEffect(() => { if (connected && Date.now() - lastLoadRef.current > 5000) refresh(); }, [connected, refresh]);

  useEffect(() => {
    if (!socket) return;
    const onNotif = (notif) => {
      refresh();
      // A message in the chat already open on screen (AYK-231): it is there with its own tone,
      // so no second banner and sound.
      if (notif?.link && document.visibilityState === 'visible' && window.location.pathname === notif.link) return;
      announce(notif);
    };
    socket.on('notification:new', onNotif);
    return () => { socket.off('notification:new', onNotif); };
  }, [socket, refresh, announce]);

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
    <NotificationContext.Provider value={{ items, unread, chatUnread, supportCount, toasts, refresh, markRead, markAllRead, showToast }}>
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
