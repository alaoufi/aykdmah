import { Outlet } from 'react-router-dom';
import Header from '../components/layout/Header';
import CallAlerts from '../components/notifications/CallAlerts';
import Footer from '../components/layout/Footer';
import BottomNav from '../components/layout/BottomNav';
import BackButton from '../components/common/BackButton';

export default function MainLayout() {
  return (
    <>
      <Header />
      <CallAlerts variant="banner" />
      <main>
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 pt-3">
          <BackButton />
        </div>
        <Outlet />
      </main>
      <Footer />
      <BottomNav />
    </>
  );
}
