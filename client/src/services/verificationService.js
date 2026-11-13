import api from './api';

export async function getStatus() {
  const { data } = await api.get('/verify/status');
  return data.data;
}

export async function getPolicy() {
  const { data } = await api.get('/verify/policy');
  return data.data;
}

export async function startMethod(method, identifier) {
  const { data } = await api.post(`/verify/${method}/start`, { identifier });
  return data.data;
}

export async function confirmMethod(method, code) {
  const { data } = await api.post(`/verify/${method}/confirm`, { code });
  return data.data;
}

export async function startNafath(national_id) {
  const { data } = await api.post('/verify/nafath/start', { national_id });
  return data.data;
}

export async function pollNafath(transaction_id) {
  const { data } = await api.post('/verify/nafath/poll', { transaction_id });
  return data.data;
}

export async function getAudit() {
  const { data } = await api.get('/verify/audit');
  return data.data;
}
