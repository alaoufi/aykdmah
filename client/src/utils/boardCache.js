// AYK-449 (the owner: «مع الخيار يتأخر ثواني، لو سرعته أفضل»). Ticking a box no longer waits for the
// server: the list already on screen carries, for each row, whether it is in my profession and in my
// area (board_profession / board_area), so the narrower list shows at once; and every list asked for
// is kept for a few minutes, so going back to one shows it at once too. The server's answer then
// replaces it quietly (it may hold rows beyond the first page).
const kept = new Map();
const TTL = 5 * 60 * 1000;

export const boardKey = (kind, params) => `${kind}:${JSON.stringify(Object.keys(params).sort().map(key => [key, params[key]]))}`;

export function recall(key) {
  const hit = kept.get(key);
  return hit && Date.now() - hit.at < TTL ? hit.value : null;
}

export function keep(key, value) {
  kept.set(key, { value, at: Date.now() });
  if (kept.size > 60) kept.delete(kept.keys().next().value);
}

// Rows of a wider list that the boxes ticked keep.
export function narrow(rows, { prof = false, area = false } = {}) {
  return (rows || []).filter(row => (!prof || row.board_profession) && (!area || row.board_area));
}
