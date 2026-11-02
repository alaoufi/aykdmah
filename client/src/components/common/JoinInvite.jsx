import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// An invitation to join (AYK-158): visitors browse freely, and only when they want to request or
// offer a service are they asked to sign up, with what they gain, in place of a bare sign-in page.
//   intent: 'request' (asking for a service), 'offer' (offering one) or 'general'
//   compact: a card inside a page; otherwise a full page of its own
export default function JoinInvite({ intent = 'general', from, compact = false }) {
  const { t } = useTranslation();
  const state = from ? { from } : undefined;
  const providerFirst = intent === 'offer';
  const benefits = [1, 2, 3].map((n) => t(`join.${intent}_b${n}`));
  const roles = [
    { role: 'client', icon: '🙋', label: t('join.as_client'), hint: t('join.as_client_hint') },
    { role: 'provider', icon: '🛠️', label: t('join.as_provider'), hint: t('join.as_provider_hint') },
  ];
  if (providerFirst) roles.reverse();

  const body = (
    <div className="text-center">
      <div className="mx-auto mb-3 grid place-items-center w-16 h-16 rounded-full bg-brand-50 text-[32px]" aria-hidden="true">
        {intent === 'offer' ? '🛠️' : intent === 'request' ? '✨' : '👋'}
      </div>
      <h2 className="m-0 text-[20px] font-extrabold text-fg leading-snug">{t(`join.title_${intent}`)}</h2>
      <p className="mt-2 mb-4 text-[14px] text-fg-muted leading-relaxed">{t(`join.subtitle_${intent}`)}</p>
      {benefits.length > 0 && (
        <ul className="m-0 mb-5 p-0 list-none space-y-2 text-start max-w-xs mx-auto">
          {benefits.map((line) => (
            <li key={line} className="flex items-start gap-2 text-[13.5px] text-fg"><span className="text-success">✓</span><span>{line}</span></li>
          ))}
        </ul>
      )}
      <div className="grid gap-2.5 max-w-sm mx-auto">
        {roles.map(({ role, icon, label, hint }, index) => (
          <Link key={role} to={`/register?role=${role}`} state={state} data-testid={`join-${role}`}
            className={`flex items-center gap-3 px-4 py-3 rounded-card no-underline text-start transition shadow-soft hover:shadow-lift ${
              index === 0 ? 'text-white' : 'bg-surface border-2 border-brand-200 text-fg'
            }`}
            style={index === 0 ? { background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' } : undefined}>
            <span className="text-[24px]" aria-hidden="true">{icon}</span>
            <span className="min-w-0">
              <span className="block font-extrabold text-[15px]">{label}</span>
              <span className={`block text-[12px] ${index === 0 ? 'text-white/85' : 'text-fg-muted'}`}>{hint}</span>
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-4 mb-0 text-[13px] text-fg-muted">
        {t('join.have_account')}{' '}
        <Link to="/login" state={state} className="font-bold text-primary">{t('nav.login')}</Link>
      </p>
      <p className="mt-2 mb-0 text-[12px] text-fg-muted">🎁 {t('join.free_note')}</p>
    </div>
  );

  if (compact) return <div className="card mb-4 p-5" data-testid="join-invite">{body}</div>;
  return (
    <main className="container max-w-lg mx-auto px-4 py-8" data-testid="join-invite">
      <div className="card p-6">{body}</div>
      <p className="mt-4 text-center text-[13px]"><Link to="/" className="text-fg-muted">← {t('join.keep_browsing')}</Link></p>
    </main>
  );
}
