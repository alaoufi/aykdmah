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

module.exports = { DONE_DAYS_SQL, FINISHED_SQL, UNTIL_SQL, OPEN_SQL };
