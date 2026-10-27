const Review = require('../models/Review');
const Request = require('../models/Request');
const Dispute = require('../models/Dispute');
const notificationService = require('../services/notificationService');
const translationService = require('../services/translationService');
const { success, created, error, notFound, forbidden, paginate } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { withUploadedFiles } = require('../utils/uploadPersistence');

// POST /reviews
// Body: request_id, rating, comment, criteria_ratings, original_language
const create = asyncHandler(async (req, res) => {
  const { request_id, rating, comment, criteria_ratings, original_language } = req.body;
  const request = await Request.findById(request_id);
  if (!request) return notFound(res, req.t('request_not_found'));
  if (request.status !== 'completed') return error(res, req.t('must_complete_first'));
  if (!request.assigned_provider_id) return error(res, req.t('no_assigned_provider'));

  // Direction is inferred from who's writing
  const isClient = request.client_id === req.user.id;
  const isProvider = request.assigned_provider_id === req.user.id;
  if (!isClient && !isProvider) return forbidden(res);

  const review_type = isClient ? 'on_provider' : 'on_requester';
  const target_user_id = isClient ? request.assigned_provider_id : request.client_id;

  // Block reviews while a dispute is active for this order. After
  // resolution, the dispute's ratings_allowed flag decides who may rate.
  const dispute = await Dispute.findActiveForRequest(request_id);
  if (dispute) {
    return error(res, req.t('dispute_blocks_review'), 403);
  }
  const lastResolved = await require('../config/database').queryOne(
    `SELECT ratings_allowed FROM disputes
     WHERE request_id = ? AND status IN ('resolved','rejected','closed')
     ORDER BY id DESC LIMIT 1`,
    [request_id]
  );
  if (lastResolved && lastResolved.ratings_allowed) {
    const r = lastResolved.ratings_allowed;
    if (r === 'none' || r === 'pending') return error(res, req.t('ratings_blocked'), 403);
    if (r === 'client_only'   && !isClient)   return error(res, req.t('ratings_blocked'), 403);
    if (r === 'provider_only' && !isProvider) return error(res, req.t('ratings_blocked'), 403);
  }

  const existing = await Review.findByRequestAndReviewer(request_id, req.user.id, review_type);
  if (existing) return error(res, req.t('review_exists'));

  let parsedCriteria = null;
  if (criteria_ratings != null && criteria_ratings !== '') {
    try { parsedCriteria = typeof criteria_ratings === 'string' ? JSON.parse(criteria_ratings) : criteria_ratings; }
    catch (_) { return error(res, req.t('invalid_data'), 422); }
  }
  Review.validateReview(rating, parsedCriteria, comment);
  if (original_language != null && (typeof original_language !== 'string' || !translationService.SUPPORTED.includes(original_language.toLowerCase()))) return error(res, req.t('invalid_data'), 422);
  const lang = (original_language && /^[a-z]{2}$/i.test(original_language))
    ? original_language.toLowerCase()
    : await translationService.detectLanguageFallback(comment || '');

  const id = await withUploadedFiles(req.files, { ownerId: req.user.id, scope: 'reviews', scopeId: request_id }, files => Review.create({
    request_id,
    reviewer_id: req.user.id,
    provider_id: review_type === 'on_provider' ? target_user_id : null,
    target_user_id,
    review_type,
    rating: Number(rating),
    criteria_ratings: parsedCriteria,
    comment,
    original_language: lang,
    images: files.map(file => file.file_url),
  }));

  await notificationService.notifyUser(target_user_id, {
    type: 'new_review',
    title: req.t('notif_new_review_title'),
    body: `${rating}/5`,
    link: review_type === 'on_provider' ? `/provider/reviews` : `/profile`,
  });
  const review = await Review.findById(id);
  return created(res, review, req.t('review_sent'));
});

// GET /users/:id/reviews?type=on_provider&sort=recent&page=...
const getForUser = asyncHandler(async (req, res) => {
  const { type = 'on_provider', sort = 'recent' } = req.query;
  const { page, limit } = Request.pagination(req.query.page, req.query.limit);
  if (!['on_provider', 'on_requester'].includes(type) || !['recent', 'top', 'helpful'].includes(sort)) return error(res, req.t('invalid_data'), 422);
  const { items, total } = await Review.listForTarget(req.params.id, {
    reviewType: type, page, limit, sort,
  });
  // Optionally inject voted flag if authenticated
  if (req.user && items.length) {
    for (const item of items) {
      item.user_voted = await Review.userHasVoted(item.id, req.user.id);
    }
  }
  return paginate(res, items, total, page, limit);
});

// GET /users/:id/rating-stats?type=on_provider
const getStats = asyncHandler(async (req, res) => {
  if (req.query.type && !['on_provider', 'on_requester'].includes(req.query.type)) return error(res, req.t('invalid_data'), 422);
  const stats = await Review.getStatsForUser(req.params.id, req.query.type || 'on_provider');
  return success(res, stats);
});

// Provider profile back-compat: GET /users/:id/reviews -> on_provider
const getForProvider = asyncHandler(async (req, res) => {
  const { page, limit } = Request.pagination(req.query.page, req.query.limit);
  const { items, total } = await Review.listByProvider(req.params.providerId, { page, limit });
  return paginate(res, items, total, page, limit);
});

const reply = asyncHandler(async (req, res) => {
  const { reply: replyText } = req.body;
  const review = await Review.findById(req.params.id);
  if (!review) return notFound(res);
  // Only the target of the review (the rated user) may reply
  if (review.target_user_id !== req.user.id) return forbidden(res);
  await Review.addReply(req.params.id, replyText);
  return success(res, null, req.t('reply_added'));
});

// GET /reviews/:id/translation?lang=hi
const getTranslation = asyncHandler(async (req, res) => {
  const review = await Review.findVisibleById(req.params.id);
  if (!review || !review.is_visible || !review.comment) return notFound(res);
  const requestedLanguage = req.query.lang || req.lang || 'ar';
  if (typeof requestedLanguage !== 'string' || !translationService.SUPPORTED.includes(requestedLanguage.toLowerCase())) return error(res, req.t('invalid_data'), 422);
  const lang = requestedLanguage.toLowerCase();
  if (lang === review.original_language) {
    return success(res, { language: lang, text: review.comment, provider: 'noop' });
  }
  const cached = await Review.getCachedTranslation(review.id, lang);
  if (cached) {
    return success(res, { language: lang, text: cached.translated_text, provider: cached.provider, cached: true });
  }
  try {
    const t = await translationService.translate(review.comment, review.original_language, lang);
    if (t.provider !== 'noop') {
      await Review.setCachedTranslation(review.id, lang, t.text, t.provider);
    }
    return success(res, { language: lang, text: t.text, provider: t.provider, cached: false });
  } catch (err) {
    return success(res, { language: review.original_language, text: review.comment, provider: 'noop', error: 'translation_unavailable' });
  }
});

// POST /reviews/:id/helpful (toggle)
const voteHelpful = asyncHandler(async (req, res) => {
  const result = await Review.voteHelpful(req.params.id, req.user.id);
  return success(res, result);
});

// POST /reviews/:id/report
const report = asyncHandler(async (req, res) => {
  const { reason, details } = req.body;
  if (!reason) return error(res, req.t('invalid_data'));
  await Review.reportReview({
    review_id: req.params.id, reporter_id: req.user.id, reason, details,
  });
  return success(res, null, req.t('updated'));
});

module.exports = {
  create, getForUser, getStats, getForProvider, reply,
  getTranslation, voteHelpful, report,
};
