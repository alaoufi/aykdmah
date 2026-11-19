export function guidePageIndex(value, count) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.max(0, Math.min(Math.max(0, count - 1), n)) : 0;
}

export function guidePageForHash(hash, ids) {
  const value = String(hash || '').replace(/^#/, '');
  const index = ids.findIndex(id => value === id || value.startsWith(id + '-'));
  return index < 0 ? null : index;
}
