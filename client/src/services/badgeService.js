import api from './api';

// Provider self-service
export async function getMyBadges() {
  const { data } = await api.get('/badges/me');
  return data.data;
}

export async function requestBadge(payload) {
  const { data } = await api.post('/badges/request', payload);
  return data.data;
}

export async function payBadge(id) {
  const { data } = await api.post(`/badges/${id}/pay`);
  return data.data;
}

export async function cancelBadge(id) {
  const { data } = await api.post(`/badges/${id}/cancel`);
  return data.data;
}

// Admin
export async function adminListBadges(params = {}) {
  const { data } = await api.get('/badges/admin', { params });
  return data;
}

export async function adminApproveBadge(id) {
  const { data } = await api.post(`/badges/admin/${id}/approve`);
  return data.data;
}

export async function adminRejectBadge(id, reason) {
  const { data } = await api.post(`/badges/admin/${id}/reject`, { reason });
  return data.data;
}
