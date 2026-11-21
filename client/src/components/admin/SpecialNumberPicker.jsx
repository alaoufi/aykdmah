import { useEffect, useState } from 'react';
import { adminSpecialNumbers, adminAssignSpecialNumber } from '../../services/adminService';
import { apiError } from '../../services/api';

// AYK-357 (the owner: «الإدارة توجهها لمن تراه، مثلًا رقم 44 بدل 145 وينتقل الرقم، ويمنع أي تعديل
// غير المتشابه»): give an account one of the special numbers (11, 22 … 99, 111 … 999). Only these
// can be given; the account's previous number keeps reaching it. Admin area: Arabic only.
export default function SpecialNumberPicker({ user, onChanged }) {
  const [numbers, setNumbers] = useState(null);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [current, setCurrent] = useState(user?.referral_code || '');
  useEffect(() => { adminSpecialNumbers().then(setNumbers).catch(() => setNumbers([])); }, []);
  if (!user?.id) return null;
  const free = (numbers || []).filter(n => n.free);
  const move = async () => {
    if (!choice) return;
    setBusy(true); setNote('');
    try {
      const done = await adminAssignSpecialNumber(user.id, choice);
      setCurrent(done.referral_code);
      setNote(`تم: رقمه الآن ${done.referral_code}${done.previous ? `، ورقمه السابق ${done.previous} صار متاحًا للحسابات الجديدة` : ''}. محادثاته وطلباته ومحفظته معه كما هي.`);
      setNumbers(list => (list || []).map(n => (n.code === done.referral_code ? { ...n, free: false } : n.code === done.previous ? { ...n, free: true } : n)));
      setChoice('');
      onChanged?.();
    } catch (err) { setNote(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 p-3 rounded-card border border-slate-200 bg-slate-50" data-testid="special-number">
      <div className="text-[13px] font-bold text-ink mb-1">🔢 الرقم المميز</div>
      <div className="text-[12.5px] text-slate-600 mb-2">رقمه الحالي: <b dir="ltr">{current || '-'}</b>. يمكن نقله إلى رقم مميز فقط (رقمان متشابهان من 11 إلى 99، أو ثلاثة من 111 إلى 999). رقمه الحالي يتحرر بعد النقل.</div>
      <div className="flex gap-2">
        <select className="flex-1" value={choice} onChange={e => setChoice(e.target.value)} disabled={busy || numbers === null} aria-label="رقم مميز">
          <option value="">{numbers === null ? 'جارٍ التحميل…' : free.length ? 'اختر رقمًا متاحًا' : 'لا توجد أرقام مميزة متاحة'}</option>
          {free.map(n => <option key={n.code} value={n.code}>{n.code}</option>)}
        </select>
        <button type="button" className="btn btn-primary btn-sm" disabled={!choice || busy} onClick={move} data-testid="special-number-move">نقل إليه</button>
      </div>
      {note && <p role="status" className="text-[12.5px] mt-2 mb-0">{note}</p>}
    </div>
  );
}
