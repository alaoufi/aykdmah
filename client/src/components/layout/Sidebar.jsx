import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AdSlot from '../ads/AdSlot';

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
      {/* The dashboards' side column (AYK-159); not on phones, where it is a row of tabs. */}
      <div className="hidden md:block mt-4"><AdSlot placement="sidebar" /></div>
      <style>{`
        .sidebar {
          width: var(--sidebar-w); background: var(--primary-tint); border-inline-start: 1px solid var(--border);
          padding: 16px; flex-shrink: 0; min-height: calc(100vh - var(--header-h));
        }
        .sidebar nav { display: flex; flex-direction: column; gap: 4px; }
        .sidebar a {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px;
          border-radius: var(--radius); color: var(--text-secondary); font-weight: 600;
          transition: var(--transition);
        }
        .sidebar a, .sidebar a:hover { text-decoration: none !important; }
        .sidebar a:hover { background: var(--bg-card); }
        /* The open tab in the chosen colour (AYK-160). */
        .sidebar a.active { background: var(--primary); color: var(--primary-fg); box-shadow: var(--shadow-sm); }
        @media (max-width: 768px) {
          .sidebar { width: 100%; min-height: auto; border-inline-start: 0; border-bottom: 1px solid var(--border); }
          /* Swiped sideways without a visible scrollbar (it showed as a black line, AYK-144). */
          .sidebar nav { flex-direction: row; overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; -ms-overflow-style: none; }
          .sidebar nav::-webkit-scrollbar { display: none; }
          .sidebar a { white-space: nowrap; }
        }
      `}</style>
    </aside>
  );
}
