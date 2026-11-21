import { forwardRef, useId } from 'react';
import FieldLabel from './InfoTip';
const Input = forwardRef(function Input({ label, error, hint, info, className = '', as = 'input', ...rest }, ref) {
  const generatedId = useId();
  const inputId = rest.id || generatedId;
  const Comp = as === 'textarea' ? 'textarea' : 'input';
  const description = [rest['aria-describedby'], error ? `${inputId}-error` : hint ? `${inputId}-hint` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="form-group">
      {/* AYK-415: `info` adds an (i) beside the name with the full explanation. */}
      {label && (info ? <FieldLabel htmlFor={inputId} label={label} info={info} /> : <label htmlFor={inputId} className="form-label">{label}</label>)}
      <Comp id={inputId} className={as === 'textarea' ? `textarea ${className}` : `input ${className}`} {...rest}
        ref={ref} aria-invalid={error ? true : rest['aria-invalid']} aria-describedby={description} />
      {hint && !error && <div id={`${inputId}-hint`} className="text-xs text-muted mt-1">{hint}</div>}
      {error && <div id={`${inputId}-error`} className="form-error">{error}</div>}
    </div>
  );
});
export default Input;
