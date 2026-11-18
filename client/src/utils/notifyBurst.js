// Several notifications in the same moment become one announcement (AYK-259): three people
// writing at once used to mean three banners and three chimes. Whatever arrives within `wait`
// milliseconds of the first is handed to onFlush together, in arrival order.
export function createBurst(onFlush, { wait = 400, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let pending = [], timer = null;
  const flush = () => {
    timer = null;
    const batch = pending;
    pending = [];
    if (batch.length) onFlush(batch);
  };
  return {
    add(item) { pending.push(item); if (timer === null) timer = setTimer(flush, wait); },
    stop() { if (timer !== null) clearTimer(timer); timer = null; pending = []; },
  };
}

// What one banner says for a batch: the notification itself when alone, else a count
// ("3 new messages" when every one is a chat message, "3 new notifications" otherwise).
export function burstSummary(batch) {
  if (batch.length === 1) return { single: batch[0] };
  const allMessages = batch.every(n => n?.type === 'new_message');
  return { key: allMessages ? 'notification.many_messages' : 'notification.many_new', count: batch.length };
}
