import api from './api';

// Messages to the administration (AYK-046): support, suggestions, administration.
export async function listSupport() {
  const { data } = await api.get('/support');
  return data.data || [];
}

export async function createSupport(topic, body) {
  const { data } = await api.post('/support', { topic, body });
  return data.data;
}

export async function getSupport(id) {
  const { data } = await api.get(`/support/${id}`);
  return data.data;
}

export async function replySupport(id, body) {
  const { data } = await api.post(`/support/${id}/messages`, { body });
  return data.data;
}

export async function supportUnread() {
  const { data } = await api.get('/support/unread');
  return Number(data.data?.count) || 0;
}

// The administration's inbox.
export async function adminListSupport(params = {}) {
  const { data } = await api.get('/admin/support', { params });
  return data.data || [];
}

export async function adminGetSupport(id) {
  const { data } = await api.get(`/admin/support/${id}`);
  return data.data;
}

export async function adminReplySupport(id, body) {
  const { data } = await api.post(`/admin/support/${id}/messages`, { body });
  return data.data;
}

export async function adminSupportStatus(id, status) {
  const { data } = await api.put(`/admin/support/${id}/status`, { status });
  return data.data;
}
