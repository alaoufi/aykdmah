// One-to-one voice and video calls over a self-hosted LiveKit server.
//
// Rules:
// - A call belongs to a conversation, and both people must currently be allowed to
//   message each other there (Conversation.canSend), so blocks, closed negotiations
//   and strangers are refused exactly as in chat.
// - Each call gets its own random room limited to two participants. Join tokens are
//   short-lived, minted here only for the caller and callee, and only while the call
//   is active, so knowing a room name grants nothing.
// - Nothing is recorded: tokens cannot publish data or start egress, and only call
//   metadata (who, when, how long, outcome) is stored.
const crypto = require('crypto');
const { AccessToken, RoomServiceClient, TrackSource, WebhookReceiver } = require('livekit-server-sdk');
const { query, queryOne, transaction } = require('../config/database');
const Conversation = require('../models/Conversation');
const { emitUser, emitConversation } = require('../utils/conversationEvents');
const notificationService = require('./notificationService');
const pushService = require('./pushService');
const { translate } = require('../utils/i18n');
const logger = require('../utils/logger');

const RING_TIMEOUT_MS = 45 * 1000;
// How often a still-ringing call is announced again on the callee's devices (AYK-067).
const RING_REPEAT_MS = 8 * 1000;
const MAX_CALL_MS = 4 * 60 * 60 * 1000;
const TOKEN_TTL = '15m';
const REJOIN_GRACE_MS = 30 * 1000;
const ACTIVE = ['ringing', 'accepted'];

const config = () => ({
  url: process.env.LIVEKIT_URL || '',
  apiUrl: process.env.LIVEKIT_API_URL || '',
  key: process.env.LIVEKIT_API_KEY || '',
  secret: process.env.LIVEKIT_API_SECRET || '',
});
const isConfigured = () => { const c = config(); return !!(c.url && c.key && c.secret && c.secret.length >= 32); };

let io = null;
let sweeper = null;
function attach(ioInstance) {
  io = ioInstance;
  if (!sweeper) {
    sweeper = setInterval(() => sweep().catch(err => logger.warn('Call sweep failed:', err.message)), 10 * 1000);
    sweeper.unref?.();
  }
}

function fail(status, code) { return Object.assign(new Error(code), { status, code }); }

function roomClient() {
  const c = config();
  return c.apiUrl ? new RoomServiceClient(c.apiUrl, c.key, c.secret) : null;
}

async function closeRoom(roomName) {
  try { await roomClient()?.deleteRoom(roomName); } catch (_) { /* Already gone or LiveKit restarting. */ }
}

function publicCall(row, viewerId) {
  if (!row) return null;
  const outgoing = Number(row.caller_id) === Number(viewerId);
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    request_id: row.request_id,
    call_type: row.call_type,
    status: row.status,
    end_reason: row.end_reason,
    direction: outgoing ? 'outgoing' : 'incoming',
    peer: {
      id: outgoing ? row.callee_id : row.caller_id,
      full_name: outgoing ? row.callee_name : row.caller_name,
      avatar: outgoing ? row.callee_avatar : row.caller_avatar,
    },
    created_at: row.created_at,
    answered_at: row.answered_at,
    ended_at: row.ended_at,
    duration_seconds: row.duration_seconds,
  };
}

const CALL_SELECT = `SELECT k.*, caller.full_name AS caller_name, caller.avatar AS caller_avatar,
  callee.full_name AS callee_name, callee.avatar AS callee_avatar
  FROM calls k JOIN users caller ON caller.id = k.caller_id JOIN users callee ON callee.id = k.callee_id`;

const findCall = id => queryOne(`${CALL_SELECT} WHERE k.id = ?`, [id]);

async function emitState(row, event = 'call:state') {
  if (!io || !row) return;
  for (const userId of [row.caller_id, row.callee_id]) {
    await emitUser(io, userId, event, publicCall(row, userId)).catch(() => {});
  }
}

async function start({ caller, conversationId, callType }) {
  if (!isConfigured()) throw fail(503, 'calls_unavailable');
  if (!['audio', 'video'].includes(callType)) throw fail(400, 'invalid_call_type');
  conversationId = Number(conversationId);
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0) throw fail(400, 'invalid_conversation');
  if (!await Conversation.canSend(conversationId, caller.id)) throw fail(403, 'call_forbidden');
  const participants = await Conversation.getParticipants(conversationId);
  const others = participants.filter(p => Number(p.id) !== Number(caller.id));
  if (participants.length !== 2 || others.length !== 1) throw fail(403, 'call_forbidden');
  const callee = others[0];
  if (!await Conversation.canSend(conversationId, callee.id)) throw fail(403, 'call_forbidden');
  const conversation = await Conversation.findById(conversationId);

  // Calling the same person again (the last try did not connect) replaces the caller's own
  // earlier call to them instead of refusing with "busy" (AYK-058). Only after 5 s, so a double
  // tap still makes one call; the other side calling back meanwhile is still "busy".
  const stale = await query(`${CALL_SELECT} WHERE k.status IN ('ringing', 'accepted') AND k.caller_id = ? AND k.callee_id = ?
    AND k.created_at < CURRENT_TIMESTAMP - INTERVAL '5 seconds'`, [caller.id, callee.id]);
  for (const row of stale) await finish(row, row.status === 'accepted' ? 'ended' : 'cancelled', 'replaced');

  const roomName = `call_${crypto.randomUUID().replace(/-/g, '')}`;
  const callId = await transaction(async conn => {
    // Lock both users so two simultaneous calls cannot both pass the busy check.
    const pair = [Number(caller.id), Number(callee.id)].sort((a, b) => a - b);
    await conn.query('SELECT id FROM users WHERE id IN (?, ?) ORDER BY id FOR UPDATE', pair);
    const [busy] = await conn.query(`SELECT id, caller_id, callee_id FROM calls
      WHERE status IN ('ringing', 'accepted') AND (caller_id IN (?, ?) OR callee_id IN (?, ?))`, [...pair, ...pair]);
    if (busy.length) throw fail(409, 'call_busy');
    const [result] = await conn.execute(`INSERT INTO calls (room_name, conversation_id, request_id, caller_id, callee_id, call_type, status)
      VALUES (?, ?, ?, ?, ?, ?, 'ringing')`, [roomName, conversationId, conversation?.request_id || null, caller.id, callee.id, callType]);
    return result.insertId;
  });

  try { await roomClient()?.createRoom({ name: roomName, maxParticipants: 2, emptyTimeout: 60, departureTimeout: 20 }); }
  catch (err) { logger.warn('LiveKit room pre-create failed:', err.message); }

  const row = await findCall(callId);
  if (io) await emitUser(io, callee.id, 'call:incoming', publicCall(row, callee.id)).catch(() => {});
  // Rings the callee's devices even when the site is closed. It expires with the ring.
  // Sent again every 8 s while it is still ringing: each one sounds and vibrates again
  // (renotify, same tag), so a closed app keeps "ringing" until answered or ended (AYK-067).
  const ringPayload = lang => ({
    kind: 'call', call_id: callId, tag: `call-${callId}`, url: `/chat/${conversationId}`,
    answer_url: `/chat/${conversationId}?answer=${callId}`,
    actions: [{ action: 'answer', title: translate(lang, 'push_call_answer') }, { action: 'decline', title: translate(lang, 'push_call_decline') }],
    title: translate(lang, callType === 'video' ? 'push_call_video' : 'push_call_audio'),
    body: translate(lang, 'push_call_body', { name: row.caller_name || '' }),
  });
  const ring = round => pushService.sendToUser(callee.id, ringPayload,
    { TTL: Math.max(5, Math.round((RING_TIMEOUT_MS - round * RING_REPEAT_MS) / 1000)), urgency: 'high', topic: `call-${callId}` })
    .then(sent => logger.info(`Push call call=${callId} user=${callee.id} round=${round} devices=${sent}`))
    .catch(err => logger.warn('Call push failed:', err.message));
  ring(0);
  let round = 0;
  const repeat = setInterval(async () => {
    round += 1;
    const current = await findCall(callId).catch(() => null);
    if (!current || current.status !== 'ringing' || round * RING_REPEAT_MS >= RING_TIMEOUT_MS) { clearInterval(repeat); return; }
    ring(round);
  }, RING_REPEAT_MS);
  repeat.unref?.();
  // Can it ring anywhere? The site open on a device, or notifications enabled on one.
  let reachable = true;
  try {
    // Online only when a live connection proves it; otherwise notifications must reach a device.
    const online = io ? (await io.in(`user:${callee.id}`).fetchSockets()).length > 0 : false;
    reachable = online || (await require('../models/PushSubscription').listForUser(callee.id)).length > 0;
  } catch (_) { reachable = true; }
  return { ...publicCall(row, caller.id), callee_reachable: reachable };
}

async function participantCall(callId, userId) {
  const row = await findCall(Number(callId));
  if (!row || ![Number(row.caller_id), Number(row.callee_id)].includes(Number(userId))) throw fail(404, 'call_not_found');
  return row;
}

// Moves an active call to a final state once, even under concurrent requests.
async function finish(row, status, reason) {
  // The data layer reports UPDATE results as affectedRows, not rows.
  const updated = await query(`UPDATE calls SET status = ?, end_reason = ?, ended_at = CURRENT_TIMESTAMP,
      duration_seconds = CASE WHEN answered_at IS NULL THEN NULL
        ELSE CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - answered_at)) AS INTEGER) END
    WHERE id = ? AND status IN ('ringing', 'accepted')`, [status, reason, row.id]);
  if (!updated.affectedRows) return findCall(row.id);
  await closeRoom(row.room_name);
  const final = await findCall(row.id);
  await emitState(final);
  // The ringing notification on the callee's closed devices (same tag and topic replace it):
  // unanswered (the caller gave up, or no answer) becomes a lasting "missed call" that opens
  // the chat, like WhatsApp (AYK-064); declined or answered elsewhere just closes it.
  if (row.status === 'ringing') {
    // A call replaced by the caller's next try is not "missed": the new one is ringing.
    const missed = status === 'missed' || (status === 'cancelled' && reason !== 'replaced' && reason !== 'failed');
    pushService.sendToUser(row.callee_id, missed
      ? lang => ({
        kind: 'missed_call', call_id: row.id, tag: `call-${row.id}`, url: `/chat/${row.conversation_id}`,
        title: translate(lang, 'push_missed_title'), body: translate(lang, 'push_missed_body', { name: row.caller_name || '' }),
      })
      : { kind: 'call_end', call_id: row.id, tag: `call-${row.id}` },
    { TTL: missed ? 24 * 3600 : 60, urgency: 'high', topic: `call-${row.id}` })
      .then(sent => logger.info(`Push ${missed ? 'missed_call' : 'call_end'} call=${row.id} user=${row.callee_id} devices=${sent}`))
      .catch(() => {});
    if (missed) await recordMissedCall(row).catch(err => logger.warn('Missed call line failed:', err.message));
  }
  if (status === 'missed' || (status === 'cancelled' && !row.answered_at)) {
    notificationService.notifyUser(row.callee_id, {
      type: 'missed_call',
      title: 'مكالمة فائتة',
      body: `${row.caller_name} حاول الاتصال بك`,
      data: { call_id: row.id, conversation_id: row.conversation_id },
      link: `/chat/${row.conversation_id}`,
    }).catch(() => {});
  }
  return final;
}

// A missed call stays in the chat as a line, like WhatsApp: the callee sees it later and calls
// back from it (AYK-088). The content is a code the app shows in the reader's language.
async function recordMissedCall(row) {
  const kind = row.call_type === 'video' ? 'video' : 'audio';
  const inserted = await query("INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES (?, ?, ?, 'system')",
    [row.conversation_id, row.caller_id, `call:missed:${kind}`]);
  await query('UPDATE conversations SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP WHERE id = ?', [inserted.insertId, row.conversation_id]);
  const message = await require('../models/Message').findById(inserted.insertId);
  if (io && message) await emitConversation(io, row.conversation_id, 'chat:message', message).catch(() => {});
}

async function accept(callId, user) {
  const row = await participantCall(callId, user.id);
  if (Number(row.callee_id) !== Number(user.id)) throw fail(403, 'call_forbidden');
  if (row.status !== 'ringing') throw fail(409, 'call_not_ringing');
  if (!await Conversation.canSend(row.conversation_id, user.id)) {
    await finish(row, 'failed', 'permission_revoked');
    throw fail(403, 'call_forbidden');
  }
  const updated = await query(`UPDATE calls SET status = 'accepted', answered_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'ringing'`, [row.id]);
  if (!updated.affectedRows) throw fail(409, 'call_not_ringing');
  const final = await findCall(row.id);
  await emitState(final);
  return publicCall(final, user.id);
}

async function decline(callId, user, why) {
  const row = await participantCall(callId, user.id);
  const isCaller = Number(row.caller_id) === Number(user.id);
  const status = row.status === 'accepted' ? 'ended' : isCaller ? 'cancelled' : 'rejected';
  // The caller's own device failed (camera or microphone refused, no connection): not a missed call (AYK-087).
  const failed = isCaller && row.status === 'ringing' && why === 'failed';
  const reason = row.status === 'accepted' ? (isCaller ? 'caller_hangup' : 'callee_hangup') : failed ? 'failed' : status;
  return publicCall(await finish(row, status, reason), user.id);
}

// Short-lived token for this call's room only. The caller may join while ringing
// so the media path is ready; the callee only after accepting.
async function joinToken(callId, user) {
  if (!isConfigured()) throw fail(503, 'calls_unavailable');
  const row = await participantCall(callId, user.id);
  const isCaller = Number(row.caller_id) === Number(user.id);
  if (!(row.status === 'accepted' || (row.status === 'ringing' && isCaller))) throw fail(409, 'call_not_active');
  if (!await Conversation.canSend(row.conversation_id, user.id)) throw fail(403, 'call_forbidden');
  const c = config();
  const token = new AccessToken(c.key, c.secret, {
    identity: `user-${user.id}`,
    name: isCaller ? row.caller_name : row.callee_name,
    ttl: TOKEN_TTL,
    metadata: JSON.stringify({ call_id: row.id }),
  });
  token.addGrant({
    room: row.room_name, roomJoin: true, canPublish: true, canSubscribe: true,
    canPublishData: false, canUpdateOwnMetadata: false, roomRecord: false, roomAdmin: false,
    canPublishSources: row.call_type === 'video' ? [TrackSource.MICROPHONE, TrackSource.CAMERA] : [TrackSource.MICROPHONE],
  });
  return { url: c.url, token: await token.toJwt(), room: row.room_name, call: publicCall(row, user.id) };
}

async function active(userId) {
  const rows = await query(`${CALL_SELECT} WHERE k.status IN ('ringing', 'accepted')
    AND (k.caller_id = ? OR k.callee_id = ?) ORDER BY k.id DESC LIMIT 5`, [userId, userId]);
  return rows.map(row => publicCall(row, userId));
}

async function history(userId, { conversationId, requestId } = {}) {
  const filters = ['(k.caller_id = ? OR k.callee_id = ?)'];
  const params = [userId, userId];
  if (conversationId) { filters.push('k.conversation_id = ?'); params.push(Number(conversationId)); }
  if (requestId) { filters.push('k.request_id = ?'); params.push(Number(requestId)); }
  const rows = await query(`${CALL_SELECT} WHERE ${filters.join(' AND ')} ORDER BY k.id DESC LIMIT 50`, params);
  return rows.map(row => publicCall(row, userId));
}

// Which conversation (if any) lets this user call another user right now.
async function eligibility(userId, otherUserId) {
  const rows = await query(`SELECT c.id FROM conversations c
    JOIN conversation_participants a ON a.conversation_id = c.id AND a.user_id = ?
    JOIN conversation_participants b ON b.conversation_id = c.id AND b.user_id = ?
    WHERE (SELECT COUNT(*) FROM conversation_participants n WHERE n.conversation_id = c.id) = 2
    ORDER BY c.updated_at DESC NULLS LAST, c.id DESC LIMIT 10`, [userId, otherUserId]);
  for (const row of rows) {
    if (await Conversation.canSend(row.id, userId) && await Conversation.canSend(row.id, otherUserId)) {
      return { allowed: true, conversation_id: row.id, configured: isConfigured() };
    }
  }
  return { allowed: false, conversation_id: null, configured: isConfigured() };
}

async function report(callId, user, reason) {
  const row = await participantCall(callId, user.id);
  const text = String(reason || '').trim();
  if (text.length < 3 || text.length > 500) throw fail(400, 'invalid_report');
  await query(`INSERT INTO call_reports (call_id, reporter_id, reason) VALUES (?, ?, ?)
    ON CONFLICT (call_id, reporter_id) DO NOTHING`, [row.id, user.id, text]);
  return { reported: true };
}

// Quality summary of an answered call from one participant's browser (AYK-060). Numbers only,
// clamped; one row per participant and call (a second report is ignored).
async function diagnostics(callId, user, body = {}) {
  const row = await participantCall(callId, user.id);
  if (!row.answered_at) return { saved: false };
  const int = (value, max) => { const n = Math.round(Number(value)); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null; };
  const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
  const loss = Number(body.packet_loss_pct);
  await query(`INSERT INTO call_diagnostics (call_id, user_id, connection_type, rtt_ms, jitter_ms, packet_loss_pct,
      audio_kb_in, audio_kb_out, video_kb_in, poor_seconds, reconnects, audio_blocked, network_type, device)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (call_id, user_id) DO NOTHING`, [
    row.id, user.id,
    ['udp', 'tcp', 'relay-udp', 'relay-tcp', 'relay-tls'].includes(body.connection_type) ? body.connection_type : null,
    int(body.rtt_ms, 60000), int(body.jitter_ms, 60000),
    Number.isFinite(loss) && loss >= 0 ? Math.min(Math.round(loss * 100) / 100, 100) : null,
    int(body.audio_kb_in, 10000000), int(body.audio_kb_out, 10000000), int(body.video_kb_in, 10000000),
    int(body.poor_seconds, 86400) || 0, int(body.reconnects, 1000) || 0, body.audio_blocked ? 1 : 0,
    text(body.network_type, 20), text(body.device, 160),
  ]);
  return { saved: true };
}

// Ends calls that rang too long or outlived the maximum duration.
async function sweep() {
  const stale = await query(`${CALL_SELECT} WHERE (k.status = 'ringing' AND k.created_at < ?)
    OR (k.status = 'accepted' AND k.answered_at < ?) LIMIT 50`,
  [new Date(Date.now() - RING_TIMEOUT_MS), new Date(Date.now() - MAX_CALL_MS)]);
  for (const row of stale) await finish(row, row.status === 'ringing' ? 'missed' : 'ended', row.status === 'ringing' ? 'no_answer' : 'max_duration');
}

// LiveKit webhooks: when the room closes (both left, or one side dropped and the
// departure timeout passed), finalize the call so nothing stays "in progress".
async function handleWebhook(rawBody, authHeader) {
  const c = config();
  const event = await new WebhookReceiver(c.key, c.secret).receive(rawBody, authHeader);
  const roomName = event.room?.name;
  if (!roomName) return { ignored: true };
  const row = await queryOne(`${CALL_SELECT} WHERE k.room_name = ?`, [roomName]);
  if (!row || !ACTIVE.includes(row.status)) return { ignored: true };
  if (event.event === 'room_finished' && row.status === 'accepted') await finish(row, 'ended', 'room_closed');
  // A dropped participant may rejoin with a fresh token; end only if still alone later.
  if (event.event === 'participant_left' && row.status === 'accepted') {
    const timer = setTimeout(() => endIfAbandoned(row.id).catch(err => logger.warn('Call rejoin check failed:', err.message)), REJOIN_GRACE_MS);
    timer.unref?.();
  }
  return { handled: event.event };
}

async function endIfAbandoned(callId) {
  const row = await findCall(callId);
  if (!row || row.status !== 'accepted') return;
  let present = 0;
  try { present = (await roomClient()?.listParticipants(row.room_name))?.length ?? 0; } catch (_) { present = 0; }
  if (present < 2) await finish(row, 'ended', 'participant_left');
}

// What this server carries comfortably at once (8 CPU): about 100 video or 500 voice calls.
// Override with CALL_CAPACITY_VIDEO / CALL_CAPACITY_AUDIO after moving to a bigger server.
const CAPACITY = {
  video: Number(process.env.CALL_CAPACITY_VIDEO) || 100,
  audio: Number(process.env.CALL_CAPACITY_AUDIO) || 500,
};

// Highest number of calls talking at the same time since `since`.
function peakConcurrent(rows, now = Date.now()) {
  const edges = [];
  for (const row of rows) {
    const start = new Date(row.answered_at).getTime();
    const end = row.ended_at ? new Date(row.ended_at).getTime() : now;
    if (!Number.isFinite(start) || end < start) continue;
    edges.push([start, 1], [end, -1]);
  }
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0; let peak = 0;
  for (const [, step] of edges) { current += step; peak = Math.max(peak, current); }
  return peak;
}

async function liveLoad() {
  // The day starts at midnight Saudi time (UTC+3).
  const dayMs = 86400000; const offset = 3 * 3600000;
  const dayStart = new Date(Math.floor((Date.now() + offset) / dayMs) * dayMs - offset);
  const now = await queryOne(`SELECT
      SUM(CASE WHEN call_type = 'video' THEN 1 ELSE 0 END) AS video,
      SUM(CASE WHEN call_type = 'video' THEN 0 ELSE 1 END) AS audio,
      SUM(CASE WHEN status = 'ringing' THEN 1 ELSE 0 END) AS ringing
    FROM calls WHERE status IN ('ringing', 'accepted')`);
  const today = await queryOne(`SELECT COUNT(*) AS total, COALESCE(SUM(duration_seconds), 0) AS seconds
    FROM calls WHERE created_at >= ?`, [dayStart]);
  const talked = await query(`SELECT answered_at, ended_at FROM calls
    WHERE answered_at IS NOT NULL AND (ended_at IS NULL OR ended_at >= ?)`, [dayStart]);
  const video = Number(now?.video) || 0; const audio = Number(now?.audio) || 0;
  return {
    now: { total: video + audio, video, audio, ringing: Number(now?.ringing) || 0 },
    today: { total: Number(today?.total) || 0, seconds: Number(today?.seconds) || 0, peak: peakConcurrent(talked) },
    capacity: { ...CAPACITY, used_percent: Math.min(100, Math.round((video / CAPACITY.video + audio / CAPACITY.audio) * 100)) },
  };
}

async function stats({ days = 30 } = {}) {
  const since = new Date(Date.now() - Math.min(Math.max(Number(days) || 30, 1), 365) * 86400000);
  const totals = await queryOne(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'ended' AND answered_at IS NOT NULL THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END) AS missed,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status IN ('ringing', 'accepted') THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN call_type = 'video' THEN 1 ELSE 0 END) AS video,
      COALESCE(SUM(duration_seconds), 0) AS total_seconds,
      COALESCE(AVG(duration_seconds), 0) AS avg_seconds
    FROM calls WHERE created_at >= ?`, [since]);
  const errors = await query(`SELECT end_reason, COUNT(*) AS n FROM calls
    WHERE created_at >= ? AND status = 'failed' GROUP BY end_reason ORDER BY n DESC`, [since]);
  const recent = await query(`${CALL_SELECT} ORDER BY k.id DESC LIMIT 50`);
  const reports = await query(`SELECT r.id, r.call_id, r.reason, r.status, r.created_at, u.full_name AS reporter_name
    FROM call_reports r JOIN users u ON u.id = r.reporter_id ORDER BY (r.status = 'open') DESC, r.id DESC LIMIT 50`);
  // Quality log of recent calls (AYK-060), newest first.
  const quality = await query(`SELECT d.*, u.full_name AS user_name, k.call_type, k.duration_seconds
    FROM call_diagnostics d JOIN users u ON u.id = d.user_id JOIN calls k ON k.id = d.call_id
    WHERE d.created_at >= ? ORDER BY d.id DESC LIMIT 100`, [since]);
  // Devices and capabilities (AYK-062): every device seen in the period, and a summary per system.
  const devices = await query(`SELECT d.*, u.full_name AS user_name, u.referral_code
    FROM device_reports d JOIN users u ON u.id = d.user_id WHERE d.updated_at >= ? ORDER BY d.updated_at DESC LIMIT 200`, [since]);
  const os = require('os');
  const system = {
    load1: os.loadavg()[0], cpus: os.cpus().length,
    mem_total_gb: os.totalmem() / 1024 ** 3, mem_used_gb: (os.totalmem() - os.freemem()) / 1024 ** 3,
  };
  const numbers = Object.fromEntries(Object.entries(totals || {}).map(([k, v]) => [k, Number(v) || 0]));
  return {
    totals: numbers,
    errors,
    configured: isConfigured(),
    system,
    live: await liveLoad(),
    quality,
    devices,
    recent: recent.map(row => ({
      id: row.id, call_type: row.call_type, status: row.status, end_reason: row.end_reason,
      caller_name: row.caller_name, callee_name: row.callee_name, request_id: row.request_id,
      created_at: row.created_at, duration_seconds: row.duration_seconds,
    })),
    reports,
  };
}

async function reviewReport(reportId, adminId, status) {
  if (!['reviewed', 'dismissed', 'open'].includes(status)) throw fail(400, 'invalid_status');
  const updated = await query(`UPDATE call_reports SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
    WHERE id = ?`, [status, adminId, Number(reportId)]);
  if (!updated.affectedRows) throw fail(404, 'report_not_found');
  return { id: Number(reportId), status };
}

module.exports = {
  attach, isConfigured, start, accept, decline, joinToken, active, history, eligibility,
  report, sweep, handleWebhook, stats, reviewReport, RING_TIMEOUT_MS, peakConcurrent, diagnostics,
};
