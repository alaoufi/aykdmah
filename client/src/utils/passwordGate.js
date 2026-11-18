// A generated first password must be replaced before anything else. The admin area and the site keep
// separate sessions (AYK-114/151), so each area asks for it on its own page: an admin session sent to
// the site's /profile would arrive signed out with no way back (AYK-272).
export const ADMIN_PASSWORD_PATH = '/admin/password';
export const SITE_PASSWORD_PATH = '/profile';

const isAdminPath = (pathname) => /^\/admin(\/|$)/.test(String(pathname || ''));

// Where this session must go to replace its password, or null when it may stay where it is.
export function passwordChangeRedirect(user, pathname) {
  if (!user || Number(user.must_change_password) !== 1) return null;
  const target = isAdminPath(pathname) ? ADMIN_PASSWORD_PATH : SITE_PASSWORD_PATH;
  return pathname === target ? null : target;
}
