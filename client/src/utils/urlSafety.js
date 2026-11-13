/** Allow web URLs and local paths without accepting executable/browser-ambiguous URLs. */
export function safeUrl(value) {
  if (typeof value !== 'string' || !value || /[\u0000-\u0020\u007f-\u009f\\]/.test(value)) return '';
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (!/^https?:\/\//i.test(value)) return '';
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
    return parsed.href;
  } catch {
    return '';
  }
}
