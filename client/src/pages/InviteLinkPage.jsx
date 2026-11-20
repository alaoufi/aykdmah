import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { keepInvite } from '../utils/invite';

// aykdmh.com/i/<number> (AYK-354): keeps the inviter's number and opens the sign-up with it filled in.
// Someone already signed in just lands on the home page.
export default function InviteLinkPage() {
  const { code } = useParams();
  const { user } = useAuth();
  const kept = user ? '' : keepInvite(code);
  return <Navigate to={kept ? `/register?ref=${encodeURIComponent(kept)}` : '/'} replace />;
}
