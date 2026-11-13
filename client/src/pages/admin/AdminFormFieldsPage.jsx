import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import { useAdminConfirmation } from '../../components/admin/confirmAdminChange';
import { getSettings, updateSettings } from '../../services/adminService';
import { apiError } from '../../services/api';
import { FORM_FIELDS, FORM_NAMES, hiddenFields, requiredFields, toggleField, toggleRequired } from '../../data/formFields';

const KEY = 'form_fields_hidden';
const REQUIRED_KEY = 'form_fields_required';

// «حقول النماذج» (AYK-215): every field of the «طلب خدمة» form with «إخفاء» or «إظهار». A hidden
// field is shown faded here and is left out of the form. Core fields cannot be hidden.
export default function AdminFormFieldsPage() {
  const { t } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const [setting, setSetting] = useState(null);
  const [requiredSetting, setRequiredSetting] = useState(undefined);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    getSettings()
      .then(rows => {
        if (!alive.current) return;
        setSetting(rows.find(row => row.setting_key === KEY)?.parsed_value || {});
        setRequiredSetting(rows.find(row => row.setting_key === REQUIRED_KEY)?.parsed_value ?? undefined);
      })
      .catch(e => { if (alive.current) { setSetting({}); setMsg({ type: 'error', text: apiError(e) }); } });
    return () => { alive.current = false; };
  }, []);

  const toggle = async (form, field, hide) => {
    if (busy || !(await confirmAdminChange(t, t(field.labelKey)))) return;
    const next = toggleField(setting, form, field.key);
    setBusy(`${form}.${field.key}`);
    try {
      await updateSettings([{ key: KEY, value: next }]);
      if (!alive.current) return;
      setSetting(next);
      setMsg({ type: 'success', text: t(hide ? 'admin.form_fields.hidden_done' : 'admin.form_fields.shown_done', { field: t(field.labelKey) }) });
    } catch (e) { if (alive.current) setMsg({ type: 'error', text: apiError(e) }); }
    finally { if (alive.current) setBusy(''); }
  };

  // «إجباري / اختياري» (AYK-218): a hidden field is always optional, so the button waits for «إظهار».
  const toggleRequiredField = async (form, field, makeRequired) => {
    if (busy || !(await confirmAdminChange(t, t(field.labelKey)))) return;
    const next = toggleRequired(requiredSetting, form, field.key);
    setBusy(`${form}.${field.key}.required`);
    try {
      await updateSettings([{ key: REQUIRED_KEY, value: next }]);
      if (!alive.current) return;
      setRequiredSetting(next);
      setMsg({ type: 'success', text: t(makeRequired ? 'admin.form_fields.required_done' : 'admin.form_fields.optional_done', { field: t(field.labelKey) }) });
    } catch (e) { if (alive.current) setMsg({ type: 'error', text: apiError(e) }); }
    finally { if (alive.current) setBusy(''); }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <AdminPageHeader title={t('admin.form_fields.title')} subtitle={t('admin.form_fields.subtitle')} />
      {msg && (
        <div role="status" className={`px-4 py-3 rounded-card text-[13.5px] font-semibold ${
          msg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'
        }`}>{msg.text}</div>
      )}
      {setting === null ? <div className="h-[260px] rounded-card bg-surface border border-border animate-pulse" /> : (
        Object.entries(FORM_FIELDS).map(([form, fields]) => {
          const hidden = hiddenFields(setting, form);
          const required = requiredFields(requiredSetting, setting, form);
          return (
            <section key={form} className="bg-surface rounded-card border border-border p-3" data-testid={`form-fields-${form}`}>
              <h2 className="text-[16px] font-extrabold mb-2">{t(FORM_NAMES[form])}</h2>
              <ul className="divide-y divide-border">
                {fields.map(field => {
                  const isHidden = hidden.has(field.key);
                  const isRequired = field.core || required.has(field.key);
                  return (
                    <li key={field.key} className="flex items-center justify-between gap-3 py-2.5 flex-wrap" data-testid="form-field-row"
                      data-field={field.key} data-hidden={isHidden ? '1' : '0'} data-required={isRequired ? '1' : '0'}>
                      <span className={`text-[14px] font-semibold ${isHidden ? 'opacity-40 line-through' : ''}`}>
                        {t(field.labelKey)}
                        <span className={`ms-2 px-2 py-0.5 rounded-pill text-[11px] font-bold no-underline inline-block ${isRequired ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                          {isRequired ? t('admin.form_fields.required') : t('admin.form_fields.optional')}
                        </span>
                      </span>
                      {field.core ? (
                        <span className="text-[12px] text-fg-muted">{t('admin.form_fields.core')}</span>
                      ) : (
                        <span className="flex gap-1.5">
                          {field.requirable && (
                            <AdminButton size="sm" variant="secondary" loading={busy === `${form}.${field.key}.required`}
                              disabled={Boolean(busy) || isHidden} onClick={() => toggleRequiredField(form, field, !isRequired)}>
                              {isRequired ? t('admin.form_fields.make_optional') : t('admin.form_fields.make_required')}
                            </AdminButton>
                          )}
                          <AdminButton size="sm" variant={isHidden ? 'success' : 'danger'} loading={busy === `${form}.${field.key}`}
                            disabled={Boolean(busy)} onClick={() => toggle(form, field, !isHidden)}>
                            {isHidden ? `👁️ ${t('admin.form_fields.show')}` : `🚫 ${t('admin.form_fields.hide')}`}
                          </AdminButton>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
