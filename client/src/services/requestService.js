import api from './api';
import i18n from '../i18n';
import { withContactIntent } from '../utils/contactIntent';
import { askChoice } from '../components/common/AppDialog';
async function contactChoice(params,intent) {
  const { data } = await api.get('/chat/conversations', { ...intent.config(), params: { ...params, limit: 1 } });
  intent.assertCurrent();
  const previous = data.data?.[0];
  if (!previous) return {fresh:false};
  // A conversation that can no longer be written in (its contact time ended) is never offered:
  // a new one starts straight away (AYK-221).
  if (previous.can_send === false) return {fresh:true};
  const choice = await askChoice({isCurrent:intent.isCurrent,title:i18n.t('chat.previous_title'),message:i18n.t('chat.previous_hint'),choices:[{value:'open',label:i18n.t('chat.open_previous')},{value:'new',label:i18n.t('chat.new_conversation')}]});
  intent.assertCurrent();
  if (choice === null) throw Object.assign(new Error('Cancelled'), {cancelled:true});
  return choice === 'open' ? {previous} : {fresh:true};
}

export async function createRequest(formData) {
  const { data } = await api.post('/requests', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}

export async function listMyRequests(params = {}) {
  const { data } = await api.get('/requests/my', { params });
  return data;
}

export async function listNearbyRequests(params = {}) {
  const { data } = await api.get('/requests/nearby', { params });
  return data;
}

export async function getRequest(id) {
  const { data } = await api.get(`/requests/${id}`);
  return data.data;
}

// A warranty agreed between the two sides (AYK-081).
export async function proposeWarranty(id, days) {
  const { data } = await api.put(`/requests/${id}/warranty`, { days });
  return data.data;
}

export async function acceptWarranty(id) {
  const { data } = await api.post(`/requests/${id}/warranty/accept`);
  return data.data;
}

export async function updateRequestStatus(id, payload) {
  const { data } = await api.put(`/requests/${id}/status`, payload);
  return data.data;
}

// Direct contact without a price (provider → requester, or requester → a matching provider).
export async function contactRequest(id, providerId) {
  return withContactIntent(async intent => {
  const choice = await contactChoice({request_id:id,...(providerId ? {user_id:providerId} : {})},intent);
  if (choice.previous) return {conversation_id:choice.previous.id};
  const { data } = await api.post(`/requests/${id}/contact`, {...(providerId ? {provider_id:providerId} : {}), fresh:choice.fresh},intent.config());
  return data.data;
  });
}

// The requester agreed with this provider: the request is assigned and other chats close.
export async function agreeRequest(id, providerId) {
  const { data } = await api.post(`/requests/${id}/agree`, { provider_id: providerId });
  return data.data;
}

export async function setRequestReminders(id, off) {
  const { data } = await api.put(`/requests/${id}/reminders`, { off });
  return data.data;
}

export async function deleteRequest(id) {
  await api.delete(`/requests/${id}`);
}

export async function startRequestChat(id) {
  const { data } = await api.post(`/requests/${id}/chat`);
  return data.data;
}

// The requester's own directory of providers, and contacting one directly (AYK-041).
export async function listDirectory() {
  const { data } = await api.get('/users/me/directory');
  return data.data || [];
}

export async function listDirectoryIds() {
  const { data } = await api.get('/users/me/directory/ids');
  return data.data || [];
}

export async function saveToDirectory(providerId, saved = true, nickname = null) {
  const { data } = saved ? await api.post(`/users/me/directory/${providerId}`, nickname ? { nickname } : {}) : await api.delete(`/users/me/directory/${providerId}`);
  return data.data;
}

export async function contactDirect(providerId, categoryId) {
  return withContactIntent(async intent => {
  const choice = await contactChoice({user_id:providerId},intent);
  if (choice.previous) return {conversation_id:choice.previous.id,request_id:choice.previous.request_id};
  const { data } = await api.post('/requests/direct', { fresh:choice.fresh, provider_id: providerId, ...(categoryId ? { category_id: categoryId } : {}) },intent.config());
  return data.data;
  });
}

// Offers
export async function createOffer(payload) {
  const { data } = await api.post('/offers', payload);
  return data.data;
}

export async function getOffersForRequest(requestId) {
  const { data } = await api.get(`/offers/request/${requestId}`);
  return data.data;
}

export async function listMyOffers(params = {}) {
  const { data } = await api.get('/offers/my', { params });
  return data;
}

export async function acceptOffer(offerId) {
  const { data } = await api.put(`/offers/${offerId}/accept`);
  return data.data;
}

export async function rejectOffer(offerId) {
  const { data } = await api.put(`/offers/${offerId}/reject`);
  return data.data;
}

// A new direct contact with a provider, never reusing a closed conversation (AYK-221).
export async function contactDirectFresh(providerId, categoryId) {
  const { data } = await api.post('/requests/direct', { fresh: true, provider_id: providerId, ...(categoryId ? { category_id: categoryId } : {}) });
  return data.data;
}
