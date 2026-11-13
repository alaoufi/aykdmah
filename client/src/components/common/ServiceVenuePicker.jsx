import { useId } from 'react';
import { useTranslation } from 'react-i18next';

// Order chosen by the owner: fixed place, travels to the client, either per the client's choice.
const MODES = ['fixed', 'mobile', 'both'];

export default function ServiceVenuePicker({ value, onChange, name = 'location_mode', disabled = false }) {
  const { t } = useTranslation();
  const id = useId();

  return (
    <fieldset className="form-group min-w-0 border-0 p-0" disabled={disabled}>
      <legend className="form-label">{t('provider.location_mode')}</legend>
      <div className="grid grid-cols-1 gap-2">
        {MODES.map(mode => (
          <label key={mode} className={`flex items-start gap-2 text-start p-3 rounded-card border-2 cursor-pointer transition focus-within:ring-2 focus-within:ring-primary ${
            value === mode ? 'border-primary bg-primary-soft' : 'border-border bg-surface-alt hover:border-primary/50'
          }`}>
            <input type="radio" name={name} value={mode} checked={value === mode}
              onChange={() => onChange(mode)} aria-labelledby={`${id}-${mode}-label`} aria-describedby={`${id}-${mode}-hint`}
              className="mt-1 w-4 h-4 accent-primary shrink-0" />
            <span>
              <span id={`${id}-${mode}-label`} className="block font-bold text-fg mb-1">{t(`provider.mode_${mode}`)}</span>
              <span id={`${id}-${mode}-hint`} className="block text-[12px] text-fg-muted">{t(`provider.mode_${mode}_hint`)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
