import { useAdminConfirmation } from '../../components/admin/confirmAdminChange';
import { localizedName, localizedPlatformText } from '../../utils/localize';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listPlansAdmin, createPlan, updatePlan, deletePlan,
} from '../../services/adminService';
import { apiError } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import EmptyState from '../../components/admin/EmptyState';
import AdminFab from '../../components/admin/AdminFab';
import SubscriptionRules from '../../components/admin/SubscriptionRules';
import { FieldHelp } from '../../components/admin/AdCampaigns';
import { formatCurrency } from '../../utils/formatters';

const EMPTY = {
  name_ar: '', name_en: '', slug: '', description: '',
  price: 0, duration_days: 30, max_offers_per_month: '',
  is_featured: false, badge: '', features_text: '',
  sort_order: 0, search_priority: 0, is_active: true,
};

function featuresToText(feats) {
  if (!feats) return '';
  if (Array.isArray(feats)) return feats.join(', ');
  if (typeof feats === 'string') {
    try { return JSON.parse(feats).join(', '); }
    catch (_) { return feats; }
  }
  return '';
}

function textToFeatures(text) {
  if (!text) return null;
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

export default function AdminPlansPage() {
  const { t, i18n } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirm, setConfirm] = useState({ open: false });
  const [error, setError] = useState('');
  const loadVersion = useRef(0);

  const load = () => {
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    listPlansAdmin()
      .then((rows) => { if (version === loadVersion.current) setItems(rows || []); })
      .catch((e) => { if (version === loadVersion.current) { setItems([]); setError(apiError(e)); } })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setFormError(''); setEditOpen(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      name_ar: p.name_ar || '', name_en: p.name_en || '', slug: p.slug || '',
      description: p.description || '', price: p.price || 0, duration_days: p.duration_days || 30,
      max_offers_per_month: p.max_offers_per_month ?? '', is_featured: !!p.is_featured,
      badge: p.badge || '', features_text: featuresToText(p.features),
      sort_order: p.sort_order || 0, search_priority: p.search_priority || 0,
      is_active: !!p.is_active,
    });
    setFormError('');
    setEditOpen(true);
  };

  const onSave = async (e) => {
    e.preventDefault();
    if (editing && !(await confirmAdminChange(t, editing.name_ar || editing.full_name || editing.title || editing.provider || ''))) return;
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name_ar: form.name_ar, name_en: form.name_en, slug: form.slug,
        description: form.description, price: Number(form.price) || 0,
        duration_days: Number(form.duration_days) || 30,
        max_offers_per_month: form.max_offers_per_month === '' ? null : Number(form.max_offers_per_month),
        is_featured: form.is_featured ? 1 : 0, badge: form.badge,
        features: textToFeatures(form.features_text),
        sort_order: Number(form.sort_order) || 0,
        search_priority: Number(form.search_priority) || 0,
        is_active: form.is_active ? 1 : 0,
      };
      if (editing) await updatePlan(editing.id, payload);
      else await createPlan(payload);
      setEditOpen(false);
      load();
    } catch (err) {
      setFormError(apiError(err) || t('errors.generic'));
    } finally { setSaving(false); }
  };

  const askDelete = (p) => {
    setConfirm({
      open: true,
      title: t('admin.confirm_delete_title'),
      body: `${t('admin.confirm_delete_body')} (${localizedName(p, i18n.resolvedLanguage)})`,
      tone: 'danger',
      onConfirm: async () => {
        await deletePlan(p.id);
        setConfirm({ open: false });
        load();
      },
    });
  };

  return (
    <div className="space-y-3">
      <AdminPageHeader title={t('admin.plans')} count={items.length}>
        <AdminButton variant="primary" icon="+" onClick={openCreate}>{t('admin.new')}</AdminButton>
      </AdminPageHeader>

      <SubscriptionRules />

      {error && <div role="alert" className="text-rose-700 text-[13px]">{error}</div>}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[220px] rounded-card bg-white border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-card border border-slate-100"><EmptyState icon="💎" title={t('admin.no_results')} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => (
            <div key={p.id} className="bg-white rounded-card border border-slate-100 p-5 shadow-soft hover:shadow-card transition flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="font-extrabold text-ink text-[16px]">{localizedPlatformText(localizedName(p, i18n.resolvedLanguage), i18n.resolvedLanguage)}</div>
                  <div className="text-[11.5px] text-slate-500">{p.slug}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {p.is_featured ? (
                    <span className="px-2 py-0.5 rounded-pill bg-amber-50 text-amber-700 text-[10.5px] font-bold">⭐</span>
                  ) : null}
                  {p.is_active ? (
                    <span className="px-2 py-0.5 rounded-pill bg-emerald-50 text-emerald-600 text-[10.5px] font-bold">{t('admin.active')}</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-pill bg-slate-100 text-slate-500 text-[10.5px] font-bold">{t('admin.inactive')}</span>
                  )}
                </div>
              </div>
              <div className="text-[22px] font-extrabold text-brand-700 mb-1">
                {p.price > 0 ? formatCurrency(p.price) : t('subscription.free')}
              </div>
              <div className="text-[12px] text-slate-500 mb-2">
                {t('subscription.per_days', { count: p.duration_days })}
              </div>
              {p.search_priority > 0 && (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-violet-50 text-violet-700 text-[11px] font-bold mb-3 w-fit">
                  🚀 {t('admin.plan_search_priority')}: {p.search_priority}
                </div>
              )}
              {p.description && (
                <p className="text-[12.5px] text-slate-600 mb-3 line-clamp-2">{localizedPlatformText(p.description, i18n.resolvedLanguage)}</p>
              )}
              <div className="mt-auto flex gap-1.5 pt-3 border-t border-slate-100">
                <button onClick={() => openEdit(p)} className="flex-1 px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 transition">{t('admin.edit')}</button>
                <button onClick={() => askDelete(p)} className="flex-1 px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition">{t('admin.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={editing ? t('admin.edit') : t('admin.new')}
        width={620}
        footer={
          <>
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-pill bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-semibold border border-slate-200 transition">{t('admin.cancel_btn')}</button>
            <button type="submit" form="AdminPlansPage-form" disabled={saving} className="px-4 py-2 rounded-pill text-white text-[13px] font-semibold shadow-soft disabled:opacity-60 transition" style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}>{saving ? t('admin.saving') : t('admin.save')}</button>
          </>
        }
      >
        <form id="AdminPlansPage-form" onSubmit={onSave} className="space-y-3">
          {formError && <div className="px-3 py-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[13px]">{formError}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FieldP label={t('admin.plan_name_ar')} value={form.name_ar} onChange={(v) => setForm({ ...form, name_ar: v })} required
              hint="اسم الباقة الذي يراه مقدم الخدمة في صفحة الاشتراك. مطلوب."
              info={'يظهر عنوانًا لبطاقة الباقة في صفحة الاشتراك، وفي قائمة الباقات عند إهداء اشتراك من المحفظة. يُترجم تلقائيًا إلى لغات الموقع بعد الحفظ. مثال: «الباقة الذهبية».'} />
            <FieldP label={t('admin.plan_name_en')} value={form.name_en} onChange={(v) => setForm({ ...form, name_en: v })}
              hint="اسم بالإنجليزية يُستعمل إذا لم تتوفر الترجمة التلقائية. اختياري."
              info={'الاسم العربي يُترجم تلقائيًا إلى كل اللغات، والترجمة تتقدم على هذه الخانة. يُستعمل هذا الاسم احتياطًا إذا تأخرت الترجمة، وفي قائمة إهداء الاشتراك من المحفظة لمن يتصفح بالإنجليزية. مثال: Gold. إن تُرك فارغًا يظهر الاسم العربي.'} />
          </div>
          <FieldP label={t('admin.plan_slug')} value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} required
            hint="اسم قصير بحروف إنجليزية صغيرة يميّز الباقة. مطلوب ولا يتكرر."
            info={'لا يراه مقدمو الخدمة، ويظهر تحت اسم الباقة في هذه الصفحة فقط. يُكتب بحروف إنجليزية صغيرة وأرقام، ويُسمح بالشَّرطة - والشَّرطة السفلية _، دون مسافات. لا يمكن أن تشترك فيه باقتان. مثال: gold أو pro-monthly.'} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FieldP label={t('admin.plan_price')} type="number" value={form.price} onChange={(v) => setForm({ ...form, price: v })} required
              hint="المبلغ بالريال الذي يدفعه مقدم الخدمة لكل مدة. صفر = مجانية."
              info={'يُدفع مرة واحدة لكل اشتراك، ويغطي المدة المكتوبة في «المدة». إذا كان صفرًا تظهر الباقة «مجانية» ويُفعَّل الاشتراك دون دفع، ولا تظهر في قائمة إهداء الاشتراك من المحفظة. مثال: 99.'} />
            <FieldP label={t('admin.plan_duration_days')} type="number" value={form.duration_days} onChange={(v) => setForm({ ...form, duration_days: v })} required
              hint="كم يومًا يبقى الاشتراك فعّالًا بعد الدفع."
              info={'عدد أيام صحيح من 1 إلى 3650. يظهر بجانب السعر في صفحة الاشتراك (مثل «لكل 30 يومًا»)، وبعد انقضائه ينتهي الاشتراك ويحتاج مقدم الخدمة لتجديده. مثال: 30 لشهر، 365 لسنة. الافتراضي 30.'} />
            <FieldP label={t('admin.plan_max_offers')} type="number" value={form.max_offers_per_month} onChange={(v) => setForm({ ...form, max_offers_per_month: v })}
              hint="أقصى عدد عروض يقدمها المشترك في الشهر. فارغ = بلا حد."
              info={'عدد صحيح من 0 فأكثر. تُعد كل العروض التي قدمها المشترك منذ أول الشهر، حتى المسحوبة والمرفوضة، فإذا بلغ الحد ظهرت له رسالة «تم بلوغ الحد الشهري للعروض في باقتك» حتى الشهر التالي. مثال: 50. إن تُرك فارغًا فالعروض بلا حد.'} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FieldP label={t('admin.plan_badge')} value={form.badge} onChange={(v) => setForm({ ...form, badge: v })}
              hint="كلمة قصيرة تظهر أعلى بطاقة الباقة، مثل «الأكثر طلبًا». اختياري."
              info={'تظهر في شريط صغير أعلى بطاقة الباقة في صفحة الاشتراك لجذب الانتباه. حتى 50 حرفًا. مثال: «الأوفر» أو «جديد». إن تُركت فارغة لا يظهر شيء.'} />
            <FieldP label={t('admin.category_sort_order')} type="number" value={form.sort_order} onChange={(v) => setForm({ ...form, sort_order: v })}
              hint="ترتيب الباقة في صفحة الاشتراك: الرقم الأصغر أولًا."
              info={'عدد صحيح من 0 فأكثر. ترتَّب الباقات في صفحة الاشتراك من الأصغر رقمًا، وعند التساوي من الأرخص. مثال: 1 للباقة الأولى، 2 للثانية. الافتراضي 0.'} />
            <FieldP label={t('admin.plan_search_priority')} type="number" value={form.search_priority} onChange={(v) => setForm({ ...form, search_priority: v })} hint={t('admin.plan_search_priority_hint')}
              info={'عدد صحيح من 0 فأكثر. عروض المشتركين في هذه الباقة ترتفع في قائمة العروض التي يراها طالب الخدمة على طلبه: الرقم الأعلى قبل الأقل. أصحاب الشارات المدفوعة (موثوق أو مميز) يبقون في المقدمة قبل الجميع، ثم يأتي هذا الرقم، ثم التقييم. 0 = بلا أولوية.'} />
          </div>
          <FieldP label={t('admin.plan_description')} value={form.description} onChange={(v) => setForm({ ...form, description: v })} multiline
            hint="وصف مختصر يظهر على بطاقة الباقة في هذه الصفحة. اختياري."
            info={'يُكتب ليوضح للإدارة الغرض من الباقة، ويظهر على بطاقتها هنا ويُترجم تلقائيًا. صفحة الاشتراك عند مقدمي الخدمة لا تعرض الوصف حاليًا، بل تعرض «المميزات». يمكن تركه فارغًا.'} />
          <FieldP label={t('admin.plan_features')} value={form.features_text} onChange={(v) => setForm({ ...form, features_text: v })} placeholder={t('admin.plan_features_placeholder')}
            hint="ما يحصل عليه المشترك، كل ميزة سطر ✓ في بطاقة الباقة. افصل بينها بفاصلة."
            info={'اكتب المميزات وافصل بينها بفاصلة إنجليزية (,) فتظهر كل واحدة سطرًا مستقلًا بعلامة ✓ في بطاقة الباقة بصفحة الاشتراك. مثال: ظهور أعلى في العروض, شارة مميزة, دعم سريع. هذه نصوص للعرض فقط ولا تغيّر ما تتيحه الباقة فعلًا. إن تُركت فارغة لا تظهر قائمة.'} />
          <div className="flex flex-wrap gap-4">
            <FieldHelp label={t('admin.is_active')} short="بدون العلامة تختفي الباقة من صفحة الاشتراك."
              check={<input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />}
              info={'الباقة غير النشطة لا تظهر لمقدمي الخدمة ولا يمكن الاشتراك فيها من جديد، وتبقى هنا لتعيد تنشيطها. لا يُلغى بإيقافها اشتراك قائم فيها.'} />
            <FieldHelp label={t('admin.plan_is_featured')} short="تُبرز الباقة، وتظهر عروض مشتركيها بعلامة «مميز»."
              check={<input type="checkbox" checked={!!form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} />}
              info={'تظهر بطاقة الباقة بلون بارز في صفحة الاشتراك. ومن يشترك فيها تظهر عروضه على طلبات العملاء بعلامة «مميز». لا تغيّر ترتيب العروض، فالترتيب تحدده «أولوية الظهور بالبحث».'} />
          </div>
        </form>
      </Modal>

      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
      <AdminFab onClick={openCreate} ariaLabel={t('admin.new')} />
    </div>
  );
}

// AYK-415: `hint` is the short line under the name, `info` the full explanation behind (i).
function FieldP({ label, value, onChange, type = 'text', required = false, placeholder = '', multiline = false, hint = '', info = '' }) {
  const cls = 'w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]';
  const id = useId();
  return (
    <div>
      <FieldHelp htmlFor={id} label={label} short={hint} info={info} />
      {multiline ? (
        <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      ) : (
        <input id={id} type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}
