import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readImage, fitsSize, tooSmall, overflowAxis, fitImage } from '../../utils/adImageSize';

// AYK-408: checks a picked ad picture against its place's frame. A fitting picture (or a video) is
// used as it is; otherwise the picture is cut and resized to the frame and shown before and after,
// to accept, or to redo at the given size. Animated pictures are not cut (they would stop moving).
export default function AdImageFit({ file, size, onUse, onCancel }) {
  const { t } = useTranslation();
  const [state, setState] = useState({ step: 'checking' });
  const [position, setPosition] = useState('center');
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!file || !String(file.type).startsWith('image/')) { onUse(file); return undefined; }
    readImage(file).then(async info => {
      if (!alive) return;
      if (fitsSize(info, size)) { URL.revokeObjectURL(info.url); onUse(file); return; }
      const animated = /gif|apng/i.test(file.type);
      setState({ step: 'ask', info, animated });
    }).catch(() => { if (alive) onUse(file); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, size.width, size.height]);

  const [fitted, setFitted] = useState(null);
  useEffect(() => {
    let alive = true;
    if (state.step !== 'ask' || state.animated) return undefined;
    fitImage(state.info.img, size, position, file.name).then(out => {
      if (!alive) return;
      setFitted(previous => { if (previous?.url) URL.revokeObjectURL(previous.url); return { file: out, url: URL.createObjectURL(out) }; });
    });
    return () => { alive = false; };
  }, [state, position, size, file]);
  useEffect(() => () => { if (state.info?.url) URL.revokeObjectURL(state.info.url); }, [state]);

  if (state.step !== 'ask') return null;
  const { info, animated } = state;
  const ratioText = t(size.key === 'narrow' ? 'ad_image.ratio_narrow' : 'ad_image.ratio_wide');
  const axis = overflowAxis(info, size);
  const options = axis === 'x'
    ? [['start', t('ad_image.pos_left')], ['center', t('ad_image.pos_center')], ['end', t('ad_image.pos_right')]]
    : [['start', t('ad_image.pos_top')], ['center', t('ad_image.pos_center')], ['end', t('ad_image.pos_bottom')]];
  const frame = { aspectRatio: `${size.width} / ${size.height}` };

  return (
    <div className="fixed inset-0 z-[5000] bg-black/50 grid place-items-center p-3" role="dialog" aria-modal="true" data-testid="ad-image-fit">
      <div className="bg-white text-slate-800 rounded-card w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-lift p-4 space-y-3">
        <h3 className="m-0 text-[16px] font-extrabold">📐 {t('ad_image.title')}</h3>
        <p className="m-0 text-[13px] leading-relaxed">
          {t('ad_image.body', { w: size.width, h: size.height, ow: info.width, oh: info.height, ratio: ratioText })}
        </p>
        {tooSmall(info, size) && <p className="m-0 text-[12.5px] font-semibold text-amber-800 bg-amber-50 rounded px-2 py-1.5">⚠️ {t('ad_image.small')}</p>}
        <div>
          <div className="text-[12px] font-bold mb-1">{t('ad_image.original')} ({info.width}×{info.height})</div>
          <img src={info.url} alt="" className="max-h-40 max-w-full rounded border border-slate-200 bg-slate-50" />
        </div>
        {animated ? (
          <p className="m-0 text-[13px] font-bold text-rose-700" role="alert">⚠️ {t('ad_image.animated', { w: size.width, h: size.height, ratio: ratioText })}</p>
        ) : (
          <>
            <div>
              <div className="text-[12px] font-bold mb-1">{t('ad_image.adjusted')} ({size.width}×{size.height})</div>
              <div className="w-full rounded border-2 border-emerald-400 overflow-hidden bg-slate-100" style={frame} data-testid="ad-image-fitted">
                {fitted && <img src={fitted.url} alt="" className="w-full h-full object-cover" />}
              </div>
            </div>
            <div>
              <div className="text-[12px] font-bold mb-1">{t('ad_image.which_part')}</div>
              <div className="flex gap-1.5 flex-wrap">
                {options.map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setPosition(value)}
                    className={`px-3 py-1 rounded-pill border text-[12.5px] font-semibold ${position === value ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-300'}`}>{label}</button>
                ))}
              </div>
            </div>
          </>
        )}
        {rejected && <p className="m-0 text-[13px] font-bold text-rose-700" role="alert" data-testid="ad-image-redo">✏️ {t('ad_image.redo', { w: size.width, h: size.height, ratio: ratioText })}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {!animated && <button type="button" disabled={!fitted} onClick={() => onUse(fitted.file)} data-testid="ad-image-accept"
            className="px-4 py-2 rounded-pill bg-emerald-600 text-white text-[13px] font-bold disabled:opacity-50">✓ {t('ad_image.accept')}</button>}
          {!rejected
            ? <button type="button" onClick={() => setRejected(true)} data-testid="ad-image-reject"
              className="px-4 py-2 rounded-pill bg-white border border-slate-300 text-[13px] font-bold">✗ {t('ad_image.reject')}</button>
            : <button type="button" onClick={onCancel} className="px-4 py-2 rounded-pill bg-white border border-slate-300 text-[13px] font-bold">{t('ad_image.close')}</button>}
          {animated && !rejected && <button type="button" onClick={onCancel} className="px-4 py-2 rounded-pill bg-white border border-slate-300 text-[13px] font-bold">{t('ad_image.close')}</button>}
        </div>
      </div>
    </div>
  );
}
