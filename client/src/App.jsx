import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { CallProvider } from './context/CallContext';
import { NotificationProvider } from './context/NotificationContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import AppRoutes from './routes';

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
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
