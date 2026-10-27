/** Fetch sequentially, pause hidden tabs, and ignore results from invalidated runs. */
export function createPollingLoop(load, {
  intervalMs = 10000,
  onResult = () => {},
  onError = () => {},
  documentRef = globalThis.document,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  let stopped = false;
  let running = false;
  let queued = false;
  let generation = 0;
  let timer;
  let runningTask;

  const visible = () => !documentRef || documentRef.visibilityState !== 'hidden';
  const clear = () => { clearTimer(timer); timer = undefined; };
  const refresh = () => {
    if (stopped || !visible()) return runningTask;
    clear();
    generation += 1;
    if (running) { queued = true; return runningTask; }
    runningTask = run();
    return runningTask;
  };
  const run = async () => {
    if (stopped || !visible() || running) return;
    running = true;
    queued = false;
    const version = generation;
    try {
      const value = await load();
      if (!stopped && visible() && version === generation) onResult(value);
    } catch (error) {
      if (!stopped && visible() && version === generation) onError(error);
    } finally {
      running = false;
      if (!stopped && visible()) {
        if (queued) runningTask = run();
        else if (intervalMs != null) timer = setTimer(refresh, intervalMs);
      }
    }
  };
  const onVisibility = () => {
    clear();
    generation += 1;
    queued = false;
    if (visible()) refresh();
  };
  documentRef?.addEventListener('visibilitychange', onVisibility);
  refresh();
  return {
    refresh,
    stop() {
      stopped = true;
      generation += 1;
      queued = false;
      clear();
      documentRef?.removeEventListener('visibilitychange', onVisibility);
      return runningTask;
    },
  };
}
