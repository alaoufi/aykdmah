import { localizedName } from '../../utils/localize';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function CategoryGrid({ categories = [] }) {
  const { i18n } = useTranslation();
  return (
    <div className="category-grid">
      {categories.map(c => (
        <Link key={c.id} to={`/services?category=${c.id}`} className="category-tile" style={{ '--c': c.color || 'var(--primary)' }}>
          <div className="icon">{c.icon ? <span>{c.icon[0]?.toUpperCase()}</span> : '🛠️'}</div>
          <div className="name">{localizedName(c, i18n.resolvedLanguage)}</div>
        </Link>
      ))}
      <style>{`
        .category-grid {
          display: grid; gap: 14px;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        }
        .category-tile {
          background: var(--bg-card); padding: 18px 12px; border-radius: var(--radius-lg);
          text-align: center; border: 1px solid var(--border); transition: var(--transition);
          color: var(--text); text-decoration: none;
        }
        .category-tile:hover {
          transform: translateY(-3px); box-shadow: var(--shadow); border-color: var(--c);
          text-decoration: none;
        }
        .icon {
          width: 56px; height: 56px; border-radius: 16px; background: color-mix(in srgb, var(--c) 14%, transparent);
          color: var(--c); display: grid; place-items: center; margin: 0 auto 10px; font-size: 22px; font-weight: 700;
        }
        .name { font-weight: 600; font-size: 14px; }
      `}</style>
    </div>
  );
}
