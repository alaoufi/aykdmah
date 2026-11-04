'use strict';
// The pinned CLI emits a typed turn.failed event with a message but no code.
function quotaEvent(event) {
  return event?.type === 'turn.failed' && typeof event.error?.message === 'string' &&
    /^(?:You've hit your usage limit(?:\.| for [^\r\n]{1,80}\.)|Your workspace is out of credits\.)/.test(event.error.message);
}
module.exports = { quotaEvent };
