import { Outlet, useLocation } from 'react-router-dom';
import Header from '../components/layout/Header';
import UpdateBar from '../components/common/UpdateBar';
import AppUpdateGate from '../components/common/AppUpdateGate';
import DevicePermissions from '../components/common/DevicePermissions';
import Footer from '../components/layout/Footer';
import BottomNav from '../components/layout/BottomNav';
import BackButton from '../components/common/BackButton';
import SupportWhatsApp from '../components/support/SupportWhatsApp';
import SbcVerified from '../components/common/SbcVerified';

export default function MainLayout() {
  // AYK-468: the floating support WhatsApp, except in the chats, where it would cover the typing box.
  const { pathname } = useLocation();
  const floatSupport = !pathname.startsWith('/chat');
  return (
    <>
      <Header />
      <UpdateBar />
      <AppUpdateGate />
      <DevicePermissions variant="bar" />
      {/* AYK-349: the footer under it already keeps clear of the bottom bar; no second gap here. */}
      <main className="site-main">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 pt-3">
          <BackButton />
        </div>
        <Outlet />
      </main>
      <Footer />
      <BottomNav />
      {floatSupport && <SbcVerified />}
      {floatSupport && <SupportWhatsApp variant="float" testId="support-whatsapp-float" />}
    </>
  );
}
