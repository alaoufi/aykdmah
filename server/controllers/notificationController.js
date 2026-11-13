const Notification = require('../models/Notification');
const { success, paginate } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { unread } = req.query;
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 20));
  const { items, total, unread: unreadCount } = await Notification.listForUser(req.user.id, {
    unreadOnly: unread === 'true',
    page, limit,
  });
  const totalPages = Math.ceil(total / limit);
  return success(res, items, req.t('success'), 200, {
    pagination: { page: Number(page), limit: Number(limit), total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    unread: unreadCount,
  });
});

const markRead = asyncHandler(async (req, res) => {
  await Notification.markRead(req.params.id, req.user.id);
  return success(res, null, req.t('read_marked'));
});

const markAllRead = asyncHandler(async (req, res) => {
  await Notification.markAllRead(req.user.id);
  return success(res, null, req.t('all_read'));
});

module.exports = { list, markRead, markAllRead };
