import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminMarketers, adminMarketerReferrals } from '../../services/walletService';
import { LoadingState, ErrorState } from '../../components/common/Spinner';

// AYK-453 (the owner: «في الإدارة أريد صفحة يعرض فيها رصيد المسوّقين: رقمه، اسمه، عدد المسجلين عن طريقه،
// وتفصيل: صفحة بأرقام المسجلين عن طريقه»). The administration is in Arabic only (AYK-295).
const money = value => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = value => (value ? new Date(value).toLocaleDateString('en-GB') : '');
const kind = row => (row.role === 'provider' ? (Number(row.also_client) === 1 ? 'مقدم وطالب خدمة' : 'مقدم خدمة') : row.role === 'client' ? 'طالب خدمة' : row.role);

export default function AdminMarketersPage() {
  const { id } = useParams();
  return id ? <MarketerDetails id={id} /> : <MarketersList />;
}

function MarketersList() {
  const [search, setSearch] = useState('');
  const [typed, setTyped] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSearch(typed.trim()), 350); return () => clearTimeout(timer); }, [typed]);
  useEffect(() => {
    let alive = true; setError(false);
    adminMarketers(search).then(list => { if (alive) setRows(list || []); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [search]);
  const total = (rows || []).reduce((sum, row) => ({ referrals: sum.referrals + row.referrals, balance: sum.balance + row.balance }), { referrals: 0, balance: 0 });
  return (
    <div className="space-y-3" data-testid="admin-marketers">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold text-fg m-0">🤝 أرصدة المسوّقين</h1>
          <p className="text-[12.5px] text-fg-muted m-0">كل من سجّل أحد برقمه (كوبونه). اضغط على المسوّق لترى أرقام من سجّلوا عن طريقه.</p>
        </div>
        <Link to="/admin/wallets" className="btn btn-outline btn-sm">💰 المحافظ والتسليم النقدي</Link>
      </div>
      <input className="input w-full max-w-md" placeholder="ابحث بالاسم أو الجوال أو رقم المسوّق" value={typed}
        onChange={e => setTyped(e.target.value)} data-testid="marketers-search" />
      {error ? <ErrorState message="تعذّر تحميل المسوّقين" /> : rows === null ? <LoadingState /> : rows.length === 0 ? (
        <div className="card text-[13px] text-fg-muted">{search ? 'لا مسوّق بهذا البحث.' : 'لا أحد سجّل برقم مسوّق بعد.'}</div>
      ) : (
        <>
          <div className="text-[12.5px] text-fg-muted">{rows.length} مسوّق · {total.referrals} مسجّل · مجموع الأرصدة <b dir="ltr">{money(total.balance)}</b> ريال</div>
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-fg-muted bg-surface-alt">
                {['رقم المسوّق', 'الاسم', 'الجوال', 'المسجّلون عن طريقه', 'مقدمو خدمة محتسبون', 'المكتسب', 'المسلَّم', 'الرصيد'].map(head => <th key={head} className="text-start p-2 whitespace-nowrap">{head}</th>)}
              </tr></thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-t border-border hover:bg-surface-alt" data-testid="marketer-row">
                    <td className="p-2 font-bold" dir="ltr">{row.referral_code}</td>
                    <td className="p-2"><Link to={`/admin/marketers/${row.id}`} className="font-bold text-primary">{row.full_name}</Link></td>
                    <td className="p-2" dir="ltr">{row.phone}</td>
                    <td className="p-2"><Link to={`/admin/marketers/${row.id}`} className="font-bold underline" data-testid="marketer-referrals">{row.referrals}</Link></td>
                    <td className="p-2">{row.providers}</td>
                    <td className="p-2" dir="ltr">{money(row.earned)}</td>
                    <td className="p-2" dir="ltr">{money(row.paid_out)}</td>
                    <td className="p-2 font-extrabold" dir="ltr">{money(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function MarketerDetails({ id }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true; setResult(null); setError(false);
    adminMarketerReferrals(id).then(value => { if (alive) setResult(value); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [id]);
  if (error) return <ErrorState message="تعذّر تحميل المسوّق" />;
  if (!result) return <LoadingState />;
  const { marketer: m, people } = result;
  return (
    <div className="space-y-3" data-testid="admin-marketer">
      <Link to="/admin/marketers" className="text-[13px] font-semibold">→ أرصدة المسوّقين</Link>
      <div className="card">
        <h1 className="text-xl font-extrabold text-fg m-0">{m.full_name}</h1>
        <div className="text-[13px] text-fg-muted mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <span>رقم المسوّق: <b dir="ltr">{m.referral_code}</b></span>
          {m.phone && <span>الجوال: <b dir="ltr">{m.phone}</b></span>}
          <span>المسجّلون عن طريقه: <b>{people.length}</b></span>
          {m.balance !== undefined && <span>الرصيد: <b dir="ltr">{money(m.balance)}</b> ريال</span>}
        </div>
      </div>
      {people.length === 0 ? <div className="card text-[13px] text-fg-muted">لم يسجّل أحد عن طريقه.</div> : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-[13px]" data-testid="marketer-people">
            <thead><tr className="text-fg-muted bg-surface-alt">
              {['رقم الحساب', 'الاسم', 'الجوال', 'النوع', 'تاريخ التسجيل', 'محتسب للمكافأة'].map(head => <th key={head} className="text-start p-2 whitespace-nowrap">{head}</th>)}
            </tr></thead>
            <tbody>
              {people.map(row => (
                <tr key={row.id} className={`border-t border-border ${row.deleted ? 'opacity-60' : ''}`}>
                  <td className="p-2 font-bold" dir="ltr">{row.account_number}</td>
                  <td className="p-2">{row.full_name}{row.deleted ? ' (محذوف)' : ''}</td>
                  <td className="p-2" dir="ltr">{row.phone}</td>
                  <td className="p-2">{kind(row)}</td>
                  <td className="p-2" dir="ltr">{day(row.created_at)}</td>
                  <td className="p-2">{row.counted ? '✓ نعم' : row.role === 'provider' ? 'لم يختر خدماته بعد' : '—'}{row.rewarded ? ' · 💎 اشترك' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
