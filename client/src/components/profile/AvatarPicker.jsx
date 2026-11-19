import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Avatar from '../common/Avatar';
import api, { apiError } from '../../services/api';
import { askConfirm } from '../common/AppDialog';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 3.5 * 1024 * 1024;

// The person's own photo in "My profile" (AYK-161): tap to choose one from the phone or take
// one, see it at once, or remove it. A refused file says why, in red.
export default function AvatarPicker({ user, onChanged }) {
  const { t } = useTranslation();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (file) => {
    if (!file) return;
    setError('');
    if (!TYPES.includes(file.type)) { setError(t('profile.photo_bad_type')); return; }
    if (file.size > MAX_BYTES) { setError(t('profile.photo_too_big', { size: (file.size / 1048576).toFixed(1) })); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post('/users/me/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await onChanged?.();
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!(await askConfirm({ message: t('profile.photo_remove_confirm'), tone: 'danger' }))) return;
    setBusy(true);
    try { await api.put('/users/me', { avatar: null }); await onChanged?.(); }
    catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-3" data-testid="avatar-picker">
      <button type="button" onClick={() => input.current?.click()} disabled={busy}
        className="relative shrink-0 rounded-full p-0 border-0 bg-transparent cursor-pointer" aria-label={t('profile.photo_change')}>
        <Avatar src={user?.avatar} name={user?.full_name} size="lg" />
        <span className="absolute -bottom-1 -end-1 grid place-items-center w-7 h-7 rounded-full text-[14px] shadow-soft text-white"
          style={{ background: 'var(--primary)' }} aria-hidden="true">{busy ? '⏳' : '📷'}</span>
      </button>
      <div className="min-w-0">
        <h3 style={{ margin: 0 }}>{user?.full_name}</h3>
        <div className="text-sm text-muted">{user?.email}</div>
        <div className="flex flex-wrap gap-2 mt-1.5">
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="btn btn-outline btn-sm">
            📷 {t(user?.avatar ? 'profile.photo_change' : 'profile.photo_add')}
          </button>
          {user?.avatar && <button type="button" onClick={remove} disabled={busy} className="btn btn-sm text-danger">{t('profile.photo_remove')}</button>}
        </div>
        {error && <p role="alert" className="mt-1.5 mb-0 text-[12.5px] font-bold text-rose-600">⚠️ {error}</p>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
