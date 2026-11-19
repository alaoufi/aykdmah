import { safeUrl } from '../../utils/urlSafety';
import { initialsOf } from '../../utils/formatters';

export default function Avatar({ src, name = '', size = '' }) {
  const cls = `avatar ${size === 'lg' ? 'avatar-lg' : size === 'sm' ? 'avatar-sm' : ''}`;
  return (
    <div className={cls}>
      {safeUrl(src) ? <img src={safeUrl(src)} alt={name} referrerPolicy="no-referrer" /> : <span>{initialsOf(name)}</span>}
    </div>
  );
}
