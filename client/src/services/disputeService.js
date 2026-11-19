import api from './api';

export async function openDispute(payload) {
  const { data } = await api.post('/disputes', payload);
  return data.data;
}

export async function listDisputes(params = {}) {
  const { data } = await api.get('/disputes', { params });
  return data;
}

export async function getDispute(id) {
  const { data } = await api.get(`/disputes/${id}`);
  return data.data;
}

export async function getDisputeTimeline(id) {
  const { data } = await api.get(`/disputes/${id}/timeline`);
  return data.data;
}

export async function postDisputeMessage(id, body, internal = false) {
  const { data } = await api.post(`/disputes/${id}/messages`, { body, internal });
  return data.data;
}

export async function uploadDisputeEvidence(id, files, caption = '') {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  if (caption) fd.append('caption', caption);
  const { data } = await api.post(`/disputes/${id}/evidence`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}

export async function changeDisputeStatus(id, payload) {
  const { data } = await api.put(`/disputes/${id}/status`, payload);
  return data.data;
}

// Admin-only
export async function requestChatAccess(disputeId, reason) {
  const { data } = await api.post(`/disputes/${disputeId}/access`, { reason });
  return data.data;
}

export async function getDisputeConversation(disputeId, reason) {
  const { data } = await api.get(`/disputes/${disputeId}/conversation`, { params: { reason } });
  return data.data;
}

export async function getDisputeAccessLogs(disputeId) {
  const { data } = await api.get(`/disputes/${disputeId}/access-logs`);
  return data.data;
}

export async function resolveDispute(disputeId, resolution, ratings_allowed = 'both') {
  const { data } = await api.put(`/disputes/${disputeId}/resolve`, { resolution, ratings_allowed });
  return data.data;
}

export async function closeDispute(disputeId) {
  const { data } = await api.put(`/disputes/${disputeId}/close`);
  return data.data;
}
