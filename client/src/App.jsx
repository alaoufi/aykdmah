import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { CallProvider } from './context/CallContext';
import { NotificationProvider } from './context/NotificationContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import AppRoutes from './routes';
import AppDialogHost from './components/common/AppDialog';

function SessionApp() {
  const { sessionEpoch } = useAuth();
  // A session change discards every page's private state and pending effects.
  return <SocketProvider key={sessionEpoch}><NotificationProvider><CallProvider><AppRoutes /></CallProvider></NotificationProvider></SocketProvider>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <SessionApp />
          {/* The app's own dialogs in place of the browser's (AYK-155). */}
          <AppDialogHost />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
