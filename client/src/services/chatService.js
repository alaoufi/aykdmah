import api from './api';
import i18n from '../i18n';
import { withContactIntent } from '../utils/contactIntent';
import { askChoice } from '../components/common/AppDialog';

export async function listConversations(params = {}) {
  const { data } = await api.get('/chat/conversations', { params });
  return data.data;
}

// Forward my message to every provider on this request, or to one chat (AYK-043).
export async function forwardMessage(conversationId, messageId, targetConversationId) {
  const { data } = await api.post(`/chat/conversations/${conversationId}/messages/${messageId}/forward`,
    targetConversationId ? { conversation_id: targetConversationId } : {});
  return data.data;
}

// Alert the other side again about my unread message (AYK-052).
export async function nudgeConversation(conversationId) {
  const { data } = await api.post(`/chat/conversations/${conversationId}/nudge`);
  return data.data;
}

export async function getChatUnread() {
  const { data } = await api.get('/chat/unread');
  return Number(data.data?.count) || 0;
}

// Block / unblock the other side of a chat (AYK-084).
// ⭐ A favourite conversation (AYK-130).
export async function setConversationFavorite(conversationId, favorite) {
  const { data } = await api.put(`/chat/conversations/${conversationId}/favorite`, { favorite });
  return data.data;
}

export async function setUserBlocked(userId, blocked) {
  const { data } = blocked ? await api.post(`/users/me/blocks/${userId}`) : await api.delete(`/users/me/blocks/${userId}`);
  return data.data;
}

export async function getConversation(id) {
  const { data } = await api.get(`/chat/conversations/${id}`);
  return data.data;
}

export async function getMessages(id, params = {}) {
  const { data } = await api.get(`/chat/conversations/${id}/messages`, { params });
  return data.data;
}

export async function sendMessage(id, formData) {
  const { data } = await api.post(`/chat/conversations/${id}/messages`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}

export async function markRead(id) {
  await api.put(`/chat/conversations/${id}/read`);
}

export async function createConversation(payload) {
  return withContactIntent(async intent => {
  const lookup = await api.get('/chat/conversations',{...intent.config(),params:{user_id:payload.user_id,request_id:payload.request_id,limit:1}});
  intent.assertCurrent();
  const previous = lookup.data.data?.[0];
  if (previous) {
    const choice = await askChoice({isCurrent:intent.isCurrent,title:i18n.t('chat.previous_title'),message:i18n.t('chat.previous_hint'),choices:[{value:'open',label:i18n.t('chat.open_previous')},{value:'new',label:i18n.t('chat.new_conversation')}]});
    intent.assertCurrent();
    if (choice === null) throw Object.assign(new Error('Cancelled'),{cancelled:true});
    if (choice === 'open') return {id:previous.id};
    payload = {...payload,fresh:true};
  }
  const { data } = await api.post('/chat/conversations', payload,intent.config());
  return data.data;
  });
}

export async function deleteMessage(conversationId, messageId) {
  await api.delete(`/chat/conversations/${conversationId}/messages/${messageId}`);
}

export async function searchMessages(conversationId, q, before) {
  const { data } = await api.get(`/chat/conversations/${conversationId}/search`, { params: { q, before } });
  return data.data;
}

export async function sendLocationMessage(conversationId, { latitude, longitude, accuracy_m, reply_to_id, content }) {
  const fd = new FormData();
  fd.append('message_type', 'location');
  fd.append('latitude', String(latitude));
  fd.append('longitude', String(longitude));
  if (accuracy_m != null) fd.append('accuracy_m', String(accuracy_m));
  if (reply_to_id) fd.append('reply_to_id', String(reply_to_id));
  if (content) fd.append('content', content);
  const { data } = await api.post(`/chat/conversations/${conversationId}/messages`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}

export async function shareLocation(conversationId, payload) {
  const { data } = await api.post(`/chat/conversations/${conversationId}/location`, payload);
  return data.data;
}

export async function getLatestLocations(conversationId) {
  const { data } = await api.get(`/chat/conversations/${conversationId}/location/latest`);
  return data.data;
}

export async function stopLocationShare(conversationId) {
  await api.delete(`/chat/conversations/${conversationId}/location`);
}

export async function getRequestTracking(requestId) {
  const { data } = await api.get(`/tracking/requests/${requestId}`);
  return data.data;
}

export async function listNotifications(params = {}) {
  const { data } = await api.get('/notifications', { params });
  return data;
}

export async function markNotificationRead(id) {
  await api.put(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead() {
  await api.put('/notifications/read-all');
}

export async function forwardMessages(conversationId, messageIds, conversationIds, operationId) {
  const { data } = await api.post(`/chat/conversations/${conversationId}/forward`, { operation_id: operationId, message_ids: messageIds, conversation_ids: conversationIds });
  return data.data;
}
