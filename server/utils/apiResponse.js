function success(res, data = null, message = 'تم بنجاح', status = 200, meta = null) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

function created(res, data = null, message = 'تم الإنشاء بنجاح') {
  return success(res, data, message, 201);
}

function error(res, message = 'حدث خطأ', status = 400, errors = null) {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
}

function notFound(res, message = 'العنصر غير موجود') {
  return error(res, message, 404);
}

function unauthorized(res, message = 'غير مصرح') {
  return error(res, message, 401);
}

function forbidden(res, message = 'لا تملك صلاحية للوصول') {
  return error(res, message, 403);
}

function paginate(res, items, total, page, limit, message = 'تم بنجاح') {
  const totalPages = Math.ceil(total / limit);
  return success(res, items, message, 200, {
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  });
}

module.exports = { success, created, error, notFound, unauthorized, forbidden, paginate };
