import { useEffect, useState } from 'react';
import api from '../services/api';

// AYK-410: the administration's saved order applied to the default menu (adminNav.js).
// layout = { groups: [{ key, title, items: [to...] }], hidden: [to...] }
// - groups come in the saved order, with the saved title (or their own label);
// - each page sits where it was put; pages unknown to the saved order (added later) stay in
//   their own group (or the last one), so nothing is ever lost;
// - hidden pages are left out; an emptied group is left out.
export function applyMenuLayout(defaults, layout) {
  if (!layout || !Array.isArray(layout.groups) || !layout.groups.length) return defaults;
  const byTo = new Map(defaults.flatMap(g => g.items.map(it => [it.to, { item: it, home: g.label }])));
  const placed = new Set();
  const groups = layout.groups.map(g => {
    const own = defaults.find(d => d.label === g.key);
    const items = (g.items || []).map(to => byTo.get(to)?.item).filter(Boolean);
    items.forEach(it => placed.add(it.to));
    return { key: g.key, label: own?.label || null, title: g.title || null, items };
  });
  for (const d of defaults) {
    for (const it of d.items) {
      if (placed.has(it.to)) continue;
      const home = groups.find(g => g.key === d.label) || groups[groups.length - 1];
      home.items.push(it);
    }
  }
  const hidden = new Set(layout.hidden || []);
  return groups.map(g => ({ ...g, items: g.items.filter(it => !hidden.has(it.to)) })).filter(g => g.items.length);
}

// The layout as a plain object from groups shaped like applyMenuLayout's result.
export function toLayout(groups, hidden) {
  return { groups: groups.map(g => ({ key: g.key || g.label, title: g.title || null, items: g.items.map(it => it.to) })), hidden: [...hidden] };
}

let cached;
let inflight = null;
const listeners = new Set();
export function loadMenuLayout(force = false) {
  if (cached !== undefined && !force) return Promise.resolve(cached);
  if (!inflight || force) {
    inflight = api.get('/admin/menu-layout').then(({ data }) => { cached = data.data || null; listeners.forEach(fn => fn(cached)); return cached; })
      .catch(() => { cached = null; return null; }).finally(() => { inflight = null; });
  }
  return inflight;
}
export function setMenuLayoutCache(layout) { cached = layout || null; listeners.forEach(fn => fn(cached)); }

export function useMenuLayout() {
  const [layout, setLayout] = useState(cached === undefined ? null : cached);
  useEffect(() => {
    listeners.add(setLayout);
    loadMenuLayout().then(setLayout);
    return () => { listeners.delete(setLayout); };
  }, []);
  return layout;
}
