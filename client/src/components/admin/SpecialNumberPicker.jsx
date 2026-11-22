import { useEffect, useState } from 'react';
import { adminSpecialNumbers, adminAssignSpecialNumber } from '../../services/adminService';
import { apiError } from '../../services/api';
import { InfoButton, InfoPanel } from '../common/InfoTip';

// AYK-357 (the owner: «الإدارة توجهها لمن تراه، مثلًا رقم 44 بدل 145 وينتقل الرقم، ويمنع أي تعديل
// غير المتشابه»): give an account one of the special numbers (11, 22 … 99, 111 … 999). Only these
// can be given; the account's previous number keeps reaching it. Admin area: Arabic only.
export default function SpecialNumberPicker({ user, onChanged, compact = false }) {
  const [numbers, setNumbers] = useState(null);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [current, setCurrent] = useState(user?.referral_code || '');
  const [infoOpen, setInfoOpen] = useState(false);
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
      onChanged?.(done);
    } catch (err) { setNote(apiError(err)); } finally { setBusy(false); }
  };
  // AYK-462 (the owner: «إذا دخلت تعديل يكون ظاهر الرقم، والصفحة منظمة ومرتبة وأسطر متقاربة»): one row
  // under the number at the top of the edit window; the explanation stays behind (i).
  if (compact) {
    return (
      <div data-testid="special-number">
        <div className="flex items-center gap-1.5">
          <label htmlFor="special-number-choice" className="text-[12px] font-bold text-ink shrink-0">🔢 نقل إلى رقم مميز</label>
          <InfoButton open={infoOpen} onToggle={() => setInfoOpen(v => !v)} controls="special-number-info" label="الرقم المميز" />
          <select id="special-number-choice" className="flex-1 min-w-0 !py-0 !h-9 !min-h-0 text-[13px]" value={choice} onChange={e => setChoice(e.target.value)} disabled={busy || numbers === null} aria-label="رقم مميز">
            <option value="">{numbers === null ? 'جارٍ التحميل…' : free.length ? 'اختر' : 'لا يوجد متاح'}</option>
            {free.map(n => <option key={n.code} value={n.code}>{n.code}</option>)}
          </select>
          <button type="button" className="btn btn-primary btn-sm shrink-0" disabled={!choice || busy} onClick={move} data-testid="special-number-move">نقل</button>
        </div>
        <InfoPanel id="special-number-info" open={infoOpen}>
          {'المسموح فقط الأرقام المميزة: رقمان متشابهان (11 إلى 99) أو ثلاثة (111 إلى 999)، والمتاح منها فقط في القائمة.\nالنقل يتم مباشرة عند الضغط على «نقل» دون انتظار زر الحفظ، ويُسجَّل في سجل النشاط.\nرقمه السابق يتحرر لحسابات جديدة، ومحادثاته وطلباته ومحفظته تبقى معه.'}
        </InfoPanel>
        {note && <p role="status" className="text-[12px] mt-1 mb-0">{note}</p>}
      </div>
    );
  }
  return (
    <div className="mt-3 p-3 rounded-card border border-slate-200 bg-slate-50" data-testid="special-number">
      {/* AYK-415: a short line under the name, and (i) for the full explanation. */}
      <span className="flex items-center gap-1.5">
        <label htmlFor="special-number-choice" className="text-[13px] font-bold text-ink">🔢 الرقم المميز</label>
        <InfoButton open={infoOpen} onToggle={() => setInfoOpen(v => !v)} controls="special-number-info" label="الرقم المميز" />
      </span>
      <div className="text-[12px] text-slate-500 mt-0.5 mb-1 leading-snug" data-testid="field-short">يغيّر رقم الحساب لهذا الحساب إلى رقم مميز متاح، فور الضغط على «نقل إليه».</div>
      <InfoPanel id="special-number-info" open={infoOpen}>
        {'رقم الحساب يظهر في حسابه، ويدخل به، وهو نفسه كود الدعوة (الكوبون) الذي يسجّل به الآخرون.\nالمسموح فقط الأرقام المميزة: رقمان متشابهان (11 إلى 99) أو ثلاثة (111 إلى 999)، وتظهر في القائمة المتاحة منها فقط.\nالنقل يتم مباشرة عند الضغط على «نقل إليه» دون انتظار زر الحفظ، ويُسجَّل في سجل النشاط.\nرقمه السابق يتحرر لحسابات جديدة، ومحادثاته وطلباته ومحفظته تبقى معه.'}
      </InfoPanel>
      <div className="text-[12.5px] text-slate-600 mb-2">رقمه الحالي: <b dir="ltr">{current || '-'}</b>. يمكن نقله إلى رقم مميز فقط (رقمان متشابهان من 11 إلى 99، أو ثلاثة من 111 إلى 999). رقمه الحالي يتحرر بعد النقل.</div>
      <div className="flex gap-2">
        <select id="special-number-choice" className="flex-1" value={choice} onChange={e => setChoice(e.target.value)} disabled={busy || numbers === null} aria-label="رقم مميز">
          <option value="">{numbers === null ? 'جارٍ التحميل…' : free.length ? 'اختر رقمًا متاحًا' : 'لا توجد أرقام مميزة متاحة'}</option>
          {free.map(n => <option key={n.code} value={n.code}>{n.code}</option>)}
        </select>
        <button type="button" className="btn btn-primary btn-sm" disabled={!choice || busy} onClick={move} data-testid="special-number-move">نقل إليه</button>
      </div>
      {note && <p role="status" className="text-[12.5px] mt-2 mb-0">{note}</p>}
    </div>
  );
}
