// AYK-330 (the owner: «سهم الرجوع المفروض شغال حتى يرجع للرئيسية»): the admin back button goes
// UP one level, never through the browser's history. With history, a message opened from the list
// and closed again made the button bounce between the two pages for ever.
//   /admin/support/7 -> /admin/support -> /admin
// Sections that have a list page above their inner pages; any other page goes to the admin home.
const WITH_LIST = new Set(['support']);
export function adminBackTarget(pathname) {
  const parts = String(pathname || '').split('/').filter(Boolean);
  return parts[0] === 'admin' && parts.length > 2 && WITH_LIST.has(parts[1]) ? `/admin/${parts[1]}` : '/admin';
}
