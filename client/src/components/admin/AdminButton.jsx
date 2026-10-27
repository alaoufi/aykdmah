export default function AdminButton({
  type = 'button',
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  onClick,
  className = '',
  children,
}) {
  const base = 'inline-flex items-center gap-1.5 font-semibold rounded-pill transition disabled:opacity-60 disabled:cursor-not-allowed';
  const sizes = {
    sm: 'px-3 py-1.5 text-[12px]',
    md: 'px-4 py-2 text-[13px]',
    lg: 'px-5 py-2.5 text-[14px]',
  };
  const variants = {
    primary: 'text-white shadow-soft hover:shadow-lift',
    secondary: 'bg-white border border-slate-200 text-slate-700 hover:border-brand-300 hover:text-brand-700',
    ghost: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
    success: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700',
    danger: 'bg-rose-50 hover:bg-rose-100 text-rose-700',
    warning: 'bg-amber-50 hover:bg-amber-100 text-amber-700',
  };

  const style = variant === 'primary' ? { background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' } : undefined;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={style}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {icon && <span>{icon}</span>}
      {children}
    </button>
  );
}
