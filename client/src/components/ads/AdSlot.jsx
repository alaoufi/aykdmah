import { localizedDefaultAdCopy } from '../../utils/localizeDefaultAd';
import { useTranslation } from 'react-i18next';
import { safeUrl } from '../../utils/urlSafety';
import { useEffect, useState } from 'react';
import { getLiveAds, trackAdView, trackAdClick } from '../../services/adService';
import { sizeForPlacement } from '../../utils/adImageSize';

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

// AYK-328: an ad arrived after the page was shown and pushed everything down (it looked like the
// page opening twice). The last ads of each place are kept on the device (they are public) and
// drawn with the page; the fresh answer then replaces them, usually with the same ad.
const CACHE_PREFIX = 'ayk_ads_';
function cachedAds(placement) {
  try {
    const rows = JSON.parse(localStorage.getItem(CACHE_PREFIX + placement) || 'null');
    return Array.isArray(rows) ? rows : null;
  } catch (_) { return null; }
}
function rememberAds(placement, rows) {
  try { localStorage.setItem(CACHE_PREFIX + placement, JSON.stringify(rows)); } catch (_) { /* private mode */ }
}

// AYK-404 (the owner: «للعميل الحرية في قبول عرض الإعلان من عدمه، زر صغير إخفاء الإعلان بدون سبب»):
// an ad the viewer hid stays hidden on this device.
const HIDDEN_KEY = 'ayk_hidden_ads';
function hiddenAds() {
  try { const ids = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'); return new Set(Array.isArray(ids) ? ids.map(Number) : []); } catch (_) { return new Set(); }
}
function hideAd(id) {
  try { const ids = [...hiddenAds(), Number(id)].slice(-300); localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids)); } catch (_) { /* private mode: this visit only */ }
}
const visible = rows => { const hidden = hiddenAds(); return (rows || []).filter(ad => !hidden.has(Number(ad.id))); };

export default function AdSlot({ placement, className = '', maxAds = 1 }) {
  const { t, i18n } = useTranslation();
  const [ads, setAds] = useState(() => visible(cachedAds(placement)).slice(0, maxAds));
  const [loaded, setLoaded] = useState(() => cachedAds(placement) !== null);

  useEffect(() => {
    let alive = true;
    getLiveAds(placement)
      .then((data) => {
        rememberAds(placement, (data || []).slice(0, maxAds + 5));
        if (alive) { setAds(visible(data).slice(0, maxAds)); setLoaded(true); }
      })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [placement, maxAds]);

  useEffect(() => {
    for (const ad of ads) if (!alreadySeen(ad.id)) trackAdView(ad.id);
  }, [ads]);

  if (!loaded || !ads.length) return null;
  const frame = sizeForPlacement(placement);

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
            {/* AYK-408: each place shows its ad in a fixed frame (the size asked at upload), so a
                picture never stretches the place; one of another shape is cut, never deformed. */}
            {ad.image && (
              <div className="w-full overflow-hidden" style={{ aspectRatio: `${frame.width} / ${frame.height}`, maxHeight: frame.key === 'wide' ? 400 : undefined }}>
                <AdMedia url={ad.image} type={ad.media_type} className="w-full h-full object-cover" />
              </div>
            )}
            {(copy.title || copy.description) && (
              <div className={ad.image
                ? 'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white'
                : 'min-h-[100px] bg-primary px-4 pb-4 pt-9 text-primary-fg'}>
                {copy.title && <div className="font-bold text-[14px]">{copy.title}</div>}
                {copy.description && <div className="text-[12px] opacity-90 line-clamp-2">{copy.description}</div>}
              </div>
            )}
            {/* AYK-404: the administration's own (promotional) ads carry no «إعلان» mark; paid ads do. */}
            {!(ad.promo === true || Number(ad.promo) === 1) && (
              <span className="absolute top-2 px-2 py-0.5 rounded-pill bg-black/40 text-white text-[10px] font-semibold backdrop-blur"
                style={{ insetInlineEnd: 40, top: 8 }}>
                {t('common.advertisement')}
              </span>
            )}
            <button type="button" aria-label={t('ads.hide')} title={t('ads.hide')} data-testid="ad-hide"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); hideAd(ad.id); setAds(previous => previous.filter(row => row.id !== ad.id)); }}
              className="absolute w-7 h-7 rounded-full bg-black/45 text-white text-[14px] leading-none grid place-items-center backdrop-blur hover:bg-black/65"
              style={{ insetInlineEnd: 8, top: 6 }}>✕</button>
          </a>
        );
      })}
    </div>
  );
}
