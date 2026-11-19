import api from './api';

export async function submitReview(formData) {
  const { data } = await api.post('/reviews', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}

export async function getUserReviews(userId, params = {}) {
  const { data } = await api.get(`/reviews/user/${userId}`, { params });
  return data;
}

export async function getUserRatingStats(userId, type = 'on_provider') {
  const { data } = await api.get(`/reviews/user/${userId}/stats`, { params: { type } });
  return data.data;
}

export async function getProviderReviews(providerId, params = {}) {
  const { data } = await api.get(`/reviews/provider/${providerId}`, { params });
  return data;
}

export async function replyToReview(reviewId, reply) {
  const { data } = await api.put(`/reviews/${reviewId}/reply`, { reply });
  return data.data;
}

export async function getReviewTranslation(reviewId, lang) {
  const { data } = await api.get(`/reviews/${reviewId}/translation`, { params: { lang } });
  return data.data;
}

export async function voteHelpful(reviewId) {
  const { data } = await api.post(`/reviews/${reviewId}/helpful`);
  return data.data;
}

export async function reportReview(reviewId, reason, details) {
  const { data } = await api.post(`/reviews/${reviewId}/report`, { reason, details });
  return data.data;
}
