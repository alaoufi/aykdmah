import { useState, useId } from 'react';
import { useTranslation } from 'react-i18next';

// Password input with an inline 👁/🙈 toggle. Same API as common/Input
// (label, error, hint, value, onChange) plus a `name` for browser autofill.
// Direction-aware: the eye button sits on the inline-end edge so it
// flips automatically between LTR and RTL.
export default function PasswordInput({
  label, error, hint, value, onChange, name = 'password',
  autoComplete = 'current-password', required = false, minLength, placeholder,
  className = '',
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const [show, setShow] = useState(false);
  return (
    <div className="form-group">
      {label && <label htmlFor={inputId} className="form-label">{label}</label>}
      <div style={{ position: 'relative' }}>
        <input
          id={inputId}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          name={name}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          className={`input ${className}`}
          style={{ paddingInlineEnd: '44px' }}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? t('auth.hide_password') : t('auth.show_password')}
          aria-pressed={show}
          style={{
            position: 'absolute',
            insetInlineEnd: '6px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '34px', height: '34px',
            display: 'grid', placeItems: 'center',
            border: 0, background: 'transparent',
            color: 'var(--text-secondary, #64748b)',
            cursor: 'pointer', borderRadius: '8px',
            fontSize: '18px', lineHeight: 1,
          }}
        >
          {show ? '🙈' : '👁️'}
        </button>
      </div>
      {hint && !error && <div className="text-xs text-muted mt-1">{hint}</div>}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
