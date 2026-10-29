import api from './api';

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

export async function updateRequestStatus(id, payload) {
  const { data } = await api.put(`/requests/${id}/status`, payload);
  return data.data;
}

// Direct contact without a price (provider → requester, or requester → a matching provider).
export async function contactRequest(id, providerId) {
  const { data } = await api.post(`/requests/${id}/contact`, providerId ? { provider_id: providerId } : {});
  return data.data;
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

export async function saveToDirectory(providerId, saved = true) {
  const { data } = await (saved ? api.post : api.delete)(`/users/me/directory/${providerId}`);
  return data.data;
}

export async function contactDirect(providerId, categoryId) {
  const { data } = await api.post('/requests/direct', { provider_id: providerId, ...(categoryId ? { category_id: categoryId } : {}) });
  return data.data;
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
