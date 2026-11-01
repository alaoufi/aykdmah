const { query } = require('../config/database');

// A requester's name is never shown to the other side (AYK-142): a service provider sees the
// name they saved the person under in "My directory", or "Requester" with the account number.
// Providers' names stay visible. Only the requester themself (and the administration) sees it.
const isRequester = user => user && user.role === 'client';

// Names the viewer saved these people under, by id.
async function savedNames(viewerId, ids) {
  const wanted = [...new Set(ids.filter(Boolean).map(Number))];
  if (!viewerId || !wanted.length) return new Map();
  const rows = await query(`SELECT provider_id, nickname FROM saved_providers
    WHERE user_id = ? AND provider_id IN (${wanted.map(() => '?').join(',')}) AND nickname IS NOT NULL`, [viewerId, ...wanted]);
  return new Map(rows.map(row => [Number(row.provider_id), row.nickname]));
}

// The name the viewer may see for this person: theirs, a provider's, a saved one, or the label.
function shownName(person, viewerId, saved, label) {
  if (!person || !isRequester(person) || Number(person.id) === Number(viewerId)) return person?.full_name ?? null;
  return saved.get(Number(person.id)) || label;
}

// In place, on a list of people ({ id, role, full_name }).
async function hideRequesterNames(viewerId, people, label) {
  const list = people.filter(Boolean);
  const saved = await savedNames(viewerId, list.filter(isRequester).map(p => p.id));
  for (const person of list) person.full_name = shownName(person, viewerId, saved, label);
  return people;
}

module.exports = { isRequester, savedNames, shownName, hideRequesterNames };
