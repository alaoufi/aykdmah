import api from './api';

export async function getMyAds() {
  const { data } = await api.get('/ads/me');
  return data.data;
}

export async function previewQuote(payload) {
  const { data } = await api.post('/ads/quote', payload);
  return data.data;
}

export async function submitAdRequest(payload) {
  const { data } = await api.post('/ads/request', payload);
  return data.data;
}

export async function payAd(id) {
  const { data } = await api.post(`/ads/${id}/pay`);
  return data.data;
}

export async function cancelAd(id) {
  const { data } = await api.post(`/ads/${id}/cancel`);
  return data.data;
}

export async function getAdStats(id, days = 14) {
  const { data } = await api.get(`/ads/${id}/stats`, { params: { days } });
  return data.data;
}

export async function pauseAd(id) {
  const { data } = await api.post(`/ads/${id}/pause`);
  return data.data;
}

export async function resumeAd(id) {
  const { data } = await api.post(`/ads/${id}/resume`);
  return data.data;
}

// Per-placement pricing — public so the /promote form can display
// fees beside each placement chip.
export async function getPlacementPricing() {
  const { data } = await api.get('/ads/placement-pricing');
  return data.data;
}

// Visitor's resolved geo — used as a debug hint in the targeting picker.
export async function getMyGeo() {
  const { data } = await api.get('/ads/my-geo');
  return data.data;
}

// Public — visitors fetch live ads and report views/clicks.
export async function getLiveAds(placement) {
  const { data } = await api.get('/ads/live', { params: { placement } });
  return data.data;
}

export async function trackAdView(id) {
  try { await api.post(`/ads/${id}/view`); } catch (_) { /* best effort */ }
}

export async function trackAdClick(id) {
  try { await api.post(`/ads/${id}/click`); } catch (_) { /* best effort */ }
}
