import api from './api';

export async function startCall(conversationId, callType) {
  const { data } = await api.post('/calls', { conversation_id: conversationId, call_type: callType });
  return data.data;
}
export async function acceptCall(id) { return (await api.post(`/calls/${id}/accept`)).data.data; }
export async function declineCall(id) { return (await api.post(`/calls/${id}/decline`)).data.data; }
export async function callToken(id) { return (await api.post(`/calls/${id}/token`)).data.data; }
export async function activeCalls() { return (await api.get('/calls/active')).data.data; }
export async function callEligibility(userId) { return (await api.get(`/calls/eligibility/${userId}`)).data.data; }
export async function reportCall(id, reason) { return (await api.post(`/calls/${id}/report`, { reason })).data.data; }
export async function callHistory(params) { return (await api.get('/calls/history', { params })).data.data; }
export async function adminCallStats(days = 30) { return (await api.get('/calls/admin/stats', { params: { days } })).data.data; }
export async function reviewCallReport(id, status) { return (await api.patch(`/calls/admin/reports/${id}`, { status })).data.data; }

// End-of-call quality summary for the call quality log (AYK-060). Best effort.
export async function sendCallDiagnostics(callId, summary) {
  await api.post(`/calls/${callId}/diagnostics`, summary);
}
