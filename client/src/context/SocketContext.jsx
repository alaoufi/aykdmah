import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getToken } from '../services/api';
import { setLiveSocket } from '../utils/socketBus';

const SocketContext = createContext(null);
const realtimeMode = import.meta.env.VITE_REALTIME_MODE === 'polling' ? 'polling' : 'socket';

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user || realtimeMode === 'polling') {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
      return;
    }

    const url = import.meta.env.VITE_API_URL || window.location.origin;
    const token = getToken();
    if (!token) return;

    const sock = io(url, {
      auth: { token },
      transports: ['websocket', 'polling'],
      // Never give up (a deploy, a network change, a phone asleep); retry at most every 5 s.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    sock.on('connect', () => setConnected(true));
    sock.on('disconnect', () => setConnected(false));
    sock.on('connect_error', () => setConnected(false));

    // Back on screen or back online: reconnect now instead of waiting for the next retry.
    const wake = () => { if (!document.hidden && !sock.connected) sock.connect(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);

    socketRef.current = sock;
    setLiveSocket(sock);

    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      setLiveSocket(null);
      sock.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, socketRef, realtimeMode }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
