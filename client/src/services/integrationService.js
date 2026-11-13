import api from './api';

export async function listIntegrations(params = {}) {
  const { data } = await api.get('/admin/integrations', { params });
  return data.data;
}

export async function getIntegration(id) {
  const { data } = await api.get(`/admin/integrations/${id}`);
  return data.data;
}

export async function getIntegrationProviders() {
  const { data } = await api.get('/admin/integrations/providers');
  return data.data;
}

export async function createIntegration(payload) {
  const { data } = await api.post('/admin/integrations', payload);
  return data.data;
}

export async function updateIntegration(id, payload) {
  const { data } = await api.put(`/admin/integrations/${id}`, payload);
  return data.data;
}

export async function deleteIntegration(id) {
  await api.delete(`/admin/integrations/${id}`);
}

export async function testIntegration(id, payload = {}) {
  const { data } = await api.post(`/admin/integrations/${id}/test`, payload);
  return data.data;
}

export async function getIntegrationUsage(params = {}) {
  const { data } = await api.get('/admin/integrations/usage', { params });
  return data;
}
