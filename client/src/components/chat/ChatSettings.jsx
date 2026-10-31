import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SmartDropdown from '../common/SmartDropdown';
import { CHAT_SIZES, saveChatPrefs, useChatPrefs } from '../../utils/chatPrefs';

// ⚙️ in the chat header (AYK-126): the size of the messages' text, from small to very large,
// and the automatic translation of the other side's messages. Saved on this device.
export default function ChatSettings() {
  const { t } = useTranslation();
  const prefs = useChatPrefs();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  // The first letter of the reader's own language, at each size.
  const sample = Array.from(t('chat.text_size_preview'))[0];
  const chip = active => `flex-1 min-w-[44px] px-1 py-2 rounded-pill border ${active ? 'border-primary bg-primary-soft font-bold' : 'border-border'}`;

  return (
    <>
      <button ref={btnRef} type="button" className="track-btn" onClick={() => setOpen(v => !v)} data-testid="chat-settings"
        aria-label={t('chat.settings')} title={t('chat.settings')} aria-expanded={open}>⚙️</button>
      <SmartDropdown anchorRef={btnRef} open={open} onClose={() => setOpen(false)} minWidth={280}>
        <div className="px-3 py-2 space-y-4 text-fg">
          <section>
            <div className="text-[13px] font-bold mb-2">🔠 {t('chat.text_size')}</div>
            <div className="flex gap-1 items-end" dir="ltr">
              {Object.entries(CHAT_SIZES).map(([size, px]) => (
                <button key={size} type="button" aria-pressed={prefs.size === size} aria-label={t(`chat.text_size_${size}`)}
                  title={t(`chat.text_size_${size}`)} className={chip(prefs.size === size)} style={{ fontSize: px }}
                  onClick={() => saveChatPrefs({ size })} data-testid={`chat-size-${size}`}>
                  {sample}
                </button>
              ))}
            </div>
            <p className="mt-2 mb-0 rounded-card bg-surface-alt p-2" style={{ fontSize: 'var(--chat-font, 16px)' }}>
              {t('chat.text_size_preview')}
            </p>
          </section>
          <label className="flex items-center justify-between gap-3 text-[13px] cursor-pointer">
            <span>
              <span className="font-bold">🌐 {t('chat.auto_translate')}</span>
              <span className="block text-[12px] text-fg-muted">{t('chat.auto_translate_hint')}</span>
            </span>
            <input type="checkbox" className="w-5 h-5 accent-primary shrink-0" checked={prefs.translate}
              onChange={e => saveChatPrefs({ translate: e.target.checked })} data-testid="chat-auto-translate" />
          </label>
        </div>
      </SmartDropdown>
    </>
  );
}
