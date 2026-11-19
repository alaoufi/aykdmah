import { getToken } from '../services/api';

let generation = 0;
const active = new Set();
const cancelled = () => Object.assign(new Error('Cancelled'), { cancelled: true });
const currentRoute = () => typeof window === 'undefined' ? '' : window.location.pathname + window.location.search + window.location.hash;

// AppDialogHost owns the router/session lifetime. Leaving then returning to the
// same URL cannot revive a lookup or approval belonging to the previous page.
export function invalidateContactIntents() {
  generation++;
  for (const controller of active) controller.abort();
  active.clear();
}

export async function withContactIntent(run) {
  const controller = new AbortController();
  active.add(controller);
  const epoch = generation, token = getToken(), route = currentRoute();
  const isCurrent = () => !controller.signal.aborted && epoch === generation && token === getToken() && route === currentRoute();
  const assertCurrent = () => { if (!isCurrent()) throw cancelled(); };
  const config = () => { assertCurrent(); return { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } }; };
  try { const result = await run({ isCurrent, assertCurrent, config }); assertCurrent();return result; }
  catch (error) { if (!isCurrent()) throw cancelled(); throw error; }
  finally { active.delete(controller); }
}
