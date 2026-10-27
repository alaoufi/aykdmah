import { Outlet } from 'react-router-dom';
import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';
import BottomNav from '../components/layout/BottomNav';
import BackButton from '../components/common/BackButton';

export default function DashboardLayout({ sidebarItems }) {
  return (
    <>
      <Header />
      <div className="dashboard-wrap">
        <Sidebar items={sidebarItems} />
        <main className="dashboard-main">
          <div className="container">
            <div className="mb-3"><BackButton /></div>
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
      <style>{`
        .dashboard-wrap { display: flex; min-height: calc(100vh - var(--header-h)); }
        .dashboard-main { flex: 1; padding: 24px 0; }
        @media (max-width: 768px) { .dashboard-wrap { flex-direction: column; } }
        @media (max-width: 767.98px) { .dashboard-main { padding-bottom: var(--mobile-nav-clearance); } }
      `}</style>
    </>
  );
}
