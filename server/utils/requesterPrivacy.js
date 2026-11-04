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

// Copy a socket message for one recipient; never mutate the shared broadcast object.
async function messageForViewer(message, viewerId, label) {
  const copy = {...message};
  const people = [];
  for (const [idKey, roleKey, nameKey, avatarKey] of [['sender_id','sender_role','sender_name','sender_avatar'],['reply_sender_id','reply_sender_role','reply_sender_name','reply_sender_avatar']]) {
    if (copy[idKey] != null) people.push({id:copy[idKey],role:copy[roleKey] || 'client',full_name:copy[nameKey],nameKey,avatarKey});
    else {delete copy[nameKey];delete copy[avatarKey];}
    delete copy[roleKey];
  }
  await hideRequesterNames(viewerId,people,label);
  for (const person of people) {
    copy[person.nameKey] = person.full_name;
    if (person.role === 'client' && Number(person.id) !== Number(viewerId)) copy[person.avatarKey] = null;
  }
  return copy;
}

// Public reviews deliberately omit request links, internal reports and user IDs.
// The review ID remains available for voting, reporting, replying and translation.
async function reviewsForViewer(rows, viewerId, label) {
  const copies = rows.map(row => ({...row}));
  const people = [];
  for (const row of copies) {
    people.push({id:row.reviewer_id,role:row.reviewer_role || (row.review_type === 'on_requester' ? 'provider' : 'client'),full_name:row.reviewer_name,row,key:'reviewer'});
    people.push({id:row.target_user_id,role:row.target_role || (row.review_type === 'on_requester' ? 'client' : 'provider'),full_name:row.target_name,row,key:'target'});
  }
  await hideRequesterNames(viewerId,people,label);
  for (const person of people) {
    person.row[person.key + '_name'] = person.full_name;
    if (person.role === 'client' && Number(person.id) !== Number(viewerId)) person.row[person.key + '_avatar'] = null;
  }
  const fields = ['id','review_type','rating','criteria_ratings','comment','images','original_language','helpful_count','provider_reply','provider_reply_at','created_at','user_voted','reviewer_name','reviewer_avatar','target_name','target_avatar'];
  return copies.map(row => Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key,row[key]])));
}

module.exports = { messageForViewer, reviewsForViewer, isRequester, savedNames, shownName, hideRequesterNames };
