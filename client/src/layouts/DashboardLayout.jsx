import { Outlet } from 'react-router-dom';
import Header from '../components/layout/Header';
import UpdateBar from '../components/common/UpdateBar';
import AppUpdateGate from '../components/common/AppUpdateGate';
import DevicePermissions from '../components/common/DevicePermissions';
import Sidebar from '../components/layout/Sidebar';
import BottomNav from '../components/layout/BottomNav';
import Footer from '../components/layout/Footer';
import BackButton from '../components/common/BackButton';
import { useAuth } from '../hooks/useAuth';

export default function DashboardLayout({ sidebarItems }) {
  const { user } = useAuth();
  // AYK-422 (the owner: «في لوحة مقدم الخدمة اجعل الخط غامق ليكون أكثر وضوحًا»): the provider's
  // dashboard — its tabs and every page in it — is in bold, darker text.
  const strong = user?.role === 'provider' ? ' provider-strong' : '';
  return (
    <>
      <Header />
      <UpdateBar />
      <AppUpdateGate />
      <DevicePermissions variant="bar" />
      <div className={`dashboard-wrap${strong}`}>
        <Sidebar items={sidebarItems} />
        <main className="dashboard-main">
          <div className="container">
            <div className="mb-3"><BackButton /></div>
            <Outlet />
          </div>
        </main>
      </div>
      <Footer />
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
