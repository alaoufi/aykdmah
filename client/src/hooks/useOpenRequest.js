import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { contactRequest } from '../services/requestService';

// Opening a request card (AYK-044): my own request opens its page; a request for my
// service opens the chat with its requester straight away (or its page when that fails).
export default function useOpenRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [opening, setOpening] = useState(0);
  const mine = request => Boolean(user) && Number(request.client_id) === Number(user.id);
  const forMyService = request => Boolean(user) && user.role === 'provider' && !mine(request) && request.status === 'open';
  const open = async request => {
    if (!forMyService(request)) { navigate(`/requests/${request.id}`); return; }
    setOpening(request.id);
    try {
      const { conversation_id } = await contactRequest(request.id);
      navigate(`/chat/${conversation_id}`);
    } catch (_) {
      navigate(`/requests/${request.id}`);
    } finally { setOpening(0); }
  };
  return { open, opening, mine, forMyService };
}
