import usePublicSettings from '../../hooks/usePublicSettings';
import { nativeAppVersion, playStoreAppLink } from '../../utils/nativeApp';

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
// footer (AYK-341, the owner): the badges in the site's footer, on the dark ground, instead of a
// box on the home page.
export default function StoreBadges({ className = '', footer = false, playApp = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '') }) {
  const { settings } = usePublicSettings();
  if (nativeAppVersion()) return null;
  const playWeb = safeStoreUrl(settings.google_play_url, ['play.google.com']);
  // AYK-351: on an Android phone the badge opens the Play Store app, not its web page.
  const play = playApp && playWeb ? playStoreAppLink(playWeb) : playWeb;
  const apple = safeStoreUrl(settings.app_store_url, ['apps.apple.com']);
  // AYK-457 (the owner, with the two official badges: «فقط تضيف الأيقونة والرابط بدون شرح، مرتّبة
  // أسفل»): the two store badges as the stores draw them, one under the other, same width, no heading
  // or explanation around them; a store without its link yet is not shown.
  const badge = (href, icon, small, big, testId) => (
    <a href={href} target={href.startsWith('intent:') ? undefined : '_blank'} rel="noopener noreferrer" dir="ltr" aria-label={big}
      className={`inline-flex items-center gap-2.5 w-[168px] h-[50px] px-3 rounded-[9px] bg-black text-white no-underline transition hover:-translate-y-0.5 ${footer ? 'border border-white/30' : 'shadow-soft'}`}
      data-testid={testId}>
      {icon}
      <span className="flex flex-col leading-none text-start">
        <span className="text-[10px] tracking-wide">{small}</span>
        <span className="text-[19px] font-semibold mt-0.5">{big}</span>
      </span>
    </a>
  );
  if (!play && !apple) return null;
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`} data-testid="store-badges">
      {play && badge(play, <PlayIcon />, 'GET IT ON', 'Google Play', 'badge-google-play')}
      {apple && badge(apple, <AppleIcon />, 'Download on the', 'App Store', 'badge-app-store')}
    </div>
  );
}
