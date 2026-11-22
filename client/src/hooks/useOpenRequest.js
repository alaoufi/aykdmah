import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { contactRequest } from '../services/requestService';
import { showProblem, askConfirm } from '../components/common/AppDialog';
import { useTranslation } from 'react-i18next';

// Opening a request card (AYK-044): my own request opens its page; a request for my
// service opens the chat with its requester straight away (or its page when that fails).
export default function useOpenRequest() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [opening, setOpening] = useState(0);
  const mine = request => Boolean(user) && Number(request.client_id) === Number(user.id);
  const forMyService = request => Boolean(user) && user.role === 'provider' && !mine(request) && request.status === 'open';
  const open = async request => {
    // AYK-440 (the owner: «يشاهد… بشرط لا يراسلهم ولا يدخل على بياناتهم، سواء طالب خدمة أو زائر»): a
    // visitor or a requester sees others' requests on the board but does not open them; a visitor
    // is asked to sign in, a requester is offered to become a provider (as «تواصل» does).
    if (!mine(request) && user?.role !== 'provider') {
      if (!user) { navigate('/login', { state: { from: '/' } }); return; }
      await contact(request); return;
    }
    if (!forMyService(request)) { navigate(`/requests/${request.id}`); return; }
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
  // AYK-426 (the owner: «اللوحة هذي ما فيها تواصل، أضف التواصل»): «تواصل» on every open request that
  // is not mine. A provider reaches the requester at once (as before); a visitor signs in first; a
  // requester is told contact is for service providers and can become one.
  const canContact = request => !mine(request) && request.status === 'open';
  const contact = async request => {
    if (!user) { navigate('/login', { state: { from: `/requests/${request.id}` } }); return; }
    if (forMyService(request)) { await open(request); return; }
    const become = await askConfirm({ title: t('request.contact_providers_title'), message: t('request.contact_providers_only'), confirmText: t('request.become_provider') });
    if (become) navigate('/profile#account-type');
  };
  return { open, opening, mine, forMyService, canContact, contact };
}
