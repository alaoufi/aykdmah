import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Sidebar({ items = [] }) {
  const { t } = useTranslation();
  return (
    <aside className="sidebar">
      <nav>
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end}>
            <span style={{ fontSize: 18 }}>{it.icon}</span>
            <span>{it.labelKey ? t(it.labelKey) : it.label}</span>
          </NavLink>
        ))}
      </nav>
      <style>{`
        .sidebar {
          width: var(--sidebar-w); background: var(--bg-card); border-inline-start: 1px solid var(--border);
          padding: 16px; flex-shrink: 0; min-height: calc(100vh - var(--header-h));
        }
        .sidebar nav { display: flex; flex-direction: column; gap: 4px; }
        .sidebar a {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px;
          border-radius: var(--radius); color: var(--text-secondary); font-weight: 600;
          transition: var(--transition);
        }
        .sidebar a:hover { background: var(--bg-soft); text-decoration: none; }
        .sidebar a.active { background: rgba(14, 165, 233, .12); color: var(--primary-dark); }
        @media (max-width: 768px) {
          .sidebar { width: 100%; min-height: auto; border-inline-start: 0; border-bottom: 1px solid var(--border); }
          .sidebar nav { flex-direction: row; overflow-x: auto; flex-wrap: nowrap; }
          .sidebar a { white-space: nowrap; }
        }
      `}</style>
    </aside>
  );
}
