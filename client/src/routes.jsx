import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import DashboardLayout from './layouts/DashboardLayout';
import AuthLayout from './layouts/AuthLayout';
import AdminLayout from './layouts/AdminLayout';
import ErrorBoundary from './components/common/ErrorBoundary';
import { useAuth } from './hooks/useAuth';
import { LoadingState } from './components/common/Spinner';
import { canRequestService } from './utils/canRequest';

const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const OpportunitiesPage = lazy(() => import('./pages/ServicesPage'));
const CreateRequestPage = lazy(() => import('./pages/CreateRequestPage'));
const RequestDetailsPage = lazy(() => import('./pages/RequestDetailsPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const PolicyPage = lazy(() => import('./pages/PolicyPage'));
const ProvidersMapPage = lazy(() => import('./pages/ProvidersMapPage'));
const TestCheckoutPage = lazy(() => import('./pages/TestCheckoutPage'));
const ProviderProfilePage = lazy(() => import('./pages/ProviderProfilePage'));
const GuidePage = lazy(() => import('./pages/GuidePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// AYK services catalog
const ServicesCatalogPage = lazy(() => import('./pages/services/ServicesCatalogPage'));
const CategoryServicesPage = lazy(() => import('./pages/services/CategoryServicesPage'));
const ServiceDetailsPage = lazy(() => import('./pages/services/ServiceDetailsPage'));

const MyRequestsPage = lazy(() => import('./pages/client/MyRequestsPage'));
const DirectoryPage = lazy(() => import('./pages/client/DirectoryPage'));
const ProviderDashboardPage = lazy(() => import('./pages/provider/ProviderDashboardPage'));
const ProviderServicesPage = lazy(() => import('./pages/provider/ProviderServicesPage'));
const SubscriptionPage = lazy(() => import('./pages/provider/SubscriptionPage'));
const ProviderBadgesPage = lazy(() => import('./pages/provider/ProviderBadgesPage'));
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminRequestsPage = lazy(() => import('./pages/admin/AdminRequestsPage'));
const AdminCategoriesPage = lazy(() => import('./pages/admin/AdminCategoriesPage'));
const AdminServicesPage = lazy(() => import('./pages/admin/AdminServicesPage'));
const AdminPlansPage = lazy(() => import('./pages/admin/AdminPlansPage'));
const AdminVerificationsPage = lazy(() => import('./pages/admin/AdminVerificationsPage'));
const AdminAdsPage = lazy(() => import('./pages/admin/AdminAdsPage'));
const AdminActivityLogsPage = lazy(() => import('./pages/admin/AdminActivityLogsPage'));
const AdminReviewsPage = lazy(() => import('./pages/admin/AdminReviewsPage'));
const AdminDisputesPage = lazy(() => import('./pages/admin/AdminDisputesPage'));
const AdminIntegrationsPage = lazy(() => import('./pages/admin/AdminIntegrationsPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));
const AdminBadgesPage = lazy(() => import('./pages/admin/AdminBadgesPage'));
const AdminCountriesPage = lazy(() => import('./pages/admin/AdminCountriesPage'));
const AdminLocationsPage = lazy(() => import('./pages/admin/AdminLocationsPage'));
const AdminConversationsPage = lazy(() => import('./pages/admin/AdminConversationsPage'));
const AdminCallsPage = lazy(() => import('./pages/admin/AdminCallsPage'));
const AdminWalletsPage = lazy(() => import('./pages/admin/AdminWalletsPage'));
const AdminMarketingPage = lazy(() => import('./pages/admin/AdminMarketingPage'));
const AdminSupportPage = lazy(() => import('./pages/admin/AdminSupportPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
const WalletPage = lazy(() => import('./pages/provider/WalletPage'));
const TrackingPage = lazy(() => import('./pages/TrackingPage'));
const VerificationPage = lazy(() => import('./pages/VerificationPage'));
const DisputeOpenPage = lazy(() => import('./pages/DisputeOpenPage'));
const DisputeDetailsPage = lazy(() => import('./pages/DisputeDetailsPage'));
const MyDisputesPage = lazy(() => import('./pages/MyDisputesPage'));
const PromotePage = lazy(() => import('./pages/PromotePage'));

function Protected({ children, roles, loginPath = '/login' }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to={loginPath} replace state={{ from: location.pathname + location.search + location.hash }} />;
  // A "both" account is a provider that may also use the requester pages.
  const allowed = !roles || roles.includes(user.role) || (roles.includes('client') && isBothAccount(user));
  if (!allowed) return <Navigate to="/" replace />;
  // A generated first password must be replaced before anything else.
  if (Number(user.must_change_password) === 1 && location.pathname !== '/profile') return <Navigate to="/profile" replace />;
  return children;
}

// A provider-only account works from its own panel; the home page and the
// catalogue of all professions are for requesters (AYK-040).
function RequesterPage({ children }) {
  const { user } = useAuth();
  return canRequestService(user) ? children : <Navigate to="/provider" replace />;
}

const isBothAccount = user => user?.role === 'provider' && Number(user.also_client) === 1;

const CLIENT_SIDEBAR = [
  { to: '/client', icon: '📋', labelKey: 'nav.my_requests', end: true },
  { to: '/requests/new', icon: '➕', labelKey: 'request.create_title' },
  { to: '/directory', icon: '📒', labelKey: 'requester.directory_title' },
  { to: '/chat', icon: '💬', labelKey: 'nav.chat' },
  { to: '/notifications', icon: '🔔', labelKey: 'nav.notifications' },
  { to: '/promote', icon: '📣', labelKey: 'nav.promote' },
  { to: '/profile', icon: '👤', labelKey: 'nav.profile' },
];

const PROVIDER_SIDEBAR = [
  { to: '/provider', icon: '📊', labelKey: 'nav.dashboard', end: true },
  { to: '/opportunities', icon: '🔍', labelKey: 'work.requests_nav' },
  { to: '/provider/subscription', icon: '⭐', labelKey: 'nav.subscription' },
  { to: '/provider/wallet', icon: '💰', labelKey: 'wallet.nav' },
  { to: '/provider/badges', icon: '🛡️', labelKey: 'nav.badges' },
  { to: '/promote', icon: '📣', labelKey: 'nav.promote' },
  { to: '/chat', icon: '💬', labelKey: 'nav.chat' },
  { to: '/notifications', icon: '🔔', labelKey: 'nav.notifications' },
  { to: '/profile', icon: '👤', labelKey: 'nav.profile' },
];

// "Both" accounts keep the provider menu with the requester entries added.
const BOTH_SIDEBAR = [
  PROVIDER_SIDEBAR[0],
  { to: '/client', icon: '📋', labelKey: 'nav.my_requests', end: true },
  { to: '/requests/new', icon: '➕', labelKey: 'request.create_title' },
  { to: '/directory', icon: '📒', labelKey: 'requester.directory_title' },
  ...PROVIDER_SIDEBAR.slice(1),
];

function RoleDashboard() {
  const { user } = useAuth();
  const items = isBothAccount(user) ? BOTH_SIDEBAR : user?.role === 'provider' ? PROVIDER_SIDEBAR : CLIENT_SIDEBAR;
  return <DashboardLayout sidebarItems={items} />;
}

export default function AppRoutes() {
  const { pathname } = useLocation();
  return (
    <Suspense fallback={<LoadingState />}>
      <ErrorBoundary key={pathname}>
      <Routes key={pathname}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        {/* Standalone admin login (no AuthLayout — has its own dark design) */}
        <Route path="/admin/login" element={<AdminLoginPage />} />

        <Route element={<MainLayout />}>
          <Route path="/" element={<RequesterPage><HomePage /></RequesterPage>} />
          <Route path="/privacy" element={<PolicyPage kind="privacy" />} />
          <Route path="/terms" element={<PolicyPage kind="terms" />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/providers/map" element={<ProvidersMapPage />} />
          <Route path="/payments/test/:id" element={<Protected><TestCheckoutPage /></Protected>} />
          <Route path="/providers/:id" element={<ProviderProfilePage />} />
          {/* AYK services catalog */}
          <Route path="/services" element={<RequesterPage><ServicesCatalogPage /></RequesterPage>} />
          <Route path="/services/category/:slug" element={<RequesterPage><CategoryServicesPage /></RequesterPage>} />
          <Route path="/services/:id" element={<ServiceDetailsPage />} />
          {/* Provider opportunities = browse open client requests (legacy services list) */}
          <Route path="/opportunities" element={<OpportunitiesPage />} />
          <Route path="/requests/:id" element={<RequestDetailsPage />} />
          <Route path="/requests/:id/review" element={<Protected><ReviewPage /></Protected>} />
          <Route path="/requests/new" element={<Protected><CreateRequestPage /></Protected>} />
          <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
          <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
          <Route path="/verify" element={<Protected><VerificationPage /></Protected>} />
          <Route path="/disputes" element={<Protected><MyDisputesPage /></Protected>} />
          <Route path="/disputes/new/:requestId" element={<Protected><DisputeOpenPage /></Protected>} />
          <Route path="/disputes/:id" element={<Protected><DisputeDetailsPage /></Protected>} />
          <Route path="/promote" element={<Protected><PromotePage /></Protected>} />
          <Route path="/support" element={<Protected><SupportPage /></Protected>} />
          <Route path="/support/:id" element={<Protected><SupportPage /></Protected>} />
          <Route path="/directory" element={<Protected><RequesterPage><DirectoryPage /></RequesterPage></Protected>} />
        </Route>

        <Route path="/chat" element={<Protected><ChatPage /></Protected>} />
        <Route path="/chat/:id" element={<Protected><ChatPage /></Protected>} />
        <Route path="/requests/:id/track" element={<Protected><TrackingPage /></Protected>} />

        <Route element={<Protected roles={['client', 'admin']}><RoleDashboard /></Protected>}>
          <Route path="/client" element={<MyRequestsPage />} />
        </Route>

        <Route element={<Protected roles={['provider']}><RoleDashboard /></Protected>}>
          <Route path="/provider" element={<ProviderDashboardPage />} />
          <Route path="/provider/services" element={<ProviderServicesPage />} />
          <Route path="/provider/subscription" element={<SubscriptionPage />} />
          <Route path="/provider/wallet" element={<WalletPage />} />
          <Route path="/provider/badges" element={<ProviderBadgesPage />} />
        </Route>

        {/* Admin area — uses dedicated AdminLayout and redirects to /admin/login when not authenticated */}
        <Route element={<Protected roles={['admin']} loginPath="/admin/login"><AdminLayout /></Protected>}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/requests" element={<AdminRequestsPage />} />
          <Route path="/admin/categories" element={<AdminCategoriesPage />} />
          <Route path="/admin/services" element={<AdminServicesPage />} />
          <Route path="/admin/plans" element={<AdminPlansPage />} />
          <Route path="/admin/verifications" element={<AdminVerificationsPage />} />
          <Route path="/admin/ads" element={<AdminAdsPage />} />
          <Route path="/admin/activity-logs" element={<AdminActivityLogsPage />} />
          <Route path="/admin/reviews" element={<AdminReviewsPage />} />
          <Route path="/admin/disputes" element={<AdminDisputesPage />} />
          <Route path="/admin/integrations" element={<AdminIntegrationsPage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
          <Route path="/admin/badges" element={<AdminBadgesPage />} />
          <Route path="/admin/countries" element={<AdminCountriesPage />} />
          <Route path="/admin/locations" element={<AdminLocationsPage />} />
          <Route path="/admin/conversations" element={<AdminConversationsPage />} />
          <Route path="/admin/support" element={<AdminSupportPage />} />
          <Route path="/admin/support/:id" element={<AdminSupportPage />} />
          <Route path="/admin/calls" element={<AdminCallsPage />} />
          <Route path="/admin/wallets" element={<AdminWalletsPage />} />
          <Route path="/admin/marketing" element={<AdminMarketingPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </ErrorBoundary>
    </Suspense>
  );
}
