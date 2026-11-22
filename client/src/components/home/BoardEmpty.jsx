import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from 'react-i18next';

// AYK-441: a board with nothing on it never says only «لا يوجد». It says what happens next and
// gives one step to take: a provider is alerted on the first request in his profession and can
// bring his own customers; a requester posts the first request; a visitor signs up.
export default function BoardEmpty({ who = 'requester', kind = 'requests' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const key = kind === 'providers' ? 'providers' : who;
  const action = {
    provider: [null, 'home.empty_provider_action'],
    requester: ['/requests/new', 'home.empty_requester_action'],
    guest: ['/register', 'home.empty_guest_action'],
    providers: ['/requests/new', 'home.empty_providers_action'],
  }[key];
  return (
    <div className="rounded-card border border-dashed border-primary/50 bg-primary-soft/40 p-4 text-center" data-testid="board-empty">
      <p className="text-[15px] font-extrabold text-fg m-0">🌱 {t(`home.empty_${key}_title`)}</p>
      <p className="text-[13px] text-fg-muted mt-1 mb-3">{t(`home.empty_${key}_hint`)}</p>
      {key === 'provider'
        // His own link to share: on the dashboard it is just below; elsewhere his public page has it.
        ? <button type="button" className="btn btn-primary btn-sm" onClick={() => {
            const here = document.getElementById('share-link');
            if (here) here.scrollIntoView({ behavior: 'smooth', block: 'center' }); else navigate(user?.id ? `/providers/${user.id}` : '/');
          }}>{t(action[1])}</button>
        : <Link to={action[0]} className="btn btn-primary btn-sm no-underline">{t(action[1])}</Link>}
    </div>
  );
}
