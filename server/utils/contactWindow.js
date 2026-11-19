// How long a finished request's two sides can still write (AYK-081): the market
// setting "contact_after_done_days" (7 by default) or the warranty they agreed on,
// whichever is longer, counted from when the request was completed or cancelled.
// Expects the request joined as `r`.
const DONE_DAYS_SQL = `GREATEST(COALESCE((SELECT CASE WHEN window_setting.setting_value ~ '^[0-9]{1,3}$'
    THEN window_setting.setting_value::int END FROM settings window_setting
    WHERE window_setting.setting_key = 'contact_after_done_days'), 7), COALESCE(r.warranty_days, 0))`;
const FINISHED_SQL = "r.status IN ('completed', 'closed', 'cancelled')";
const UNTIL_SQL = `(COALESCE(r.completed_at, r.cancelled_at, r.updated_at) + make_interval(days => ${DONE_DAYS_SQL}))`;
const OPEN_SQL = `(NOT ${FINISHED_SQL} OR ${UNTIL_SQL} > CURRENT_TIMESTAMP)`;

// Either member blocked the other (AYK-084), unless a request is assigned between them and
// still running or within its review and warranty days. `self` is the member's alias; the
// conversation is `c` and its request `r`.
const notBlockedSql = self => `NOT EXISTS (SELECT 1 FROM conversation_participants block_peer
    JOIN user_blocks ub ON (ub.blocker_id = block_peer.user_id AND ub.blocked_id = ${self}.user_id)
      OR (ub.blocker_id = ${self}.user_id AND ub.blocked_id = block_peer.user_id)
    WHERE block_peer.conversation_id = c.id AND block_peer.user_id <> ${self}.user_id
      -- COALESCE: with no assigned provider the test is NULL, which wrongly ignored the block (AYK-115).
      AND NOT COALESCE(r.id IS NOT NULL AND r.assigned_provider_id IN (block_peer.user_id, ${self}.user_id) AND ${OPEN_SQL}, FALSE))`;

module.exports = { DONE_DAYS_SQL, FINISHED_SQL, UNTIL_SQL, OPEN_SQL, notBlockedSql };
