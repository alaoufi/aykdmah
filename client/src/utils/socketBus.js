// The live socket for code that must not load socket.io-client itself (AYK-078):
// SocketContext hands its socket here, and listeners follow it across reconnections.
let current = null;
const listeners = new Set();

export function setLiveSocket(sock) {
  if (current) listeners.forEach(([event, fn]) => current.off(event, fn));
  current = sock;
  if (current) listeners.forEach(([event, fn]) => current.on(event, fn));
}

export function onLive(event, fn) {
  const entry = [event, fn];
  listeners.add(entry);
  current?.on(event, fn);
  return () => { listeners.delete(entry); current?.off(event, fn); };
}
