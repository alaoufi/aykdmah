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
// AYK-286: the slots a page shows at once are asked for in one request, not one each (the home
// page made six). Slots that ask within the same moment share it; a server without the batch
// form answers with a list, and then each slot asks on its own as before.
let pending = null;
// AYK-409: the visitor's device and language, for ads targeted at them.
const viewer = () => {
  let device = 'desktop';
  try { device = window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop'; } catch (_) { /* old browser */ }
  return { device, lang: (document.documentElement.lang || 'ar').split('-')[0] };
};
async function askOne(placement) {
  const { data } = await api.get('/ads/live', { params: { placement, ...viewer() } });
  return data.data;
}
export function getLiveAds(placement) {
  if (!pending) {
    const batch = { slots: new Map() };
    pending = batch;
    setTimeout(() => {
      if (pending === batch) pending = null;
      const names = [...batch.slots.keys()];
      api.get('/ads/live', { params: { placements: names.join(','), ...viewer() } })
        .then(({ data }) => {
          const map = data?.data;
          for (const [name, waiters] of batch.slots) {
            if (map && !Array.isArray(map) && typeof map === 'object') waiters.forEach(w => w.resolve(map[name] || []));
            else askOne(name).then(rows => waiters.forEach(w => w.resolve(rows)), e => waiters.forEach(w => w.reject(e)));
          }
        })
        .catch(e => { for (const waiters of batch.slots.values()) waiters.forEach(w => w.reject(e)); });
    }, 30);
  }
  return new Promise((resolve, reject) => {
    const waiters = pending.slots.get(placement) || [];
    waiters.push({ resolve, reject });
    pending.slots.set(placement, waiters);
  });
}

export async function trackAdView(id) {
  try { await api.post(`/ads/${id}/view`); } catch (_) { /* best effort */ }
}

export async function trackAdClick(id) {
  try { await api.post(`/ads/${id}/click`); } catch (_) { /* best effort */ }
}

// The ad's image or video, uploaded by the advertiser (AYK-149).
export async function uploadMyAdMedia(file) {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post('/ads/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data.data;
}

// AYK-409: the advertiser's report of one ad, as a CSV file (opens in Excel).
export async function downloadMyAdReport(id) {
  const res = await api.get(`/ads/${id}/report.csv`, { responseType: 'blob' });
  return res.data;
}
