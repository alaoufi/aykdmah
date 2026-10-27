import { useEffect, useRef, useState } from 'react';
import { getToken, TOKEN_CHANGE_EVENT } from '../services/api';
import { LocalLanguageSession } from '../utils/localLanguageSession.js';

let active = null;

function acquire(key, token, invalidate) {
  if (active && (active.key !== key || active.token !== token || !active.session.current())) {
    const previous = active;
    active = null;
    previous.session.destroy();
    for (const listener of previous.listeners) listener();
  }
  if (!active) {
    const state = { key, token, listeners: new Set(), session: null };
    state.session = new LocalLanguageSession({
      workerFactory: () => new Worker(new URL('../workers/localLanguage.worker.js', import.meta.url), { type: 'module' }),
      isCurrent: () => active === state && getToken() === state.token,
    });
    active = state;
  }
  const state = active;
  state.listeners.add(invalidate);
  return {
    session: state.session,
    release() {
      state.listeners.delete(invalidate);
      if (!state.listeners.size) {
        state.session.destroy();
        if (active === state) active = null;
      }
    },
  };
}

export default function useLocalLanguageSession(sessionKey, onInvalidate) {
  const sessionRef = useRef(null);
  const callback = useRef(onInvalidate);
  callback.current = onInvalidate;
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const invalidate = () => { callback.current?.(); setEpoch(value => value + 1); };
    const handle = acquire(String(sessionKey || ''), getToken(), invalidate);
    sessionRef.current = handle.session;
    const tokenChanged = () => {
      if (handle.session.current()) return;
      handle.session.destroy();
      invalidate();
    };
    window.addEventListener(TOKEN_CHANGE_EVENT, tokenChanged);
    return () => {
      window.removeEventListener(TOKEN_CHANGE_EVENT, tokenChanged);
      sessionRef.current = null;
      handle.release();
    };
  }, [sessionKey, epoch]);
  return sessionRef;
}
