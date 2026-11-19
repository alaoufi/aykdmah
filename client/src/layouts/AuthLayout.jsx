import LanguageSwitcher from '../components/common/LanguageSwitcher';
import { Outlet, Link } from 'react-router-dom';
import BrandLogo from '../components/common/BrandLogo';
import BackButton from '../components/common/BackButton';

export default function AuthLayout() {
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 shrink-0">
            <BackButton fallback="/" hideOnRoot={false} />
            <LanguageSwitcher variant="compact" />
          </div>
          <Link to="/" className="auth-logo" style={{ marginBottom: 0 }}>
            <BrandLogo wordSize={26} />
          </Link>
        </div>
        <Outlet />
      </div>
      <style>{`
        .auth-layout {
          min-height: 100vh; display: grid; place-items: center; padding: 24px;
          background: linear-gradient(160deg,
            rgb(var(--color-primary-from)) 0%,
            rgb(var(--color-primary-to))   55%,
            rgb(var(--color-bg))           100%);
        }
        .auth-card {
          background: rgb(var(--color-surface));
          border-radius: 22px;
          padding: 28px 24px; max-width: 460px; width: 100%;
          box-shadow: 0 20px 60px rgba(0,0,0,.18);
          border: 1px solid rgb(var(--color-border));
        }
        .auth-logo {
          display: inline-flex; align-items: center; gap: 8px; margin-bottom: 20px;
        }
        .auth-logo:hover { text-decoration: none; }
      `}</style>
    </div>
  );
}
