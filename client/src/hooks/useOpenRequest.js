import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { contactRequest } from '../services/requestService';
import { showProblem } from '../components/common/AppDialog';

// Opening a request card: my own request, or a request I only want to look at, opens its page. A chat with
// its requester opens only from a contact button (AYK-488, the owner: «دخلت أعمالي وظهر لي كل الأعمال المنشورة
// ليست لي»: before, merely tapping a card opened the chat and filed the request under «أعمالي», and told its
// requester that someone had contacted him).
export default function useOpenRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [opening, setOpening] = useState(0);
  const mine = request => Boolean(user) && Number(request.client_id) === Number(user.id);
  const forMyService = request => Boolean(user) && user.role === 'provider' && !mine(request) && request.status === 'open';
  // The chat with the requester (a deliberate contact), or the request's page when that fails.
  const startChat = async request => {
    setOpening(request.id);
    try {
      const { conversation_id } = await contactRequest(request.id);
      navigate(`/chat/${conversation_id}`);
    } catch (err) {
      if (err?.cancelled) return;
      // Why the chat could not open, with its way out (AYK-219), then the request's page.
      navigate(`/requests/${request.id}`);
      showProblem(err);
    } finally { setOpening(0); }
  };
  // AYK-501 (the owner, with a screenshot of «التواصل لمقدمي الخدمة»): contact is offered only to a provider who passes the
  // three conditions (same profession, inside his coverage, not blocked by the requester). Everyone else, a visitor,
  // a requester or a provider who fails one condition, only SEES the request (its profession, area, rating and
  // public data): no contact button, no name or number, no chat, and never a prompt to change profession or account.
  const open = request => { navigate(`/requests/${request.id}`); };
  // AYK-493: the server says (can_contact) whether this provider may reach the owner.
  const canContact = request => !mine(request) && request.status === 'open' && user?.role === 'provider' && request.can_contact !== false;
  const contact = async request => {
    if (!canContact(request)) return;
    await startChat(request);
  };
  return { open, opening, mine, forMyService, canContact, contact };
}
