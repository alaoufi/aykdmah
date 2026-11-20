// AYK-345 (the owner's screenshot): in a drop-down list on the phone, a new profession showed its
// emoji on the wrong side. Each line of the phone's own list picks its direction from its first
// letter; a newer emoji the phone does not know yet (🛞) counts as a left-to-right letter, so that
// line was laid out left to right. A direction mark in front fixes the line's direction to the
// page's language, whatever the emoji.
const RTL = new Set(['ar', 'ur']);
export function optionLabel(icon, name, lang) {
  const mark = RTL.has(String(lang || 'ar').toLowerCase().split(/[-_]/)[0]) ? '‏' : '‎';
  return `${mark}${icon ? `${icon} ` : ''}${name || ''}`;
}
