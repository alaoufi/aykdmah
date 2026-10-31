import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SmartDropdown from '../common/SmartDropdown';

// ⋮ in the chat header: the less used actions (home, save contact, block, tracking) in one
// menu, so the header keeps the name readable and only the call buttons beside it.
export default function ChatHeaderMenu({ children }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  return (
    <>
      <button ref={btnRef} type="button" className="chat-icon-btn" onClick={() => setOpen(v => !v)} data-testid="chat-menu"
        aria-label={t('common.more')} title={t('common.more')} aria-expanded={open}>⋮</button>
      <SmartDropdown anchorRef={btnRef} open={open} onClose={() => setOpen(false)} minWidth={220}>
        <div className="chat-menu" onClick={() => setOpen(false)}>{children}</div>
      </SmartDropdown>
    </>
  );
}
