import { useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { apiError } from '../../services/api';
import { IconUser, IconArrow } from '../../components/common/Icons';
import RyzaLogo from '../../components/common/RyzaLogo';
import { authReturnTarget } from '../../utils/authReturn';

function AdminPasswordField({ value, onChange, t }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id="admin-password"
        name="password"
        type={show ? 'text' : 'password'}
        required
        autoComplete="current-password"
        value={value}
        onChange={onChange}
        className="w-full px-4 py-3 rounded-card border border-slate-200 bg-slate-50 focus:bg-surface focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition text-[15px] text-ink"
        style={{ paddingInlineEnd: '48px' }}
        placeholder="••••••••"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? t('auth.hide_password') : t('auth.show_password')}
        aria-controls="admin-password"
        aria-pressed={show}
        className="absolute top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center rounded-pill text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition"
        style={{ insetInlineEnd: '4px' }}
      >
        {show ? '🙈' : '👁️'}
      </button>
    </div>
  );
}

export default function AdminLoginPage() {
  const { t } = useTranslation();
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = authReturnTarget('admin', location.state?.from);

  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const loginInFlight = useRef(false);

  const submit = async (e) => {
    e.preventDefault();
    if (loginInFlight.current) return;
    loginInFlight.current = true;
    setError('');
    setLoading(true);
    try {
      const res = await login(form);
      setForm((current) => ({ ...current, password: '' }));
      if (res.user.role !== 'admin') {
        await logout();
        setError(t('errors.forbidden'));
        return;
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      loginInFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{
        background:
          'radial-gradient(800px 600px at 100% 0%, rgb(var(--color-brand-sky) / .25), transparent 60%),' +
          'radial-gradient(700px 500px at 0% 100%, rgb(var(--color-brand-clay) / .22), transparent 60%),' +
          'linear-gradient(135deg, rgb(var(--color-brand-slate)), rgb(var(--color-brand-slate)))',
      }}
    >
      {/* Decorative blobs */}
      <span className="blob" style={{ width: 380, height: 380, top: -100, left: -80, background: 'rgb(var(--color-brand-sky))' }} />
      <span className="blob" style={{ width: 460, height: 460, bottom: -200, right: -100, background: 'rgb(var(--color-brand-clay))' }} />

      <div className="relative w-full max-w-[440px]">
        {/* Back to public site — admin login has no nav otherwise */}
        <div className="mb-3">
          <Link to="/" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-pill bg-white/10 hover:bg-white/20 text-white text-[13px] font-semibold transition no-underline">
            <span className="text-[16px] leading-none">{document.documentElement.dir === 'rtl' ? '→' : '←'}</span>
            <span>{t('common.back')}</span>
          </Link>
        </div>

        {/* Logo header */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-6">
            <RyzaLogo width={220} tone="mono-light" tagline taglineText={t('common.tagline')} />
          </div>
          <h1 className="text-white text-2xl font-extrabold">{t('nav.admin')}</h1>
          <p className="text-white/70 text-[13px] mt-1">{t('auth.admin_login_hint')}</p>
        </div>

        {/* Card */}
        <div className="bg-surface/95 backdrop-blur-xl rounded-[22px] shadow-hero border border-border p-7 md:p-8">
          {error && (
            <div role="alert" className="mb-4 px-4 py-3 rounded-card bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="admin-identifier" className="block text-[13px] font-semibold text-slate-700 mb-1.5">{t('auth.admin_identifier')}</label>
              <div className="relative">
                <span className="absolute inset-y-0 right-3 grid place-items-center text-slate-400">
                  <IconUser size={18} />
                </span>
                <input
                  id="admin-identifier"
                  name="identifier"
                  type="text"
                  required
                  autoComplete="username"
                  value={form.identifier}
                  onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                  className="w-full pr-10 pl-3 py-3 rounded-card border border-slate-200 bg-slate-50 focus:bg-surface focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition text-[15px] text-ink"
                  placeholder={t('auth.username')}
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-[13px] font-semibold text-slate-700 mb-1.5">{t('auth.password')}</label>
              <AdminPasswordField
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                t={t}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-card text-white text-[15px] font-bold shadow-soft hover:shadow-lift transition active:scale-[.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}
            >
              {loading ? `${t('common.loading')}` : (
                <>
                  {t('auth.login_button')}
                  <IconArrow size={16} className="rotate-180" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 text-center text-[13px] text-slate-500">
            <Link to="/login" className="text-brand-600 font-semibold hover:text-brand-700 no-underline">
              {t('nav.login')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
