export default function Select({ label, error, hint, options = [], children, ...rest }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <select className="select" {...rest}>
        {children}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && !error && <div className="text-xs text-muted mt-1">{hint}</div>}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
