import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readImage, readVideo, fitsSize, tooSmall, overflowAxis, fitImage, MAX_AD_VIDEO_SECONDS } from '../../utils/adImageSize';

// AYK-408: checks a picked ad picture against its place's frame. A fitting picture is used as it
// is; otherwise the picture is cut and resized to the frame and shown before and after, to accept,
// or to redo at the given size. Animated pictures are not cut (they would stop moving).
// AYK-421 (the owner: «الأهم اختبار حجم ومناسبة الصورة أو المقطع لمكان الإعلان، ما يكون حجمه يشوّه
// الموقع»): clips are checked too (shape, size, at most MAX_AD_VIDEO_SECONDS), and the ad is shown
// in every frame it will appear in (a wide and a side place are two frames) before it is sent.
// Whatever is accepted, the site shows it in the place's fixed frame, cut and never stretched.
export default function AdImageFit({ file, size, sizes, onUse, onCancel }) {
  const { t } = useTranslation();
  const frames = Array.isArray(sizes) && sizes.length ? sizes : [size];
  const [state, setState] = useState({ step: 'checking' });
  const [position, setPosition] = useState('center');
  const [rejected, setRejected] = useState(false);
  const isVideo = String(file?.type || '').startsWith('video/');

  useEffect(() => {
    let alive = true;
    const type = String(file?.type || '');
    if (!file || !(type.startsWith('image/') || type.startsWith('video/'))) { onUse(file); return undefined; }
    const read = type.startsWith('video/') ? readVideo(file) : readImage(file);
    read.then(info => {
      if (!alive) return;
      const long = type.startsWith('video/') && Number.isFinite(info.duration) && info.duration > MAX_AD_VIDEO_SECONDS + 0.5;
      const fitsAll = frames.every(frame => fitsSize(info, frame));
      if (!long && fitsAll) { URL.revokeObjectURL(info.url); onUse(file); return; }
      setState({ step: 'ask', info, long, animated: /gif|apng/i.test(type) });
    }).catch(() => { if (alive) onUse(file); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, size.width, size.height, frames.map(f => f.key).join(',')]);

  const [fitted, setFitted] = useState(null);
  useEffect(() => {
    let alive = true;
    if (state.step !== 'ask' || state.animated || isVideo) return undefined;
    fitImage(state.info.img, size, position, file.name).then(out => {
      if (!alive) return;
      setFitted(previous => { if (previous?.url) URL.revokeObjectURL(previous.url); return { file: out, url: URL.createObjectURL(out) }; });
    });
    return () => { alive = false; };
  }, [state, position, size, file, isVideo]);
  useEffect(() => () => { if (state.info?.url) URL.revokeObjectURL(state.info.url); }, [state]);

  if (state.step !== 'ask') return null;
  const { info, animated, long } = state;
  const ratioText = t(size.key === 'narrow' ? 'ad_image.ratio_narrow' : 'ad_image.ratio_wide');
  const axis = overflowAxis(info, size);
  const options = axis === 'x'
    ? [['start', t('ad_image.pos_left')], ['center', t('ad_image.pos_center')], ['end', t('ad_image.pos_right')]]
    : [['start', t('ad_image.pos_top')], ['center', t('ad_image.pos_center')], ['end', t('ad_image.pos_bottom')]];
  const objectPosition = { start: axis === 'x' ? 'left center' : 'center top', center: 'center', end: axis === 'x' ? 'right center' : 'center bottom' }[position];
  const placeName = frame => t(frame.key === 'narrow' ? 'ad_image.place_narrow' : 'ad_image.place_wide');
  // The same picture or clip in each frame, as the site will show it (cut to the frame, never stretched).
  const preview = frame => (
    <div key={frame.key}>
      <div className="text-[12px] font-bold mb-1">{t('ad_image.in_place', { place: placeName(frame), w: frame.width, h: frame.height })}</div>
      <div className="w-full rounded border-2 border-emerald-400 overflow-hidden bg-slate-100" style={{ aspectRatio: `${frame.width} / ${frame.height}`, maxWidth: frame.key === 'narrow' ? 320 : undefined }}
        data-testid={`ad-fit-preview-${frame.key}`}>
        {isVideo
          ? <video src={info.url} autoPlay muted loop playsInline className="w-full h-full object-cover" />
          : (fitted || animated) && <img src={animated ? info.url : fitted.url} alt="" className="w-full h-full object-cover" style={animated ? { objectPosition } : undefined} />}
      </div>
    </div>
  );
  const blocked = long || animated;
  const canAccept = !long && (isVideo || (!animated && fitted));

  return (
    <div className="fixed inset-0 z-[5000] bg-black/50 grid place-items-center p-3" role="dialog" aria-modal="true" data-testid="ad-image-fit">
      <div className="bg-white text-slate-800 rounded-card w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-lift p-4 space-y-3">
        <h3 className="m-0 text-[16px] font-extrabold">📐 {t(long ? 'ad_image.video_long_title' : isVideo ? 'ad_image.video_title' : 'ad_image.title')}</h3>
        {long ? (
          <p className="m-0 text-[13px] font-bold text-rose-700" role="alert" data-testid="ad-video-long">
            ⏱️ {t('ad_image.video_long', { max: MAX_AD_VIDEO_SECONDS, seconds: Math.round(info.duration) })}
          </p>
        ) : (
          <p className="m-0 text-[13px] leading-relaxed">
            {t(isVideo ? 'ad_image.video_body' : 'ad_image.body', { w: size.width, h: size.height, ow: info.width, oh: info.height, ratio: ratioText })}
          </p>
        )}
        {frames.length > 1 && <p className="m-0 text-[12.5px] text-slate-600" data-testid="ad-fit-mixed">ℹ️ {t('ad_image.mixed')}</p>}
        {tooSmall(info, size) && <p className="m-0 text-[12.5px] font-semibold text-amber-800 bg-amber-50 rounded px-2 py-1.5">⚠️ {t(isVideo ? 'ad_image.video_small' : 'ad_image.small')}</p>}
        {!isVideo && (
          <div>
            <div className="text-[12px] font-bold mb-1">{t('ad_image.original')} ({info.width}×{info.height})</div>
            <img src={info.url} alt="" className="max-h-40 max-w-full rounded border border-slate-200 bg-slate-50" />
          </div>
        )}
        {animated && <p className="m-0 text-[13px] font-bold text-rose-700" role="alert">⚠️ {t('ad_image.animated', { w: size.width, h: size.height, ratio: ratioText })}</p>}
        {!long && frames.map(preview)}
        {!long && !animated && !isVideo && (
          <div>
            <div className="text-[12px] font-bold mb-1">{t('ad_image.which_part')}</div>
            <div className="flex gap-1.5 flex-wrap">
              {options.map(([value, label]) => (
                <button key={value} type="button" onClick={() => setPosition(value)}
                  className={`px-3 py-1 rounded-pill border text-[12.5px] font-semibold ${position === value ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-300'}`}>{label}</button>
              ))}
            </div>
          </div>
        )}
        {rejected && <p className="m-0 text-[13px] font-bold text-rose-700" role="alert" data-testid="ad-image-redo">✏️ {t(isVideo ? 'ad_image.video_redo' : 'ad_image.redo', { w: size.width, h: size.height, ratio: ratioText, max: MAX_AD_VIDEO_SECONDS })}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {canAccept && <button type="button" onClick={() => onUse(isVideo ? file : fitted.file)} data-testid="ad-image-accept"
            className="px-4 py-2 rounded-pill bg-emerald-600 text-white text-[13px] font-bold">✓ {t(isVideo ? 'ad_image.video_accept' : 'ad_image.accept')}</button>}
          {!rejected && !blocked
            ? <button type="button" onClick={() => setRejected(true)} data-testid="ad-image-reject"
              className="px-4 py-2 rounded-pill bg-white border border-slate-300 text-[13px] font-bold">✗ {t(isVideo ? 'ad_image.video_reject' : 'ad_image.reject')}</button>
            : <button type="button" onClick={onCancel} className="px-4 py-2 rounded-pill bg-white border border-slate-300 text-[13px] font-bold" data-testid="ad-image-close">{t('ad_image.close')}</button>}
        </div>
      </div>
    </div>
  );
}
