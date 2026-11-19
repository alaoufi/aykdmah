// Chat message translations (AYK-231). A message is translated into each reader's language as
// soon as it is sent and pushed to them live (chat:translation); every translation is saved, so
// the message list carries it and opening a chat shows the reader's language at once, with no
// request per message. Translations that arrive together for the same message and language share
// one provider call. A failed translation is not saved: it is tried again later.
const { query } = require('../config/database');
const logger = require('../utils/logger');
const translationService = require('./translationService');
const { emitUser } = require('../utils/conversationEvents');

const { SUPPORTED, worthTranslating, detectLanguageFallback } = translationService;
const UNIQUE_SCRIPT = new Set(['ar', 'ur', 'bn', 'ml', 'am']);
const pending = new Map();

const translatable = message => Boolean(message?.content) && !['location', 'system'].includes(message.message_type)
  && worthTranslating(message.content);

async function saved(messageId, lang) {
  const rows = await query('SELECT translated_text, source_lang, same_language FROM message_translations WHERE message_id = ? AND lang = ?', [messageId, lang]);
  const row = rows[0];
  return row ? { text: row.translated_text, from: row.source_lang || null, same: Number(row.same_language) === 1 } : null;
}

// { text, from, same } or { text, failed: true } for one message in one language.
function translationFor(message, lang) {
  const key = `${message.id}:${lang}`;
  if (pending.has(key)) return pending.get(key);
  const work = (async () => {
    const kept = await saved(message.id, lang).catch(() => null);
    if (kept) return kept;
    const content = String(message.content);
    // A script only the reader's language uses: already in their language.
    const script = await detectLanguageFallback(content);
    if (script === lang && UNIQUE_SCRIPT.has(lang)) return remember(message.id, lang, { text: content, from: lang, same: true });
    let result;
    try { result = await translationService.translate(content, null, lang); } catch (_) { return { text: content, failed: true }; }
    const same = result.provider === 'noop' || result.text === content;
    return remember(message.id, lang, { text: same ? content : result.text, from: result.from || null, same });
  })().finally(() => setTimeout(() => pending.delete(key), 1000).unref?.());
  pending.set(key, work);
  if (pending.size > 5000) pending.delete(pending.keys().next().value);
  return work;
}

async function remember(messageId, lang, translation) {
  await query(`INSERT INTO message_translations (message_id, lang, source_lang, translated_text, same_language)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT (message_id, lang) DO NOTHING`,
  [messageId, lang, translation.from, translation.text, translation.same ? 1 : 0]).catch(err => logger.warn('Message translation not saved:', err.message));
  return translation;
}

// The saved translations of a page of messages in one language: message.translation.
async function attachTranslations(messages, lang) {
  if (!SUPPORTED.includes(lang)) return messages;
  const ids = messages.filter(translatable).map(m => m.id);
  if (!ids.length) return messages;
  const rows = await query(`SELECT message_id, translated_text, source_lang, same_language FROM message_translations
    WHERE lang = ? AND message_id IN (${ids.map(() => '?').join(',')})`, [lang, ...ids]).catch(() => []);
  const byId = new Map(rows.map(row => [Number(row.message_id), row]));
  for (const message of messages) {
    const row = byId.get(Number(message.id));
    if (row) message.translation = { lang, text: row.translated_text, from: row.source_lang || null, same: Number(row.same_language) === 1 };
  }
  return messages;
}

// Each other participant's languages: the one they last used the site in, their open app
// sessions and their phones.
async function readerLanguages(io, message) {
  const rows = await query(`SELECT u.id, u.ui_lang FROM conversation_participants cp JOIN users u ON u.id = cp.user_id
    WHERE cp.conversation_id = ? AND cp.user_id <> ?`, [message.conversation_id, message.sender_id]);
  const push = await query(`SELECT DISTINCT ps.user_id, ps.lang FROM push_subscriptions ps
    JOIN conversation_participants cp ON cp.user_id = ps.user_id WHERE cp.conversation_id = ? AND cp.user_id <> ?`,
  [message.conversation_id, message.sender_id]).catch(() => []);
  const readers = new Map(rows.map(row => [Number(row.id), new Set(row.ui_lang ? [row.ui_lang] : [])]));
  for (const row of push) readers.get(Number(row.user_id))?.add(row.lang);
  if (io) {
    for (const [id, langs] of readers) {
      try { for (const socket of await io.in(`user:${id}`).fetchSockets()) if (socket.data?.lang) langs.add(socket.data.lang); } catch (_) { /* no live sessions */ }
    }
  }
  for (const langs of readers.values()) for (const lang of [...langs]) if (!SUPPORTED.includes(lang)) langs.delete(lang);
  return readers;
}

// Translates a new message for its readers and sends each translation to that reader live.
async function translateForReaders(io, message) {
  if (!translatable(message)) return;
  const readers = await readerLanguages(io, message);
  const jobs = [];
  for (const [userId, langs] of readers) {
    for (const lang of langs) {
      jobs.push(translationFor(message, lang).then(translation => {
        if (translation.failed || !io) return;
        // Through emitUser: only that reader's sessions that are still signed in get it.
        return emitUser(io, userId, 'chat:translation', {
          conversationId: Number(message.conversation_id), messageId: Number(message.id), lang,
          text: translation.text, from: translation.from, same: translation.same,
        });
      }));
    }
  }
  await Promise.allSettled(jobs);
}

module.exports = { translationFor, attachTranslations, translateForReaders, translatable };
