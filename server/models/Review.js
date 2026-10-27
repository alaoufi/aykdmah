const { query, queryOne, transaction } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { pagination } = require('./Request');

function validateReview(rating, criteria, comment) {
  if ((typeof rating !== 'number' && typeof rating !== 'string') || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) throw new ApiError('invalid_rating', 422);
  if (comment != null && (typeof comment !== 'string' || comment.length > 10000 || comment.includes('\0'))) throw new ApiError('invalid_comment', 422);
  const allowed = new Set(['quality', 'professionalism', 'speed', 'communication', 'accuracy', 'commitment', 'respect', 'payment', 'clarity']);
  if (criteria != null && (typeof criteria !== 'object' || Array.isArray(criteria) || Object.keys(criteria).length > 9
    || Object.entries(criteria).some(([key, value]) => !allowed.has(key) || !Number.isInteger(value) || value < 1 || value > 5))) throw new ApiError('invalid_criteria', 422);
}

async function lockProvider(conn, targetId) {
  await conn.query('SELECT user_id FROM provider_profiles WHERE user_id = ? FOR UPDATE', [targetId]);
}

async function syncRating(conn, targetId) {
  const [[stats]] = await conn.query(
    "SELECT AVG(rating) AS avg_rating, COUNT(*) AS count_rating FROM reviews WHERE target_user_id = ? AND review_type = 'on_provider' AND is_visible = 1", [targetId]);
  await conn.execute('UPDATE provider_profiles SET rating_avg = ?, rating_count = ? WHERE user_id = ?', [Number(stats.avg_rating || 0).toFixed(2), stats.count_rating, targetId]);
}

const REVIEW_SELECT = `
  r.id, r.request_id, r.reviewer_id, r.provider_id, r.target_user_id,
  r.review_type, r.rating, r.criteria_ratings, r.comment, r.images,
  r.original_language, r.is_visible, r.helpful_count, r.report_count,
  r.provider_reply, r.provider_reply_at, r.created_at,
  CASE WHEN ru.deleted_at IS NULL THEN ru.full_name ELSE NULL END AS reviewer_name, CASE WHEN ru.deleted_at IS NULL THEN ru.avatar ELSE NULL END AS reviewer_avatar,
  CASE WHEN tu.deleted_at IS NULL THEN tu.full_name ELSE NULL END AS target_name, CASE WHEN tu.deleted_at IS NULL THEN tu.avatar ELSE NULL END AS target_avatar,
  CASE WHEN req.deleted_at IS NULL THEN req.title ELSE NULL END AS request_title
`;
const REVIEW_JOINS = `
  JOIN users ru ON r.reviewer_id = ru.id
  LEFT JOIN users tu ON r.target_user_id = tu.id
  LEFT JOIN requests req ON r.request_id = req.id
`;

function parseRow(r) {
  if (!r) return r;
  if (typeof r.criteria_ratings === 'string') {
    try { r.criteria_ratings = JSON.parse(r.criteria_ratings); } catch (_) { r.criteria_ratings = null; }
  }
  if (typeof r.images === 'string') {
    try { r.images = JSON.parse(r.images); } catch (_) { r.images = []; }
  }
  return r;
}

async function create({
  request_id, reviewer_id, target_user_id, provider_id,
  review_type = 'on_provider',
  rating, criteria_ratings = null, comment = null,
  original_language = 'ar', images = [],
}) {
  validateReview(rating, criteria_ratings, comment);
  return transaction(async (conn) => {
    const [[request]] = await conn.query('SELECT * FROM requests WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [request_id]);
    if (!request || request.status !== 'completed' || !request.assigned_provider_id) throw new ApiError('must_complete_first', 409);
    const isClient = request.client_id === reviewer_id;
    const isProvider = request.assigned_provider_id === reviewer_id;
    if (!isClient && !isProvider) throw new ApiError('forbidden', 403);
    review_type = isClient ? 'on_provider' : 'on_requester';
    target_user_id = isClient ? request.assigned_provider_id : request.client_id;
    provider_id = target_user_id;
    const [[active]] = await conn.query("SELECT id FROM disputes WHERE request_id = ? AND status IN ('open','under_review','waiting_response','escalated') LIMIT 1", [request_id]);
    if (active) throw new ApiError('dispute_blocks_review', 403);
    const [[resolved]] = await conn.query("SELECT ratings_allowed FROM disputes WHERE request_id = ? AND status IN ('resolved','rejected','closed') ORDER BY id DESC LIMIT 1", [request_id]);
    if (resolved && (['none', 'pending'].includes(resolved.ratings_allowed) || (resolved.ratings_allowed === 'client_only' && !isClient) || (resolved.ratings_allowed === 'provider_only' && !isProvider))) throw new ApiError('ratings_blocked', 403);
    const [[existing]] = await conn.query('SELECT id FROM reviews WHERE request_id = ? AND reviewer_id = ? AND review_type = ?', [request_id, reviewer_id, review_type]);
    if (existing) throw new ApiError('review_exists', 409);
    if (review_type === 'on_provider') await lockProvider(conn, target_user_id);
    const [result] = await conn.execute(
      `INSERT INTO reviews
        (request_id, reviewer_id, provider_id, target_user_id, review_type,
         rating, criteria_ratings, comment, original_language, images)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        request_id, reviewer_id, provider_id || target_user_id, target_user_id,
        review_type, rating,
        criteria_ratings ? JSON.stringify(criteria_ratings) : null,
        comment, original_language,
        JSON.stringify(images || []),
      ]
    );
    if (review_type === 'on_provider') await syncRating(conn, target_user_id);
    return result.insertId;
  });
}

async function findById(id) {
  const r = await queryOne(
    `SELECT ${REVIEW_SELECT} FROM reviews r ${REVIEW_JOINS} WHERE r.id = ?`,
    [id]
  );
  return parseRow(r);
}

async function findVisibleById(id) {
  return parseRow(await queryOne(`SELECT ${REVIEW_SELECT} FROM reviews r ${REVIEW_JOINS}
    WHERE r.id = ? AND r.is_visible = 1 AND tu.id IS NOT NULL AND tu.deleted_at IS NULL`, [id]));
}

async function findByRequestAndReviewer(request_id, reviewer_id, review_type) {
  return queryOne(
    'SELECT * FROM reviews WHERE request_id = ? AND reviewer_id = ? AND review_type = ? LIMIT 1',
    [request_id, reviewer_id, review_type]
  );
}

async function listForTarget(targetUserId, { reviewType = 'on_provider', page = 1, limit = 20, sort = 'recent' } = {}) {
  ({ page, limit } = pagination(page, limit));
  const offset = (page - 1) * limit;
  const orderBy = sort === 'top' ? 'r.rating DESC, r.helpful_count DESC, r.id DESC'
                : sort === 'helpful' ? 'r.helpful_count DESC, r.id DESC'
                : 'r.id DESC';
  const items = await query(
    `SELECT ${REVIEW_SELECT} FROM reviews r ${REVIEW_JOINS}
     WHERE r.target_user_id = ? AND r.review_type = ? AND r.is_visible = 1 AND tu.deleted_at IS NULL AND tu.id IS NOT NULL
     ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [targetUserId, reviewType, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM reviews r JOIN users target ON target.id = r.target_user_id
     WHERE r.target_user_id = ? AND r.review_type = ? AND r.is_visible = 1 AND target.deleted_at IS NULL`,
    [targetUserId, reviewType]
  );
  return { items: items.map(parseRow), total };
}

async function listByProvider(providerId, opts = {}) {
  return listForTarget(providerId, { ...opts, reviewType: 'on_provider' });
}

async function getStatsForUser(userId, reviewType = 'on_provider') {
  const row = await queryOne(
    `SELECT
       COALESCE(AVG(rating),0) AS rating_avg,
       COUNT(*) AS rating_count,
       SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS five_stars,
       SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS four_stars,
       SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS three_stars,
       SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS two_stars,
       SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS one_star
     FROM reviews JOIN users target ON target.id = reviews.target_user_id
     WHERE target_user_id = ? AND review_type = ? AND is_visible = 1 AND target.deleted_at IS NULL`,
    [userId, reviewType]
  );
  return {
    rating_avg: Number(row?.rating_avg || 0),
    rating_count: Number(row?.rating_count || 0),
    breakdown: {
      5: Number(row?.five_stars || 0),
      4: Number(row?.four_stars || 0),
      3: Number(row?.three_stars || 0),
      2: Number(row?.two_stars || 0),
      1: Number(row?.one_star || 0),
    },
  };
}

async function addReply(reviewId, replyText) {
  if (typeof replyText !== 'string' || !replyText.trim() || replyText.length > 10000 || replyText.includes('\0')) throw new ApiError('invalid_reply', 422);
  await query(
    'UPDATE reviews SET provider_reply = ?, provider_reply_at = CURRENT_TIMESTAMP WHERE id = ?',
    [replyText, reviewId]
  );
}

// ---- Translation cache ----
async function getCachedTranslation(reviewId, lang) {
  return queryOne(
    'SELECT translated_text, provider FROM review_translations WHERE review_id = ? AND language = ?',
    [reviewId, lang]
  );
}

async function setCachedTranslation(reviewId, lang, text, provider) {
  await query(
    `INSERT INTO review_translations (review_id, language, translated_text, provider)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (review_id, language) DO UPDATE SET
       translated_text = EXCLUDED.translated_text,
       provider = EXCLUDED.provider`,
    [reviewId, lang, text, provider]
  );
}

// ---- Helpful votes ----
async function voteHelpful(reviewId, userId) {
  return transaction(async (conn) => {
    const [[review]] = await conn.query('SELECT id, is_visible FROM reviews WHERE id = ? FOR UPDATE', [reviewId]);
    if (!review || !review.is_visible) throw new ApiError('review_not_found', 404);
    const [exists] = await conn.query(
      'SELECT id FROM review_votes WHERE review_id = ? AND user_id = ?',
      [reviewId, userId]
    );
    if (exists.length) {
      // Toggle off
      await conn.execute('DELETE FROM review_votes WHERE id = ?', [exists[0].id]);
      await conn.execute('UPDATE reviews SET helpful_count = GREATEST(0, helpful_count - 1) WHERE id = ?', [reviewId]);
      const [[{ helpful_count }]] = await conn.query('SELECT helpful_count FROM reviews WHERE id = ?', [reviewId]);
      return { voted: false, helpful_count };
    }
    await conn.execute(
      'INSERT INTO review_votes (review_id, user_id) VALUES (?, ?)',
      [reviewId, userId]
    );
    await conn.execute('UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = ?', [reviewId]);
    const [[{ helpful_count }]] = await conn.query('SELECT helpful_count FROM reviews WHERE id = ?', [reviewId]);
    return { voted: true, helpful_count };
  });
}

async function userHasVoted(reviewId, userId) {
  if (!userId) return false;
  const row = await queryOne('SELECT id FROM review_votes WHERE review_id = ? AND user_id = ?', [reviewId, userId]);
  return !!row;
}

// ---- Abuse reports ----
async function reportReview({ review_id, reporter_id, reason, details }) {
  if (!['spam', 'offensive', 'fake', 'other'].includes(reason) || (details != null && (typeof details !== 'string' || details.length > 2000 || details.includes('\0')))) throw new ApiError('invalid_report', 422);
  return transaction(async (conn) => {
    const [[review]] = await conn.query('SELECT * FROM reviews WHERE id = ? FOR UPDATE', [review_id]);
    if (!review || !review.is_visible) throw new ApiError('review_not_found', 404);
    const [[existing]] = await conn.query('SELECT id FROM review_reports WHERE review_id = ? AND reporter_id = ? LIMIT 1', [review_id, reporter_id]);
    if (existing) throw new ApiError('review_report_exists', 409);
    if (review.review_type === 'on_provider') await lockProvider(conn, review.target_user_id);
    await conn.execute(
      'INSERT INTO review_reports (review_id, reporter_id, reason, details) VALUES (?, ?, ?, ?)',
      [review_id, reporter_id, reason, details || null]
    );
    await conn.execute('UPDATE reviews SET report_count = report_count + 1 WHERE id = ?', [review_id]);
    // Auto-hide if exceeded threshold
    const [[thresholdRow]] = await conn.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'review_auto_hide_reports' LIMIT 1"
    );
    const configuredThreshold = Number(thresholdRow?.setting_value);
    const threshold = Number.isSafeInteger(configuredThreshold) && configuredThreshold >= 1 && configuredThreshold <= 100 ? configuredThreshold : 3;
    const [[reviewRow]] = await conn.query('SELECT report_count FROM reviews WHERE id = ?', [review_id]);
    if (reviewRow && reviewRow.report_count >= threshold) {
      await conn.execute('UPDATE reviews SET is_visible = 0 WHERE id = ?', [review_id]);
      if (review.review_type === 'on_provider') await syncRating(conn, review.target_user_id);
    }
  });
}

// ---- Admin ----
async function listAdmin({ page = 1, limit = 20, visibility } = {}) {
  ({ page, limit } = pagination(page, limit));
  const offset = (page - 1) * limit;
  const where = [];
  const params = [];
  if (visibility === 'visible') where.push('r.is_visible = 1');
  else if (visibility === 'hidden') where.push('r.is_visible = 0');
  else if (visibility === 'reported') where.push('r.report_count > 0');
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const items = await query(
    `SELECT ${REVIEW_SELECT}, r.report_count FROM reviews r ${REVIEW_JOINS}
     ${whereSql}
     ORDER BY r.id DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM reviews r ${whereSql}`,
    params
  );
  return { items: items.map(parseRow), total };
}

async function setVisibility(id, isVisible) {
  return transaction(async conn => {
    const [[review]] = await conn.query('SELECT * FROM reviews WHERE id = ? FOR UPDATE', [id]);
    if (!review) throw new ApiError('review_not_found', 404);
    if (review.review_type === 'on_provider') await lockProvider(conn, review.target_user_id);
    await conn.execute('UPDATE reviews SET is_visible = ? WHERE id = ?', [isVisible ? 1 : 0, id]);
    if (review.review_type === 'on_provider') await syncRating(conn, review.target_user_id);
    return { ...review, is_visible: isVisible ? 1 : 0 };
  });
}

async function adminDelete(id) {
  await transaction(async conn => {
    const [[review]] = await conn.query('SELECT * FROM reviews WHERE id = ? FOR UPDATE', [id]);
    if (!review) throw new ApiError('review_not_found', 404);
    if (review.review_type === 'on_provider') await lockProvider(conn, review.target_user_id);
    await conn.execute('DELETE FROM reviews WHERE id = ?', [id]);
    if (review.review_type === 'on_provider') await syncRating(conn, review.target_user_id);
  });
}

module.exports = {
  create, findById, findVisibleById, findByRequestAndReviewer, validateReview,
  listForTarget, listByProvider, getStatsForUser,
  addReply,
  getCachedTranslation, setCachedTranslation,
  voteHelpful, userHasVoted, reportReview,
  listAdmin, setVisibility, adminDelete,
  // Back-compat aliases for code that still uses the old names
  findByProvider: listByProvider,
  findByRequest: async (req_id) => queryOne('SELECT * FROM reviews WHERE request_id = ? LIMIT 1', [req_id]),
};
