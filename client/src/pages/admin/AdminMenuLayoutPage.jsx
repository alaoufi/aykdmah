import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import { useAdminConfirmation } from '../../components/admin/confirmAdminChange';
import api, { apiError } from '../../services/api';
import { NAV_GROUPS } from '../../layouts/adminNav';
import { applyMenuLayout, toLayout, loadMenuLayout, setMenuLayoutCache } from '../../layouts/menuLayout';

// AYK-410 (the owner: «ابنِ صفحة ترتيب القوائم»). The administration orders its own menu: drag the
// groups and the pages (by mouse, by touch, or with ▲▼), move a page to another group, rename a
// group, add a group, hide a page. Saved at once for every administrator, with no release.
const LOCKED = new Set(['/admin', '/admin/menu-layout']);

function Handle(props) {
  return <button type="button" {...props} className="w-8 h-8 shrink-0 grid place-items-center rounded-card bg-slate-100 text-slate-500 cursor-grab touch-none" aria-label="اسحب لتغيير الترتيب">⠿</button>;
}

function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 10 : undefined, position: 'relative' }}>
      {children(<Handle {...attributes} {...listeners} />)}
    </div>
  );
}

export default function AdminMenuLayoutPage() {
  const { t } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const [groups, setGroups] = useState(null);
  const [hidden, setHidden] = useState(new Set());
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const start = layout => {
    // Hidden pages are shown here too (greyed), so they can be shown again.
    const all = applyMenuLayout(NAV_GROUPS, layout ? { ...layout, hidden: [] } : null).map((g, i) => ({ ...g, key: g.key || g.label || `g${i}` }));
    setGroups(all); setHidden(new Set(layout?.hidden || [])); setDirty(false);
  };
  useEffect(() => { loadMenuLayout(true).then(start); }, []);
  const change = fn => { setGroups(fn); setDirty(true); setMsg(null); };

  const titleOf = g => g.title || (g.label ? t(g.label) : '');
  const moveGroup = (i, d) => change(gs => (i + d < 0 || i + d >= gs.length ? gs : arrayMove(gs, i, i + d)));
  const moveItem = (gi, ii, d) => change(gs => gs.map((g, k) => (k !== gi || ii + d < 0 || ii + d >= g.items.length ? g : { ...g, items: arrayMove(g.items, ii, ii + d) })));
  const sendTo = (gi, ii, target) => change(gs => {
    const item = gs[gi].items[ii];
    return gs.map((g, k) => (k === gi ? { ...g, items: g.items.filter((_, j) => j !== ii) } : g.key === target ? { ...g, items: [...g.items, item] } : g));
  });
  const rename = (gi, title) => change(gs => gs.map((g, k) => (k === gi ? { ...g, title } : g)));
  const addGroup = () => change(gs => [...gs, { key: `custom-${Date.now()}`, label: null, title: 'مجموعة جديدة', items: [] }]);
  const toggleHidden = to => { if (LOCKED.has(to)) return; setHidden(h => { const n = new Set(h); n.has(to) ? n.delete(to) : n.add(to); return n; }); setDirty(true); setMsg(null); };
  const onGroupDrag = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    change(gs => arrayMove(gs, gs.findIndex(g => g.key === active.id), gs.findIndex(g => g.key === over.id)));
  };
  const onItemDrag = gi => ({ active, over }) => {
    if (!over || active.id === over.id) return;
    change(gs => gs.map((g, k) => (k !== gi ? g : { ...g, items: arrayMove(g.items, g.items.findIndex(it => it.to === active.id), g.items.findIndex(it => it.to === over.id)) })));
  };

  // Advice from the menu rules (code/menus in the shared library): 2 to 7 pages per group.
  const advice = (groups || []).flatMap(g => {
    const shown = g.items.filter(it => !hidden.has(it.to)).length;
    const name = titleOf(g) || 'بلا اسم';
    if (shown === 0) return [`«${name}» فارغة، وستُحذف عند الحفظ.`];
    if (shown === 1) return [`«${name}» فيها صفحة واحدة: الأفضل ضمّها لمجموعة قريبة.`];
    if (shown > 7) return [`«${name}» فيها ${shown} صفحات: الأفضل تقسيمها.`];
    return [];
  }).concat((groups || []).some(g => !titleOf(g).trim()) ? ['مجموعة بلا اسم: اكتب اسمها.'] : []);

  const save = async () => {
    if ((groups || []).some(g => g.items.length && !titleOf(g).trim())) { setMsg({ bad: true, text: 'لم يُحفظ: اكتب اسم كل مجموعة.' }); return; }
    if (!(await confirmAdminChange(t))) return;
    setSaving(true);
    try {
      const keep = groups.filter(g => g.items.length);
      const body = toLayout(keep.map(g => ({ ...g, title: g.label && titleOf({ label: g.label }) === g.title ? null : g.title })), hidden);
      const { data } = await api.put('/admin/menu-layout', body);
      setMenuLayoutCache(data.data); start(data.data);
      setMsg({ text: '✅ تم الحفظ. القائمة الجانبية تغيّرت الآن لكل أعضاء الإدارة.' });
    } catch (e) { setMsg({ bad: true, text: `لم يُحفظ: ${apiError(e)}` }); } finally { setSaving(false); }
  };
  const reset = async () => {
    if (!(await confirmAdminChange(t))) return;
    try {
      await api.put('/admin/menu-layout', { reset: true });
      setMenuLayoutCache(null); start(null);
      setMsg({ text: '✅ رجع الترتيب الأصلي.' });
    } catch (e) { setMsg({ bad: true, text: apiError(e) }); }
  };

  if (!groups) return <div className="h-40 rounded-card bg-slate-100 animate-pulse" />;
  return (
    <div className="space-y-4 max-w-3xl" data-testid="menu-layout">
      <AdminPageHeader title={t('admin.menu_layout.title')} />
      <div className="rounded-card bg-slate-50 border border-slate-200 p-3 text-[12.5px] text-slate-700 leading-relaxed">
        اسحب المجموعة أو الصفحة من ⠿ لتغيير مكانها (أو استعمل ▲▼). انقل الصفحة لمجموعة أخرى من «نقل إلى»، وغيّر اسم المجموعة بالكتابة فيه، وأخفِ صفحة بـ 👁.
        بعد «حفظ» تتغير القائمة الجانبية فورًا لكل أعضاء الإدارة. الصفحات التي تُضاف للموقع لاحقًا تظهر وحدها في مجموعتها.
      </div>
      {msg && <div className={`px-3 py-2 rounded-card text-[13px] font-semibold ${msg.bad ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`} role="status" data-testid="menu-layout-msg">{msg.text}</div>}
      {advice.length > 0 && <ul className="m-0 ps-5 text-[12.5px] text-amber-800 bg-amber-50 rounded-card py-2 pe-3 space-y-0.5" data-testid="menu-layout-advice">{advice.map(a => <li key={a}>{a}</li>)}</ul>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onGroupDrag}>
        <SortableContext items={groups.map(g => g.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {groups.map((g, gi) => (
              <SortableRow key={g.key} id={g.key}>{handle => (
                <section className="rounded-card border-2 border-slate-200 bg-white p-3 space-y-2" data-testid="menu-group">
                  <div className="flex items-center gap-2">
                    {handle}
                    <input className="flex-1 min-w-0 px-3 py-2 rounded-card border border-slate-200 bg-slate-50 font-bold text-[14px]" value={titleOf(g)} onChange={e => rename(gi, e.target.value)} aria-label="اسم المجموعة" data-testid="menu-group-title" />
                    <button type="button" onClick={() => moveGroup(gi, -1)} disabled={gi === 0} className="w-8 h-8 rounded-card bg-slate-100 disabled:opacity-30" aria-label="أعلى">▲</button>
                    <button type="button" onClick={() => moveGroup(gi, 1)} disabled={gi === groups.length - 1} className="w-8 h-8 rounded-card bg-slate-100 disabled:opacity-30" aria-label="أسفل">▼</button>
                  </div>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onItemDrag(gi)}>
                    <SortableContext items={g.items.map(it => it.to)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1.5">
                        {g.items.length === 0 && <p className="text-[12px] text-slate-400 m-0">لا صفحات. انقل إليها صفحة من مجموعة أخرى.</p>}
                        {g.items.map((it, ii) => (
                          <SortableRow key={it.to} id={it.to}>{h => (
                            <div className={`flex flex-wrap items-center gap-1.5 rounded-card border border-slate-100 px-1.5 py-1 ${hidden.has(it.to) ? 'opacity-45 bg-slate-50' : 'bg-white'}`} data-testid="menu-item">
                              {h}
                              <span className="flex-1 min-w-[55%] text-[13px] font-semibold">{it.icon} {t(it.labelKey)}{hidden.has(it.to) ? ' (مخفية)' : ''}</span>
                              <span className="flex items-center gap-1.5 ms-auto">
                              <button type="button" onClick={() => moveItem(gi, ii, -1)} disabled={ii === 0} className="w-7 h-7 rounded bg-slate-100 text-[11px] disabled:opacity-30" aria-label="أعلى">▲</button>
                              <button type="button" onClick={() => moveItem(gi, ii, 1)} disabled={ii === g.items.length - 1} className="w-7 h-7 rounded bg-slate-100 text-[11px] disabled:opacity-30" aria-label="أسفل">▼</button>
                              <select className="max-w-[110px] text-[11.5px] rounded border border-slate-200 bg-white py-1" value="" onChange={e => e.target.value && sendTo(gi, ii, e.target.value)} aria-label="نقل إلى" data-testid="menu-item-move">
                                <option value="">نقل إلى…</option>
                                {groups.filter((_, k) => k !== gi).map(o => <option key={o.key} value={o.key}>{titleOf(o) || 'بلا اسم'}</option>)}
                              </select>
                              <button type="button" onClick={() => toggleHidden(it.to)} disabled={LOCKED.has(it.to)} className="w-7 h-7 rounded bg-slate-100 text-[12px] disabled:opacity-30"
                                aria-label={hidden.has(it.to) ? 'إظهار' : 'إخفاء'} title={LOCKED.has(it.to) ? 'لا تُخفى' : hidden.has(it.to) ? 'إظهار' : 'إخفاء'} data-testid="menu-item-hide">{hidden.has(it.to) ? '🙈' : '👁'}</button>
                              </span>
                            </div>
                          )}</SortableRow>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </section>
              )}</SortableRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex flex-wrap gap-2 sticky bottom-2 bg-white/90 backdrop-blur rounded-card p-2 border border-slate-200">
        <AdminButton variant="secondary" onClick={addGroup}>+ مجموعة جديدة</AdminButton>
        <AdminButton variant="primary" onClick={save} disabled={saving || !dirty}>{saving ? 'جارٍ الحفظ…' : dirty ? '💾 حفظ الترتيب' : 'لا تغييرات'}</AdminButton>
        <AdminButton variant="warning" onClick={reset}>↩ استعادة الترتيب الأصلي</AdminButton>
      </div>
    </div>
  );
}
