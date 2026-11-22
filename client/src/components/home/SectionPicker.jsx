import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listCategories } from '../../services/serviceService';
import { localizedName } from '../../utils/localize';
import { optionLabel } from '../../utils/optionLabel';
import { updateProfile } from '../../services/authService';
import { useAuth } from '../../hooks/useAuth';
import { showProblem } from '../common/AppDialog';

// AYK-447 (the owner: «إذا لم يطلب من قبل يُطلب منه تحديد طلبه من قائمة الأقسام، وممكن يحدد أكثر من
// قسم»): a requester with no request yet picks the sections he needs; they count as his request for
// «مشابه لطلبي» until he sends one (and stay with his requests after).
export function chosenSections(user) {
  try { const list = JSON.parse(user?.interest_category_ids || '[]'); return Array.isArray(list) ? list.map(Number) : []; } catch (_) { return []; }
}

export default function SectionPicker({ onSaved, onCancel = null }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const { user, refresh } = useAuth();
  const [categories, setCategories] = useState([]);
  const [picked, setPicked] = useState(() => new Set(chosenSections(user)));
  const [busy, setBusy] = useState(false);
  useEffect(() => { listCategories().then(rows => setCategories(rows || [])).catch(() => {}); }, []);
  const toggle = id => setPicked(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const save = async () => {
    setBusy(true);
    try { await updateProfile({ interest_category_ids: [...picked] }); await refresh(); onSaved?.(); }
    catch (err) { showProblem(err); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-card border border-primary/40 bg-primary-soft/40 p-3 mt-2" data-testid="section-picker">
      <p className="text-[14px] font-extrabold text-fg m-0">{t('home.sections_title')}</p>
      <p className="text-[12.5px] text-fg-muted mt-0.5 mb-2">{t('home.sections_hint')}</p>
      <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
        {categories.map(cat => {
          const on = picked.has(Number(cat.id));
          return (
            <button key={cat.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(Number(cat.id))} data-testid="section-option"
              className={`px-2.5 py-1 rounded-pill border text-[12.5px] font-semibold ${on ? 'bg-primary text-white border-primary' : 'bg-surface text-fg border-border'}`}>
              {on ? '✓ ' : ''}{optionLabel(cat.icon, localizedName(cat, lang), lang)}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 mt-3">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || picked.size === 0} onClick={save} data-testid="section-save">
          {t('home.sections_save', { count: picked.size })}
        </button>
        {onCancel && <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>{t('common.cancel')}</button>}
      </div>
    </div>
  );
}
