import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';

// AYK-479 (the owner, with the iPhone bar «اضغط زر المشاركة…»: «وين زر المشاركة؟ هل فيه فرق بين الآيفون
// والأندرويد؟ ضروري تكون الرسائل واضحة مثل هذا، اضغط هنا بزر واضح»): a button that opens the steps with
// pictures, for iPhone and for Android. The pictures are drawn here, so they work offline and in every
// language; the words are in the language files.

// The share button of Safari: a square with an arrow going up.
function ShareIcon({ size = 26, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V3" /><path d="m8 7 4-4 4 4" /><path d="M6 10H5.5A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H18" />
    </svg>
  );
}
const PlusSquare = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" />
  </svg>
);
const Pointer = () => <span aria-hidden="true" className="absolute -top-1 -end-1 text-[22px] animate-bounce" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.4))' }}>👆</span>;

function Step({ n, children, picture }) {
  const { t } = useTranslation();
  return (
    <li className="rounded-card border border-border bg-surface p-3 list-none" data-testid={`guide-step-${n}`}>
      <div className="flex items-start gap-2.5">
        <span className="shrink-0 grid place-items-center w-7 h-7 rounded-full bg-primary text-primary-fg text-[14px] font-extrabold" aria-label={t('permissions.guide_step', { n })}>{n}</span>
        <p className="m-0 text-[14px] leading-relaxed text-fg font-semibold">{children}</p>
      </div>
      {picture && <div className="mt-2.5 flex justify-center">{picture}</div>}
    </li>
  );
}

// Safari's bottom bar with the share button circled.
function SafariBar() {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-[300px] rounded-2xl bg-slate-100 border border-slate-300 px-3 py-2.5" dir="ltr" aria-hidden="true">
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-[18px]">‹</span><span className="text-[18px]">›</span>
        <span className="relative grid place-items-center w-11 h-11 rounded-full ring-4 ring-rose-500 bg-white text-sky-600">
          <ShareIcon /><Pointer />
        </span>
        <span className="text-[18px]">📖</span><span className="text-[18px]">❏</span>
      </div>
      <div className="text-center text-[11px] font-bold text-rose-600 mt-1">{t('permissions.guide_share_label')}</div>
    </div>
  );
}

// The share sheet with the «add to home screen» row.
function ShareSheet() {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-[300px] rounded-2xl bg-slate-100 border border-slate-300 overflow-hidden" aria-hidden="true">
      <div className="px-3 py-2 text-[12px] text-slate-500 border-b border-slate-300">aykdmh.sa</div>
      <div className="px-3 py-2 text-[13px] text-slate-400 border-b border-slate-200">⋯</div>
      <div className="relative px-3 py-2.5 flex items-center justify-between gap-2 bg-white ring-4 ring-rose-500 ring-inset text-slate-900 font-bold text-[13.5px]">
        <span>{t('permissions.guide_add_label')}</span><span className="text-sky-600"><PlusSquare /></span><Pointer />
      </div>
      <div className="px-3 py-2 text-[13px] text-slate-400">⋯</div>
    </div>
  );
}

// The new icon on the home screen.
function HomeIcon() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-1" aria-hidden="true">
      <span className="relative w-14 h-14 rounded-[14px] bg-white shadow-md grid place-items-center overflow-hidden ring-4 ring-rose-500"><img src="/apple-touch-icon.png" alt="" width="56" height="56" /><Pointer /></span>
      <span className="text-[11px] font-bold text-fg">{t('common.brand')}</span>
    </div>
  );
}

function ChromeMenu() {
  return (
    <div className="w-full max-w-[300px] rounded-2xl bg-slate-100 border border-slate-300 px-3 py-2" dir="ltr" aria-hidden="true">
      <div className="flex items-center justify-between text-slate-500 text-[12px]">
        <span>aykdmh.sa</span><span className="relative grid place-items-center w-10 h-10 rounded-full ring-4 ring-rose-500 bg-white text-slate-700 text-[22px] font-black leading-none">⋮<Pointer /></span>
      </div>
    </div>
  );
}

export function HomeScreenGuideButton({ className = '', defaultTab = 'iphone' }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(defaultTab);
  return (
    <>
      <button type="button" className={`btn btn-primary btn-sm ${className}`} onClick={() => setOpen(true)} data-testid="guide-open">
        📖 {t('permissions.guide_open')}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('permissions.guide_title')} width={460}>
        <div role="tablist" className="flex gap-2 mb-3">
          {[['iphone', '🍎', 'permissions.guide_tab_iphone'], ['android', '🤖', 'permissions.guide_tab_android']].map(([value, icon, key]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} data-testid={`guide-tab-${value}`}
              className={`flex-1 rounded-card px-3 py-2 border-2 text-[14px] font-extrabold transition ${tab === value ? 'border-primary bg-primary-soft text-fg' : 'border-border bg-surface text-fg-muted'}`}>
              {icon} {t(key)}
            </button>
          ))}
        </div>
        {tab === 'iphone' ? (
          <ol className="m-0 p-0 space-y-2.5" data-testid="guide-iphone">
            <Step n={1} picture={<SafariBar />}>{t('permissions.guide_ios_1')}<br /><span className="font-normal text-fg-muted text-[12.5px]">{t('permissions.guide_ios_1b')}</span></Step>
            <Step n={2} picture={<ShareSheet />}>{t('permissions.guide_ios_2')}</Step>
            <Step n={3} picture={<HomeIcon />}>{t('permissions.guide_ios_3')}</Step>
          </ol>
        ) : (
          <ol className="m-0 p-0 space-y-2.5" data-testid="guide-android">
            <Step n={1} picture={<ChromeMenu />}>{t('permissions.guide_android_1')}</Step>
            <Step n={2}>{t('permissions.guide_android_2')}</Step>
            <Step n={3}>{t('permissions.guide_android_3')}</Step>
          </ol>
        )}
        <button type="button" className="btn btn-primary btn-block mt-3" onClick={() => setOpen(false)} data-testid="guide-done">{t('permissions.guide_done')}</button>
      </Modal>
    </>
  );
}

export default HomeScreenGuideButton;
