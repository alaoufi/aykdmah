const AUTH_PATHS = new Set(['/login', '/register', '/admin/login']);

// A return destination always stays inside this application. Validate only
// the pathname so legitimate query values and hash fragments are preserved.
export function internalAuthReturn(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, 'https://ryza.invalid');
    if (url.origin !== 'https://ryza.invalid') return null;
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(pathname)) return null;
    if (AUTH_PATHS.has(pathname.replace(/\/+$/, '').toLowerCase())) return null;
    return url.pathname + url.search + url.hash;
  } catch (_) { return null; }
}

export function authReturnTarget(role, from) {
  const target = internalAuthReturn(from);
  if (target && target !== '/') return target;
  return role === 'admin' ? '/admin' : role === 'provider' ? '/provider' : '/client';
}

export function isRequestAuthReturn(from) {
  const target = internalAuthReturn(from);
  return target ? new URL(target, 'https://ryza.invalid').pathname === '/requests/new' : false;
}
