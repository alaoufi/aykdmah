import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { me, updateProviderProfile } from '../../services/authService';
import { listCategories } from '../../services/serviceService';
import api, { apiError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { localizedName } from '../../utils/localize';
import Button from '../common/Button';
import ProfessionsPicker from '../common/ProfessionsPicker';
import AvailabilityBadge, { workingSummary } from '../common/AvailabilityBadge';

// "My work" (AYK-040): what requesters see of this provider — professions,
// covered districts and working time — with pause/resume and "add a profession".
// Other professions only appear inside "add a profession".
export default function WorkPanel() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const { refresh } = useAuth();
  const [profile, setProfile] = useState(null);
  const [categories, setCategories] = useState(new Map());
  const [editing, setEditing] = useState(false);
  const [serviceIds, setServiceIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ ok: '', error: '' });
  // Whether this provider's work needs a monthly subscription in their area (AYK-042).
  const [plan, setPlan] = useState(null);

  const load = async () => {
    const data = await me();
    const p = data.provider || {};
    setProfile(p);
    setServiceIds(Array.isArray(p.service_ids) ? p.service_ids.map(Number) : []);
  };
  useEffect(() => {
    load().catch(() => setProfile({}));
    listCategories().then(rows => setCategories(new Map(rows.map(row => [Number(row.id), row])))).catch(() => {});
    api.get('/subscriptions/requirement').then(res => setPlan(res.data.data)).catch(() => {});
  }, []);

  if (!profile) return null;
  const paused = profile.availability_status === 'paused';
  const professions = (profile.category_ids || []).map(id => categories.get(Number(id))).filter(Boolean);
  const areas = profile.coverage_districts || [];

  const run = async (payload, ok) => {
    setSaving(true); setMessage({ ok: '', error: '' });
    try {
      await updateProviderProfile(payload);
      await load();
      refresh?.();
      setMessage({ ok, error: '' });
      return true;
    } catch (err) { setMessage({ ok: '', error: apiError(err) }); return false; }
    finally { setSaving(false); }
  };

  return (
    <section className="card mb-4 space-y-3" data-testid="work-panel" aria-labelledby="work-panel-title">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 id="work-panel-title" className="m-0 text-xl font-extrabold">🧰 {t('work.title')}</h2>
        <AvailabilityBadge availability={profile.availability} />
      </div>
      <p className="text-[13px] text-fg-muted m-0">{t('work.hint')}</p>
      {plan?.enabled && plan.required_category_ids.length > 0 && !plan.subscribed && (
        <div role="alert" className="rounded-card border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-[13px]" data-testid="work-subscription-needed">
          💳 {t('subrules.provider_needed')} <Link to="/provider/subscription" className="font-bold underline">{t('subrules.subscribe_now')}</Link>
        </div>
      )}

      <div>
        <div className="form-label">{t('work.professions')}</div>
        <div className="flex flex-wrap gap-1.5" data-testid="work-professions">
          {professions.length
            ? professions.map(category => (
              <span key={category.id} className="px-3 py-1 rounded-pill border border-primary bg-primary-soft text-[13px] font-semibold">
                {category.icon ? `${category.icon} ` : ''}{localizedName(category, lang)}
              </span>))
            : <span className="text-[13px] text-fg-muted">{t('work.no_professions')}</span>}
          {!editing && <button type="button" className="px-3 py-1 rounded-pill border border-dashed border-primary text-primary text-[13px] font-semibold"
            onClick={() => setEditing(true)} data-testid="work-add-profession">➕ {t('work.add_profession')}</button>}
        </div>
        {editing && <div className="mt-2 rounded-card border border-border p-2.5 space-y-2">
          <ProfessionsPicker serviceIds={serviceIds} onChange={setServiceIds} disabled={saving} />
          <div className="flex gap-2">
            <Button type="button" variant="primary" size="sm" loading={saving}
              onClick={async () => { if (await run({ service_ids: serviceIds, any_category: true }, t('work.saved'))) setEditing(false); }}>
              {t('work.save_professions')}</Button>
            <Button type="button" variant="outline" size="sm" disabled={saving}
              onClick={() => { setEditing(false); setServiceIds((profile.service_ids || []).map(Number)); }}>{t('common.cancel')}</Button>
          </div>
        </div>}
      </div>

      <div>
        <div className="form-label">{t('work.areas')}</div>
        <div className="flex flex-wrap gap-1.5 items-center" data-testid="work-areas">
          {areas.length
            ? areas.map(area => <span key={area.id} className="px-2.5 py-0.5 rounded-pill border border-border bg-surface-alt text-[12.5px]">📍 {localizedName(area, lang)}</span>)
            : <span className="text-[13px]">📍 {t('work.whole_city')}</span>}
          <Link to="/profile#provider" className="text-[12.5px] font-semibold">{t('work.edit_areas')}</Link>
        </div>
      </div>

      <div>
        <div className="form-label">{t('work.hours')}</div>
        <div className="flex flex-wrap gap-2 items-center text-[13px]">
          <span>🗓️ {workingSummary(profile.availability, t, lang)}</span>
          <Link to="/profile#availability" className="text-[12.5px] font-semibold">{t('work.edit_times')}</Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-card border border-border px-3 py-2">
        <span className="text-[13px]">{paused ? t('work.hidden_now') : t('work.visible_now')}</span>
        <Button type="button" size="sm" variant={paused ? 'primary' : 'outline'} loading={saving} data-testid="work-pause"
          onClick={() => run({ availability_status: paused ? 'active' : 'paused' }, t('availability.saved'))}>
          {paused ? `▶️ ${t('availability.resume')}` : `⏸️ ${t('availability.pause')}`}
        </Button>
      </div>

      {message.ok && <p role="status" className="text-[13px] text-success m-0">✓ {message.ok}</p>}
      {message.error && <p role="alert" className="form-error m-0">{message.error}</p>}

      <div className="flex flex-wrap gap-3 text-[12.5px] font-semibold">
        <Link to="/opportunities">🔍 {t('work.requests_nav')}</Link>
        <Link to="/profile#account-type">🔁 {t('work.switch_type')}</Link>
      </div>
    </section>
  );
}
