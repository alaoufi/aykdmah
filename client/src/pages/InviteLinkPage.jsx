import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { keepInvite } from '../utils/invite';
import { nativeAppVersion } from '../utils/nativeApp';
import { phoneOf, shortLinkTarget } from '../utils/shortLinks';

// aykdmh.com/i/<number> (AYK-354): keeps the inviter's number (30 days, until a sign-up uses it).
// AYK-509 (the owner: «ابيه يحول للمتجر حسب نظامه»): on an iPhone it leaves for the App Store, on an Android
// phone it opens the page with the big Google Play button (/app); the number is already kept, so whoever
// signs up afterwards on this phone is still counted. On a computer, inside the app, or when signed in, it
// is as before: the sign-up with the number filled in, or the home page.
export default function InviteLinkPage() {
  const { code } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const kept = user ? '' : keepInvite(code);
  const phone = !user && kept && !nativeAppVersion() ? phoneOf(typeof navigator === 'undefined' ? '' : navigator.userAgent) : '';

  useEffect(() => {
    if (!phone) return undefined;
    if (phone === 'android') { navigate('/app', { replace: true }); return undefined; }
    const go = settings => window.location.replace(shortLinkTarget('/app', navigator.userAgent, settings || {}) || '/app');
    const timer = setTimeout(() => go({}), 1500);
    fetch('/api/settings/public').then(r => r.json()).then(body => { clearTimeout(timer); go(body?.data); })
      .catch(() => { clearTimeout(timer); go({}); });
    return () => clearTimeout(timer);
  }, [phone, navigate]);

  if (phone) return null;
  return <Navigate to={kept ? `/register?ref=${encodeURIComponent(kept)}` : '/'} replace />;
}
