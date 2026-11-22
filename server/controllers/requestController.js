const Request = require('../models/Request');
const contactWindow = require('../utils/contactWindow');
const Conversation = require('../models/Conversation');
const Offer = require('../models/Offer');
const { query, queryOne, transaction } = require('../config/database');
const notificationService = require('../services/notificationService');
const { success, created, error, notFound, forbidden, paginate } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { withUploadedFiles } = require('../utils/uploadPersistence');
const { hasPermission } = require('../middleware/roleCheck');
const { requiredFields } = require('../utils/formFields');
const { ApiError } = require('../middleware/errorHandler');
const translationService = require('../services/translationService');
const requestTranslation = require('../services/requestTranslation');
// The reader's language for request texts (AYK-231): ?lang= or the site language.
const readerLang = req => String(req.query?.lang || req.lang || '').toLowerCase();

const privateAccess = (user, request) => user && (user.id === request.client_id
  || user.id === request.assigned_provider_id || user.id === request.direct_provider_id || hasPermission(user, 'requests.manage'));
const validId = value => typeof value === 'string' && /^[1-9][0-9]{0,9}$/.test(value) && Number(value) <= 2147483647;

const create = asyncHandler(async (req, res) => {
  // Admins may post requests too (the owner tests the site with the admin account).
  const canRequest = ['client', 'admin'].includes(req.user.role) || (req.user.role === 'provider' && Number(req.user.also_client) === 1);
  if (!canRequest) return forbidden(res, req.t('request_client_only'));
  const data = {
    client_id: req.user.id,
    category_id: req.body.category_id,
    service_id: req.body.service_id,
    title: req.body.title,
    description: req.body.description,
    city_id: req.body.city_id,
    district_id: req.body.district_id,
    address: req.body.address,
    latitude: req.body.latitude,
    longitude: req.body.longitude,
    country_id: req.body.country_id,
    region_id: req.body.region_id,
    governorate_id: req.body.governorate_id,
    remember_location: req.body.remember_location,
    budget_min: req.body.budget_min,
    budget_max: req.body.budget_max,
    preferred_date: req.body.preferred_date,
    is_urgent: [true, 1, 'true', '1'].includes(req.body.is_urgent), // AYK-419: a form sends «1»
  };
  // Fields the owner made required in «حقول النماذج» (AYK-218); the uploads are removed on refusal.
  const required = await requiredFields('request');
  const uploads = Array.isArray(req.files) ? req.files : [];
  const missing = (required.has('title') && !String(data.title || '').trim())
    || (required.has('details') && !String(data.description || '').trim())
    || (required.has('voice') && !uploads.some(file => String(file.mimetype).startsWith('audio/')))
    || (required.has('attachments') && !uploads.some(file => /^(image|video)\//.test(String(file.mimetype))))
    || (required.has('service') && !data.service_id && /^[1-9][0-9]{0,9}$/.test(String(data.category_id || ''))
      && await queryOne('SELECT id FROM services WHERE category_id = ? AND is_active = 1 LIMIT 1', [Number(data.category_id)]));
  let id;
  try {
    id = await withUploadedFiles(req.files, { ownerId: req.user.id, scope: 'requests' }, files => {
      if (missing) throw new ApiError(req.t('required_fields_missing'), 400);
      return Request.create({ ...data, files });
    });
  } catch (err) {
    if (err.message === 'account_location_required') err.message = req.t('account_location_required');
    throw err;
  }
  const request = await Request.findById(id);

  const io = req.app.get('io');
  if (io) io.emit('request:new_nearby', Request.publicView(request));
  await announceToProviders(req, request);
  created(res, request, req.t('request_created'));
  // AYK-420: the words of the request teach the site its people's dialect (roots and counts only).
  require('../services/dialectLearning').learnFromRequest(request).catch(() => {});
  // Into the providers' languages right away, so they read it in theirs at once (AYK-231).
  requestTranslation.translateForProviders(request).catch(() => {});
});

// Right after posting, providers of that profession covering the request's area who
// are working now are told, so they can contact the requester (AYK-041).
async function announceToProviders(req, request) {
  try {
    const ids = await require('./providerMapController').availableForRequest({
      districtId: request.district_id, cityId: request.city_id, categoryId: request.category_id,
      serviceId: request.service_id, excludeId: request.client_id,
    });
    await notificationService.broadcast(ids, {
      type: 'request_new',
      title: req.t('request_new_title'),
      body: req.t('request_new_body', { title: request.title }),
      link: `/requests/${request.id}`,
      data: { request_id: request.id },
    });
  } catch (_) { /* The request is posted; a failed notice must not undo it. */ }
}

const getMy = asyncHandler(async (req, res) => {
  const { status, scope } = req.query;
  const { page, limit } = Request.pagination(req.query.page, req.query.limit);
  const { items, total } = await Request.findByClient(req.user.id, { status, scope, page, limit });
  return paginate(res, items, total, page, limit);
});

const getNearby = asyncHandler(async (req, res) => {
  const { latitude, longitude, radius, category_id, service_id, city_id, status } = req.query;
  const { page, limit } = Request.pagination(req.query.page, req.query.limit);
  const { items, total } = await Request.findNearby({
    latitude,
    longitude,
    radiusKm: radius === undefined ? 25 : radius,
    cityId: city_id,
    categoryId: category_id,
    serviceId: service_id,
    status: status || 'open',
    page, limit,
    providerId: req.query.matching === '1' && req.user?.role === 'provider' ? req.user.id : null,
    // AYK-397: the home's «وسّع الدائرة».
    scope: req.query.scope ? String(req.query.scope) : null,
    viewerId: req.query.scope && !(req.query.matching === '1' && req.user?.role === 'provider') ? req.user?.id || null : null,
  });
  // Each request already in the reader's language when it was translated (AYK-231).
  const categories = await providerCategoryIds(req);
  const shown = await requestTranslation.attachTranslations(items.map(raw => withContact(req, raw, guestView(req, Request.publicView(raw)), categories)), readerLang(req));
  return paginate(res, shown, total, page, limit);
});

// GET /api/requests/previous-clients  (AYK-398, the owner: «في اللوحة يمكن استعراض العملاء السابقين
// فقط للاستعلام»). A provider's former requesters, read only. A requester's name stays hidden
// (AYK-142): the name the provider saved them under, else «طالب الخدمة», with the account number.
const getPreviousClients = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'provider') return forbidden(res);
  const rows = await Request.previousClients(req.user.id);
  const people = rows.map(row => ({ id: row.id, role: row.role, full_name: row.full_name }));
  await require('../utils/requesterPrivacy').hideRequesterNames(req.user.id, people, req.t('requester_label'));
  const translated = await requestTranslation.attachTranslations(rows.map(row => ({ id: row.last_request_id, title: row.last_request_title })), readerLang(req));
  return success(res, rows.map((row, index) => ({
    id: Number(row.id), name: people[index].full_name, account_number: row.referral_code || null,
    city_name_ar: row.city_name_ar, city_name_en: row.city_name_en, district_name_ar: row.district_name_ar, district_name_en: row.district_name_en,
    jobs: Number(row.jobs) || 0, last_at: row.last_at,
    last_request: { id: Number(row.last_request_id), title: row.last_request_title, translation: translated[index].translation || null },
    open_request_id: row.open_request_id ? Number(row.open_request_id) : null,
  })));
});

// GET /api/requests/:id/reach  (AYK-399): for its owner, how many providers see the open request.
const getReach = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const request = await Request.findById(req.params.id);
  if (!request || Number(request.client_id) !== Number(req.user.id)) return notFound(res);
  if (request.status !== 'open' || request.direct_provider_id) return success(res, null);
  return success(res, await require('./providerMapController').reachOfRequest({
    districtId: request.district_id, cityId: request.city_id, categoryId: request.category_id, serviceId: request.service_id, excludeId: req.user.id,
  }));
});

// PUT /api/requests/:id  (AYK-402, the owner: «طالب الخدمة إمكانية تعديل طلبه قبل الاتفاق»). While the
// request is open and nobody is assigned: its text, profession, service, place and urgency.
const update = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const updated = await Request.updateByOwner(Number(req.params.id), req.user.id, req.body || {});
  // Translations of the old text are dropped and made again for the providers (AYK-231).
  await query('DELETE FROM request_translations WHERE request_id = ?', [updated.id]).catch(() => {});
  requestTranslation.translateForProviders(updated).catch(() => {});
  return success(res, updated, req.t('updated'));
});

// AYK-413: a visitor who is not signed in sees a request without its owner's photo (no name,
// number or exact place is sent to anyone outside it already).
const guestView = (req, row) => (req.user ? row : { ...row, client_avatar: null });

// AYK-418 / AYK-438: the name, phone and WhatsApp a requester chose to show, each at its level:
// 1 = every signed-in service provider (any profession: «ظهوره لمقدمي الخدمة»), 2 = everyone who sees
// the request's panel, visitors too («ظهوره في لوحة العرض»). Only on an open request, never to the
// requester themself (they see their own choice on their request's page instead).
// (AYK-438 fixed: before, only a provider whose profession matched the request saw them, so a
// requester who allowed it often saw nothing appear.)
async function providerCategoryIds(req) {
  return req.user?.role === 'provider' ? true : null;
}
function withContact(req, raw, view, isProvider) {
  if (!raw || raw.status !== 'open' || Number(raw.client_id) === Number(req.user?.id)) return view;
  const level = key => Number(raw[key]) || 0;
  const shown = key => level(key) === 2 || (level(key) === 1 && isProvider === true);
  const out = { ...view };
  if (raw.client_contact_phone && shown('client_share_phone')) out.client_contact_phone = raw.client_contact_phone;
  if (raw.client_contact_whatsapp && shown('client_share_whatsapp')) out.client_contact_whatsapp = raw.client_contact_whatsapp;
  if (raw.client_contact_name && shown('client_share_name')) out.client_contact_name = raw.client_contact_name;
  return out;
}

const getOne = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res);
  const allowed = privateAccess(req.user, request);
  if (!allowed && (request.status !== 'open' || request.direct_provider_id || request.hidden_at)) return notFound(res);
  // AYK-244: each viewer once a day; the owner and crawlers are not counted.
  await require('../services/visitors').recordRequestView(req, request).catch(() => {});
  // A provider already in contact about the request also gets its voice note and photos.
  if (!allowed && req.user?.role === 'provider' && await queryOne('SELECT 1 AS ok FROM offers WHERE request_id = ? AND provider_id = ?', [request.id, req.user.id])) {
    return success(res, (await requestTranslation.attachTranslations([withContact(req, request, { ...Request.publicView(request), files: request.files }, await providerCategoryIds(req))], readerLang(req)))[0]);
  }
  if (!allowed) return success(res, (await requestTranslation.attachTranslations([withContact(req, request, guestView(req, Request.publicView(request)), await providerCategoryIds(req))], readerLang(req)))[0]);
  // How long the two sides can still write after it ends (AYK-081).
  const contactInfo = await queryOne(`SELECT ${contactWindow.DONE_DAYS_SQL} AS days,
      CASE WHEN ${contactWindow.FINISHED_SQL} THEN ${contactWindow.UNTIL_SQL} END AS until
    FROM requests r WHERE r.id = ?`, [request.id]);
  // The assigned provider does not see the requester's name either (AYK-142).
  const shown = Number(request.client_id) === Number(req.user?.id) || hasPermission(req.user, 'requests.manage') ? request : { ...request, client_name: null };
  const [withTranslation] = await requestTranslation.attachTranslations([{ ...shown }], readerLang(req));
  return success(res, { ...withTranslation, contact_days: Number(contactInfo?.days) || 7, contact_until: contactInfo?.until || null });
});

// The request's title and details in the viewer's language (AYK-229). Same visibility as
// getOne; a translation is saved once per language and read from there afterwards.
const getTranslation = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res);
  if (!privateAccess(req.user, request) && (request.status !== 'open' || request.direct_provider_id)) return notFound(res);
  const lang = readerLang(req) || 'ar';
  if (!translationService.SUPPORTED.includes(lang)) return error(res, req.t('invalid_data'), 422);
  return success(res, await requestTranslation.translationFor(request, lang));
});

const updateStatus = asyncHandler(async (req, res) => {
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res);

  const isOwner = request.client_id === req.user.id;
  const isAssigned = request.assigned_provider_id === req.user.id;
  const isAdmin = hasPermission(req.user, 'requests.manage');
  if (!isOwner && !isAssigned && !isAdmin) return forbidden(res, req.t('deny_request_parties'));

  const { status, cancellation_reason } = req.body;
  const allowed = ['in_progress', 'completed', 'cancelled', 'closed', 'open'];
  if (!allowed.includes(status)) return error(res, req.t('invalid_status'));

  const updated = await Request.updateStatus(req.params.id, status, { cancellation_reason, actor: req.user });

  // The provider withdrew: the request is open again; tell its owner (AYK-071).
  if (status === 'open' && isAssigned && updated.client_id) {
    await notificationService.notifyUser(updated.client_id, {
      type: 'request_withdrawn',
      title: req.t('notif_request_withdrawn_title'),
      body: `${req.user.full_name || ''} — ${updated.title || ''}`.trim(),
      link: `/requests/${updated.id}`,
    }).catch(() => {});
  }

  // The owner cancelled a request that was already given to a provider: tell that provider, who
  // otherwise only finds out by opening the request (AYK-258, found by the simulator).
  if (status === 'cancelled' && request.assigned_provider_id && Number(request.assigned_provider_id) !== Number(req.user.id)) {
    await notificationService.notifyUser(request.assigned_provider_id, {
      type: 'request_cancelled',
      title: req.t('notif_request_cancelled_title'),
      body: updated.title || '',
      link: `/requests/${updated.id}`,
      data: { request_id: updated.id },
    }).catch(() => {});
  }

  if (status === 'completed' && updated.assigned_provider_id && updated.client_id) {
    await notificationService.notifyUser(updated.client_id, {
      type: 'request_completed',
      title: req.t('notif_request_completed_title'),
      body: `تم إكمال طلبك: ${updated.title}`,
      link: `/requests/${updated.id}`,
    });
  }
  return success(res, updated, req.t('status_updated'));
});

const setReminders = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const off = req.body?.off !== false;
  if (!(await Request.setRemindersOff(Number(req.params.id), req.user.id, off))) return notFound(res);
  return success(res, { reminders_off: off ? 1 : 0 }, off ? req.t('request_reminders_off') : undefined);
});

// Direct contact, no price: a provider contacts the requester, or the requester contacts
// a matching provider. Either way one conversation per pair is opened for this request.
const contact = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res);
  if (request.status !== 'open') return error(res, req.t('request_not_open'), 409);
  const owner = request.client_id === req.user.id;
  const providerId = owner ? Number(req.body?.provider_id) : req.user.id;
  if (!owner && req.user.role !== 'provider') return forbidden(res, req.t('deny_providers_only'));
  if (!Number.isSafeInteger(providerId) || providerId < 1) return error(res, req.t('invalid_data'));
  if (request.direct_provider_id && providerId !== Number(request.direct_provider_id)) return forbidden(res, req.t('deny_direct_request'));
  // A provider starting the contact needs a subscription where one applies (AYK-042);
  // a requester contacting a provider is never stopped.
  if (!owner && await require('../services/subscriptionRules').blocks(providerId, { categoryId: request.category_id, cityId: request.city_id })) {
    return error(res, req.t('subscription_required'), 402);
  }
  if (await require('./userBlockController').blockedRefusal(req, res, owner ? providerId : request.client_id)) return undefined;
  await Offer.create({ request_id: request.id, provider_id: providerId, contact: true });
  const conversationId = await Conversation.findOrCreateBetween(request.client_id, providerId, request.id, {fresh:req.body?.fresh === true});
  // The chat opens at once; the other side's notice follows without delaying it (AYK-231).
  success(res, { conversation_id: conversationId });
  await notificationService.notifyUser(owner ? providerId : request.client_id, {
    type: 'request_contact',
    title: req.t('request_contact_title'),
    body: req.t('request_contact_body', { name: req.user.full_name, title: request.title }),
    link: `/chat/${conversationId}`,
    data: { request_id: request.id, conversation_id: conversationId },
  }).catch(() => {});
});

// "Agreed": the requester picks one provider; the request is assigned to them and the
// other conversations about this request become read-only.
const agree = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res);
  if (request.client_id !== req.user.id) return forbidden(res, req.t('deny_request_owner'));
  if (request.status !== 'open') return error(res, req.t('request_not_open'), 409);
  const providerId = Number(req.body?.provider_id);
  if (!Number.isSafeInteger(providerId) || providerId < 1) return error(res, req.t('invalid_data'));
  if (await require('./userBlockController').blockedRefusal(req, res, providerId)) return undefined;
  let offer = await queryOne("SELECT id FROM offers WHERE request_id = ? AND provider_id = ? AND status = 'pending'", [request.id, providerId]);
  if (!offer) offer = { id: await Offer.create({ request_id: request.id, provider_id: providerId, contact: true }) };
  await Offer.acceptOffer(offer.id, req.user.id);
  await notificationService.notifyUser(providerId, {
    type: 'offer_accepted',
    title: req.t('notif_offer_accepted_title'),
    body: req.t('notif_offer_accepted_body', { title: request.title }),
    link: `/requests/${request.id}`,
  });
  const conversationId = await Conversation.findOrCreateBetween(req.user.id, providerId, request.id);
  return success(res, { conversation_id: conversationId }, req.t('offer_accepted'));
});

// POST /requests/direct { provider_id, category_id? } — the requester contacts a provider
// from their directory without posting to the board. It is still a request (counted
// in the statistics, archived, agreed and rated as usual), seen by that provider only.
const direct = asyncHandler(async (req, res) => {
  const canRequest = req.user.role === 'client' || (req.user.role === 'provider' && Number(req.user.also_client) === 1);
  if (!canRequest) return forbidden(res, req.t('request_client_only'));
  const providerId = Number(req.body?.provider_id);
  if (!Number.isSafeInteger(providerId) || providerId < 1 || providerId === req.user.id) return error(res, req.t('invalid_data'));
  const provider = await queryOne(`SELECT u.id, pp.category_id FROM users u JOIN provider_profiles pp ON pp.user_id = u.id
    WHERE u.id = ? AND u.role = 'provider' AND u.deleted_at IS NULL AND u.is_active = 1 AND u.is_blocked = 0`, [providerId]);
  if (!provider) return notFound(res);
  if (await require('./userBlockController').blockedRefusal(req, res, providerId)) return undefined;
  // An open direct contact with the same provider is reopened rather than duplicated. Two taps (or
  // two devices) at the same instant wait for each other here, so the second finds the first's
  // request instead of making its own (AYK-258, found by the simulator).
  let existing = null, requestId = null;
  await transaction(async conn => {
    await conn.query('SELECT pg_advisory_xact_lock(?, ?)', [req.user.id, providerId]);
    existing = await queryOne(`SELECT id FROM requests WHERE client_id = ? AND direct_provider_id = ? AND deleted_at IS NULL
      AND status IN ('open', 'assigned', 'in_progress') ORDER BY id DESC LIMIT 1`, [req.user.id, providerId]);
    requestId = existing?.id;
    if (requestId) return;
    const categoryId = req.body?.category_id || provider.category_id || null;
    try {
      requestId = await Request.create({ client_id: req.user.id, category_id: categoryId, title: req.body?.title, description: req.body?.description });
    } catch (err) {
      if (err.message === 'account_location_required') err.message = req.t('account_location_required');
      throw err;
    }
    await query('UPDATE requests SET direct_provider_id = ?, reminders_off = 1 WHERE id = ?', [providerId, requestId]);
    await Offer.create({ request_id: requestId, provider_id: providerId, contact: true });
  });
  const request = await Request.findById(requestId);
  const conversationId = await Conversation.findOrCreateBetween(req.user.id, providerId, requestId, {fresh:req.body?.fresh === true});
  success(res, { request_id: requestId, conversation_id: conversationId });
  if (!existing) {
    await notificationService.notifyUser(providerId, {
      type: 'request_contact',
      title: req.t('request_contact_title'),
      body: req.t('request_contact_body', { name: req.user.full_name, title: request.title }),
      link: `/chat/${conversationId}`,
      data: { request_id: requestId, conversation_id: conversationId },
    }).catch(() => {});
  }
});

const remove = asyncHandler(async (req, res) => {
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res);
  if (request.client_id !== req.user.id && !hasPermission(req.user, 'requests.manage')) return forbidden(res, req.t('deny_request_owner'));
  await Request.softDelete(req.params.id, req.user);
  return success(res, null, req.t('request_deleted'));
});

const startChat = asyncHandler(async (req, res) => {
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res);

  if (![request.client_id, request.assigned_provider_id].includes(req.user.id)) return forbidden(res, req.t('deny_request_parties'));
  const otherUserId = req.user.id === request.client_id
    ? request.assigned_provider_id
    : request.client_id;
  if (!otherUserId) return error(res, req.t('chat_needs_two'));

  const convId = await Conversation.findOrCreateBetween(req.user.id, otherUserId, request.id);
  return success(res, { conversation_id: convId });
});

// A warranty agreed between the two sides (AYK-081): one proposes the days, the other accepts.
const WARRANTY_STATES = ['assigned', 'in_progress', 'completed'];
async function warrantyParties(req, res) {
  if (!validId(req.params.id)) { notFound(res); return null; }
  const request = await Request.findById(req.params.id);
  if (!request) { notFound(res); return null; }
  const owner = request.client_id === req.user.id;
  if (!owner && request.assigned_provider_id !== req.user.id) { forbidden(res, req.t('deny_request_parties')); return null; }
  if (!WARRANTY_STATES.includes(request.status)) { error(res, req.t('request_not_open'), 409); return null; }
  return { request, other: owner ? request.assigned_provider_id : request.client_id };
}

const proposeWarranty = asyncHandler(async (req, res) => {
  const days = Number(req.body?.days);
  if (!Number.isSafeInteger(days) || days < 1 || days > 365) return error(res, req.t('invalid_data'));
  const found = await warrantyParties(req, res);
  if (!found) return undefined;
  await query('UPDATE requests SET warranty_proposed_days = ?, warranty_proposed_by = ? WHERE id = ?', [days, req.user.id, found.request.id]);
  await notificationService.notifyUser(found.other, {
    type: 'request_warranty', title: req.t('warranty_proposed_title', { days }),
    body: req.t('warranty_proposed_body', { name: req.user.full_name, title: found.request.title }),
    link: `/requests/${found.request.id}`, data: { request_id: found.request.id },
  });
  return success(res, await Request.findById(found.request.id));
});

const acceptWarranty = asyncHandler(async (req, res) => {
  const found = await warrantyParties(req, res);
  if (!found) return undefined;
  const { request } = found;
  if (!request.warranty_proposed_days || request.warranty_proposed_by === req.user.id) return error(res, req.t('invalid_data'), 409);
  await query('UPDATE requests SET warranty_days = warranty_proposed_days, warranty_proposed_days = NULL, warranty_proposed_by = NULL WHERE id = ?', [request.id]);
  await notificationService.notifyUser(found.other, {
    type: 'request_warranty', title: req.t('warranty_agreed_title', { days: request.warranty_proposed_days }),
    body: request.title, link: `/requests/${request.id}`, data: { request_id: request.id },
  });
  return success(res, await Request.findById(request.id));
});

module.exports = {
  getPreviousClients, getReach, update,
  getTranslation, create, getMy, getNearby, getOne, updateStatus, setReminders, contact, agree, direct, remove, startChat, proposeWarranty, acceptWarranty };

// AYK-420: the words «اكتب طلبك بلهجتك» learned from published requests (public; roots only).
module.exports.learnedTerms = asyncHandler(async (req, res) => success(res, await require('../services/dialectLearning').learnedTerms()));
