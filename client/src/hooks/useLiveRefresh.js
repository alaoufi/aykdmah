import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';

// Lists that refresh on their own (AYK-078): on the given socket events, on return to the
// app, and every `everyMs` while on screen. Returns [tick, quiet]: `quiet` is true for these
// background refreshes, so the page reloads its data without a loading flash.
export default function useLiveRefresh(events = [], everyMs = 60000) {
  const { socket } = useSocket();
  const [tick, setTick] = useState(0);
  const seen = useRef(0);
  const key = events.join('|');
  useEffect(() => {
    let timer = null;
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => setTick(v => v + 1), 1200); };
    const onVisible = () => { if (document.visibilityState === 'visible') bump(); };
    const names = key ? key.split('|') : [];
    names.forEach(name => socket?.on(name, bump));
    document.addEventListener('visibilitychange', onVisible);
    const every = everyMs ? setInterval(() => { if (document.visibilityState === 'visible') bump(); }, everyMs) : null;
    return () => {
      clearTimeout(timer); if (every) clearInterval(every);
      names.forEach(name => socket?.off(name, bump));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [socket, key, everyMs]);
  const quiet = tick !== seen.current;
  seen.current = tick;
  return [tick, quiet];
}
