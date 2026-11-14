import { useTranslation } from 'react-i18next';
import usePublicSettings from '../../hooks/usePublicSettings';
import { nativeAppVersion } from '../../utils/nativeApp';

const safeStoreUrl = (value, hosts) => {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && hosts.includes(url.hostname) ? url.href : '';
  } catch (_) { return ''; }
};

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
    <path fill="#34A853" d="M3.6 2.2 13.4 12l-9.8 9.8c-.4-.2-.6-.6-.6-1.1V3.3c0-.5.2-.9.6-1.1Z" />
    <path fill="#FBBC04" d="m16.7 15.3-3.3-3.3 3.3-3.3 3.7 2.1c1 .6 1 1.8 0 2.4l-3.7 2.1Z" />
    <path fill="#EA4335" d="M16.7 15.3 13.4 12l-9.8 9.8c.4.2.9.2 1.4-.1l11.7-6.4Z" />
    <path fill="#4285F4" d="M16.7 8.7 5 2.3c-.5-.3-1-.3-1.4-.1l9.8 9.8 3.3-3.3Z" />
  </svg>
);
const AppleIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor">
    <path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.5-3.9ZM14 5.4c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4Z" />
  </svg>
);

// «حمّل التطبيق» (AYK-227): the Google Play and App Store pages, from the admin settings. Shown on
// the website only: inside the apps it is pointless, and Apple refuses an iPhone app that links to
// Google Play. A store without a link yet shows «قريبًا».
export default function StoreBadges({ className = '' }) {
  const { t } = useTranslation();
  const { settings } = usePublicSettings();
  if (nativeAppVersion()) return null;
  const play = safeStoreUrl(settings.google_play_url, ['play.google.com']);
  const apple = safeStoreUrl(settings.app_store_url, ['apps.apple.com']);
  const badge = (href, icon, small, big, testId) => {
    const body = (
      <>
        {icon}
        <span className="flex flex-col leading-tight text-start">
          <span className="text-[10.5px] opacity-80">{small}</span>
          <span className="text-[16px] font-bold" dir="ltr">{big}</span>
        </span>
      </>
    );
    const base = 'inline-flex items-center gap-2.5 min-w-[170px] px-4 py-2 rounded-xl bg-black text-white no-underline shadow-soft transition';
    return href
      ? <a href={href} target="_blank" rel="noopener noreferrer" className={`${base} hover:-translate-y-0.5 hover:shadow-lift`} data-testid={testId}>{body}</a>
      : <span className={`${base} opacity-60 cursor-default`} data-testid={testId} aria-disabled="true">{body}</span>;
  };
  return (
    <section className={`container max-w-5xl mx-auto px-4 ${className}`} data-testid="store-badges">
      <div className="rounded-card border border-border bg-surface px-4 py-4 flex flex-wrap items-center justify-center gap-3 text-center">
        <p className="basis-full m-0 text-[15px] font-extrabold text-fg">📲 {t('home.get_app')}</p>
        {badge(play, <PlayIcon />, t('home.get_it_on'), 'Google Play', 'badge-google-play')}
        {badge(apple, <AppleIcon />, apple ? t('home.download_on') : t('home.coming_soon'), 'App Store', 'badge-app-store')}
      </div>
    </section>
  );
}
