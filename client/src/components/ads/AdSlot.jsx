import { localizedDefaultAdCopy } from '../../utils/localizeDefaultAd';
import { useTranslation } from 'react-i18next';
import { safeUrl } from '../../utils/urlSafety';
import { useEffect, useState } from 'react';
import { getLiveAds, trackAdView, trackAdClick } from '../../services/adService';

// Renders the live ads currently configured for a given placement.
// Tracks views once per (placement,ad) per page-load so refreshes
// don't over-count.
const VIEWED_KEY = 'lsm_ad_views_seen';

function alreadySeen(id) {
  try {
    const seen = JSON.parse(sessionStorage.getItem(VIEWED_KEY) || '[]');
    if (seen.includes(id)) return true;
    seen.push(id);
    sessionStorage.setItem(VIEWED_KEY, JSON.stringify(seen.slice(-100)));
  } catch (_) { /* private mode — count once per render then */ }
  return false;
}

function AdMedia({ url, type, className = '' }) {
  url = safeUrl(url);
  if (!url) return null;
  if (type === 'video') {
    return <video src={url} autoPlay muted loop playsInline className={className} />;
  }
  return <img src={url} referrerPolicy="no-referrer" alt="" className={className} />;
}

export default function AdSlot({ placement, className = '', maxAds = 1 }) {
  const { t, i18n } = useTranslation();
  const [ads, setAds] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    getLiveAds(placement)
      .then((data) => { if (alive) { setAds((data || []).slice(0, maxAds)); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [placement, maxAds]);

  useEffect(() => {
    for (const ad of ads) if (!alreadySeen(ad.id)) trackAdView(ad.id);
  }, [ads]);

  if (!loaded || !ads.length) return null;

  const onClick = (ad, e) => {
    const link = safeUrl(ad.link);
    e.preventDefault();
    if (!link) return;
    e.preventDefault();
    trackAdClick(ad.id);
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`ad-slot space-y-3 ${className}`} data-placement={placement}>
      {ads.map((ad) => {
        const copy = localizedDefaultAdCopy(ad, i18n.resolvedLanguage);
        return (
          <a key={ad.id} href={safeUrl(ad.link) || undefined}
            onClick={(e) => onClick(ad, e)}
            rel="noopener noreferrer"
            className="block relative rounded-card overflow-hidden bg-slate-100 shadow-soft hover:shadow-lift transition group"
          >
            <AdMedia url={ad.image} type={ad.media_type}
              className="w-full max-h-72 object-cover" />
            {(copy.title || copy.description) && (
              <div className={ad.image
                ? 'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white'
                : 'min-h-[100px] bg-primary px-4 pb-4 pt-9 text-primary-fg'}>
                {copy.title && <div className="font-bold text-[14px]">{copy.title}</div>}
                {copy.description && <div className="text-[12px] opacity-90 line-clamp-2">{copy.description}</div>}
              </div>
            )}
            <span className="absolute top-2 inset-inline-end-2 px-2 py-0.5 rounded-pill bg-black/40 text-white text-[10px] font-semibold backdrop-blur"
              style={{ insetInlineEnd: 8, top: 8 }}>
              {t('common.advertisement')}
            </span>
          </a>
        );
      })}
    </div>
  );
}
