export function isEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(str || '').trim());
}

export function isPhone(str) {
  return /^[+0-9\s\-()]{7,20}$/.test(String(str || '').trim());
}

export function isStrongPassword(str) {
  return String(str || '').length >= 6;
}

export function required(value) {
  return value != null && String(value).trim() !== '';
}
