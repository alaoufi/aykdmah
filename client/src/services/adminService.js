import api from './api';

// One-click migration runner — admin-authenticated alternative to
// /api/setup/migrate?key=…
export async function applyMigrations() {
  const { data } = await api.post('/admin/system/migrate');
  return data.data;
}

export async function getMarketingStats(params = {}) {
  const { data } = await api.get('/admin/marketing', { params });
  return data.data;
}

export async function getDashboard() {
  const { data } = await api.get('/admin/dashboard');
  return data.data;
}

// --- Users ---
export async function listUsers(params = {}) {
  const { data } = await api.get('/users', { params });
  return data;
}

export async function getUser(id) {
  const { data } = await api.get(`/users/${id}`);
  return data.data;
}

export async function createUser(payload) {
  const { data } = await api.post('/users', payload);
  return data.data;
}

export async function updateUser(id, payload) {
  const { data } = await api.put(`/users/${id}`, payload);
  return data.data;
}

export async function blockUser(id) {
  await api.post(`/users/${id}/block`);
}

export async function unblockUser(id) {
  await api.post(`/users/${id}/unblock`);
}

export async function deleteUser(id) {
  await api.delete(`/users/${id}`);
}

// --- Requests ---
export async function listAllRequests(params = {}) {
  const { data } = await api.get('/admin/requests', { params });
  return data;
}

export async function updateRequest(id, payload) {
  const { data } = await api.put(`/admin/requests/${id}`, payload);
  return data.data;
}

export async function assignRequest(id, provider_id) {
  const { data } = await api.post(`/admin/requests/${id}/assign`, { provider_id });
  return data.data;
}

export async function cancelRequest(id, cancellation_reason) {
  const { data } = await api.put(`/admin/requests/${id}/cancel`, { cancellation_reason });
  return data.data;
}

export async function deleteRequest(id) {
  await api.delete(`/admin/requests/${id}`);
}

// --- Settings ---
export async function getSettings() {
  const { data } = await api.get('/admin/settings');
  return data.data;
}

export async function updateSettings(items) {
  const { data } = await api.put('/admin/settings', { items });
  return data.data;
}

// --- Categories (admin uses real backend) ---
export async function listCategoriesAdmin() {
  const { data } = await api.get('/categories', { params: { all: 'true' } });
  return data.data;
}

export async function createCategory(payload) {
  const { data } = await api.post('/categories', payload);
  return data.data;
}

export async function updateCategory(id, payload) {
  const { data } = await api.put(`/categories/${id}`, payload);
  return data.data;
}

export async function deleteCategory(id) {
  await api.delete(`/categories/${id}`);
}

// --- Services (admin uses real backend) ---
export async function listServicesAdmin(params = {}) {
  const { data } = await api.get('/services', { params: { ...params, all: 'true' } });
  return data.data;
}

export async function createService(payload) {
  const { data } = await api.post('/services', payload);
  return data.data;
}

export async function updateService(id, payload) {
  const { data } = await api.put(`/services/${id}`, payload);
  return data.data;
}

export async function deleteService(id) {
  await api.delete(`/services/${id}`);
}

// --- Verifications ---
export async function listVerifications(params = {}) {
  const { data } = await api.get('/admin/verifications', { params });
  return data;
}

export async function reviewVerification(id, action, rejection_reason) {
  await api.post(`/admin/verifications/${id}/review`, { action, rejection_reason });
}

// --- Ads ---
export async function listAds(params = {}) {
  // Returns full envelope so callers can read pagination meta.
  const { data } = await api.get('/admin/ads', { params });
  return data;
}

export async function approveAdAdmin(id) {
  const { data } = await api.post(`/admin/ads/${id}/approve`);
  return data.data;
}

export async function rejectAdAdmin(id, reason) {
  const { data } = await api.post(`/admin/ads/${id}/reject`, { reason });
  return data.data;
}

export async function activateAdAdmin(id) {
  const { data } = await api.post(`/admin/ads/${id}/activate`);
  return data.data;
}

export async function pauseAdAdmin(id) {
  const { data } = await api.post(`/admin/ads/${id}/pause`);
  return data.data;
}

export async function resumeAdAdmin(id) {
  const { data } = await api.post(`/admin/ads/${id}/resume`);
  return data.data;
}

export async function getAdStatsAdmin(id, days = 14) {
  const { data } = await api.get(`/admin/ads/${id}/stats`, { params: { days } });
  return data.data;
}

export async function getAdsPlacementPricing() {
  const { data } = await api.get('/admin/ads-pricing');
  return data.data;
}

export async function saveAdsPlacementPricing(items) {
  const { data } = await api.put('/admin/ads-pricing', { items });
  return data.data;
}

export async function adminPreviewLiveAds(placement) {
  const { data } = await api.get('/admin/ads-preview-live', { params: { placement } });
  return data.data;
}

// --- Countries ---
export async function adminListCountries() {
  const { data } = await api.get('/countries/admin/all');
  return data.data;
}

export async function adminCreateCountry(payload) {
  const { data } = await api.post('/countries', payload);
  return data.data;
}

export async function adminUpdateCountry(id, payload) {
  const { data } = await api.put(`/countries/${id}`, payload);
  return data.data;
}

export async function adminDeleteCountry(id) {
  await api.delete(`/countries/${id}`);
}

export async function adminReorderCountries(ids) {
  const { data } = await api.post('/countries/reorder', { ids });
  return data.data;
}

// --- Regions ---
export async function adminListRegions({ country_id } = {}) {
  const params = { all: 'true' };
  if (country_id) params.country_id = country_id;
  const { data } = await api.get('/regions', { params });
  return data.data;
}

export async function adminCreateRegion(payload) {
  const { data } = await api.post('/regions', payload);
  return data.data;
}

export async function adminUpdateRegion(id, payload) {
  const { data } = await api.put(`/regions/${id}`, payload);
  return data.data;
}

export async function adminDeleteRegion(id) {
  await api.delete(`/regions/${id}`);
}

export async function adminReorderRegions(ids) {
  const { data } = await api.post('/regions/reorder', { ids });
  return data.data;
}

// --- Cities ---
export async function adminListCities({ region_id, governorate_id } = {}) {
  const params = { all: 'true' };
  if (region_id) params.region_id = region_id;
  if (governorate_id) params.governorate_id = governorate_id;
  const { data } = await api.get('/cities', { params });
  return data.data;
}

export async function adminCreateCity(payload) {
  const { data } = await api.post('/cities', payload);
  return data.data;
}

export async function adminUpdateCity(id, payload) {
  const { data } = await api.put(`/cities/${id}`, payload);
  return data.data;
}

export async function adminDeleteCity(id) {
  await api.delete(`/cities/${id}`);
}

export async function adminReorderCities(ids) {
  const { data } = await api.post('/cities/reorder', { ids });
  return data.data;
}

export async function diagnoseAd(id, placement) {
  const { data } = await api.get(`/admin/ads/${id}/diagnose`, { params: { placement } });
  return data.data;
}

export async function createAd(payload) {
  const { data } = await api.post('/admin/ads', payload);
  return data;
}

export async function updateAd(id, payload) {
  const { data } = await api.put(`/admin/ads/${id}`, payload);
  return data;
}

export async function deleteAd(id) {
  await api.delete(`/admin/ads/${id}`);
}

// Upload an ad media file (image / GIF / WebP / APNG / MP4 / WebM / Ogg).
// Returns { url, media_type, mime, size } so the form can populate both
// fields in one go.
export async function uploadAdMedia(file) {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post('/admin/ads/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}

// --- Activity logs ---
export async function listActivityLogs(params = {}) {
  const { data } = await api.get('/admin/activity-logs', { params });
  return data;
}

// --- Subscription plans (admin CRUD) ---
export async function listPlansAdmin() {
  const { data } = await api.get('/admin/plans');
  return data.data;
}

export async function createPlan(payload) {
  const { data } = await api.post('/admin/plans', payload);
  return data.data;
}

export async function updatePlan(id, payload) {
  const { data } = await api.put(`/admin/plans/${id}`, payload);
  return data.data;
}

export async function deletePlan(id) {
  await api.delete(`/admin/plans/${id}`);
}

// --- Reviews moderation ---
export async function listReviewsAdmin(params = {}) {
  const { data } = await api.get('/admin/reviews', { params });
  return data;
}

export async function hideReview(id) {
  await api.put(`/admin/reviews/${id}/hide`);
}

export async function showReview(id) {
  await api.put(`/admin/reviews/${id}/show`);
}

export async function deleteReview(id) {
  await api.delete(`/admin/reviews/${id}`);
}

// --- Admin permissions ---
export async function adminListPermissions() {
  const { data } = await api.get('/admin/permissions');
  return data.data.permissions;
}
export async function adminGetUserPermissions(id) {
  const { data } = await api.get(`/admin/users/${id}/permissions`);
  return data.data;
}
export async function adminUpdateUserPermissions(id, payload) {
  const { data } = await api.put(`/admin/users/${id}/permissions`, payload);
  return data.data;
}

// --- Conversation + location monitor ---
export async function adminListConversations(params = {}) {
  const { data } = await api.get('/admin/conversations', { params });
  return data;
}
export async function adminGetConversation(id) {
  const { data } = await api.get(`/admin/conversations/${id}`);
  return data.data;
}
export async function adminListLiveLocations() {
  const { data } = await api.get('/admin/live-locations');
  return data.data;
}

// --- Public subscription endpoints (kept for provider page) ---
export async function listPlans() {
  const { data } = await api.get('/subscriptions/plans');
  return data.data;
}

export async function subscribe(planId) {
  const { data } = await api.post('/subscriptions', { plan_id: planId });
  return data.data;
}

export async function getCurrentSubscription() {
  const { data } = await api.get('/subscriptions/current');
  return data.data;
}

export async function createPaymentSession(payload) {
  const { data } = await api.post('/payments/session', payload);
  return data.data;
}
