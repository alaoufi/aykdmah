import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SmartDropdown from '../common/SmartDropdown';

// ⋮ in the chat header and on the chats list (AYK-133): the less used actions in one menu, so
// the header keeps the name readable. buttonRef lets another panel open from the same ⋮.
export default function ChatHeaderMenu({ children, buttonRef }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ownRef = useRef(null);
  const btnRef = buttonRef || ownRef;
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
