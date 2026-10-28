import api, { getToken, setToken } from './api';
let credentialRequest = 0;
let signingOut = Promise.resolve();

export async function login(credentials) {
  const request = ++credentialRequest;
  const previousToken = getToken();
  await signingOut;
  if (request !== credentialRequest) throw new DOMException('Session changed', 'AbortError');
  const { data } = await api.post('/auth/login', credentials);
  if (request !== credentialRequest || getToken() !== previousToken) throw new DOMException('Session changed', 'AbortError');
  if (data.data && data.data.token) setToken(data.data.token);
  return data.data;
}

export async function register(payload) {
  const request = ++credentialRequest;
  const previousToken = getToken();
  await signingOut;
  if (request !== credentialRequest) throw new DOMException('Session changed', 'AbortError');
  const { data } = await api.post('/auth/register', payload);
  if (request !== credentialRequest || getToken() !== previousToken) throw new DOMException('Session changed', 'AbortError');
  if (data.data && data.data.token) setToken(data.data.token);
  return data.data;
}

export async function logout() {
  ++credentialRequest;
  const token = getToken();
  // Dispatch with the captured bearer before clearing local state immediately.
  const request = api.post('/auth/logout', null, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  setToken(null);
  signingOut = request.catch(() => { /* Local sign-out also completes offline. */ });
  await signingOut;
}

export async function me() {
  const { data } = await api.get('/auth/me');
  return data.data;
}

export async function changePassword(payload) {
  const token = getToken();
  const { data } = await api.put('/auth/password', payload);
  if (getToken() === token) setToken(null);
  return data;
}

export async function updateProfile(payload) {
  const { data } = await api.put('/users/me', payload);
  return data.data;
}

export async function changeAccountType(payload) {
  const { data } = await api.put('/users/me/role', payload);
  return data.data;
}

export async function updateProviderProfile(payload) {
  const { data } = await api.put('/users/me/provider', payload);
  return data.data;
}

// Phone codes for sign-up and "forgot password" (AYK-016).
export async function sendPhoneCode(phone, purpose) {
  const { data } = await api.post('/auth/phone-code', { phone, purpose });
  return data.data;
}

export async function checkPhone(phone) {
  const { data } = await api.post('/auth/phone-check', { phone });
  return data.data;
}

export async function resetPassword(payload) {
  const { data } = await api.post('/auth/reset-password', payload);
  return data;
}
