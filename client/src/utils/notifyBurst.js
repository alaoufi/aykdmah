// Several notifications in the same moment become one announcement (AYK-259): three people
// writing at once used to mean three banners and three chimes. Whatever arrives within `wait`
// milliseconds of the first is handed to onFlush together, in arrival order. After an
// announcement the next one comes no sooner than `quiet` milliseconds later, so a stream of
// 20 messages over a few seconds is a couple of banners, not a dozen.
export function createBurst(onFlush, { wait = 400, quiet = 3000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let pending = [], timer = null, resting = false;
  const flush = () => {
    timer = null;
    const batch = pending;
    pending = [];
    if (!batch.length) { resting = false; return; }
    onFlush(batch);
    resting = true;
    timer = setTimer(flush, quiet); // collects what arrives meanwhile; an empty round ends the rest
  };
  return {
    add(item) { pending.push(item); if (timer === null) timer = setTimer(flush, resting ? quiet : wait); },
    stop() { if (timer !== null) clearTimer(timer); timer = null; pending = []; resting = false; },
  };
}

// What one banner says for a batch: the notification itself when alone, else a count. Arabic
// counts differently for 2, for 3–10 and for 11 and more, so each has its own text.
export function burstSummary(batch) {
  if (batch.length === 1) return { single: batch[0] };
  const kind = batch.every(n => n?.type === 'new_message') ? 'messages' : 'new';
  const size = batch.length === 2 ? 'pair' : batch.length <= 10 ? 'few' : 'lots';
  return { key: `notification.${size}_${kind}`, count: batch.length };
}
