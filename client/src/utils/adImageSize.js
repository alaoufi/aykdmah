// AYK-408 (the owner: «كل مكان له أبعاد للصورة، وإذا كانت كبيرة أو صغيرة تشوّه المكان. اختبر الصورة،
// وإذا لم تناسب عدّلها للحجم المناسب واعرضها على العميل: إن ناسبته وافق، وإلا يعدّل الصورة على
// المقاسات»). Each place shows its ad in a fixed frame; the picture is checked against it, and
// otherwise cut and resized to it (no stretching), for the person to accept or redo.
export const AD_SIZES = {
  wide: { key: 'wide', width: 1200, height: 400 },
  narrow: { key: 'narrow', width: 800, height: 600 },
};
const NARROW = new Set(['sidebar', 'chat_sidebar']);
export const sizeForPlacement = placement => (NARROW.has(placement) ? AD_SIZES.narrow : AD_SIZES.wide);
// One picture serves every place the ad is in: a wide place decides when there is one.
export const sizeForPlacements = (placements = []) => {
  const list = (Array.isArray(placements) ? placements : [placements]).filter(Boolean);
  return list.length && list.every(p => NARROW.has(p)) ? AD_SIZES.narrow : AD_SIZES.wide;
};

// AYK-421 (the owner: «الأهم اختبار حجم ومناسبة الصورة أو المقطع لمكان الإعلان، ما يكون حجمه يشوّه
// الموقع»): every frame the ad will show in (a wide and a side place together are two frames), so the
// advertiser sees each before uploading.
export const sizesForPlacements = (placements = []) => {
  const list = (Array.isArray(placements) ? placements : [placements]).filter(Boolean);
  if (!list.length) return [AD_SIZES.wide];
  const out = [];
  if (list.some(p => !NARROW.has(p))) out.push(AD_SIZES.wide);
  if (list.some(p => NARROW.has(p))) out.push(AD_SIZES.narrow);
  return out;
};
// A clip in an ad: short, so it does not weigh on the page.
export const MAX_AD_VIDEO_SECONDS = 30;
export function readVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata'; video.muted = true;
    video.onloadedmetadata = () => resolve({ url, width: video.videoWidth, height: video.videoHeight, duration: video.duration });
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('video')); };
    video.src = url;
  });
}

export function readImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

// Fits when its shape is within 6% of the frame and it is at least 3/4 of the frame's width.
export function fitsSize({ width, height }, size) {
  if (!width || !height) return false;
  const ratio = (width / height) / (size.width / size.height);
  return ratio > 0.94 && ratio < 1.06 && width >= size.width * 0.75;
}
export const tooSmall = ({ width }, size) => width < size.width * 0.75;
// Which way the picture overflows the frame, so the person picks the part that shows.
export const overflowAxis = ({ width, height }, size) => (width / height > size.width / size.height ? 'x' : 'y');

// Cut (cover) and resize to the frame; position: 'start' | 'center' | 'end' along the overflow.
export function fitImage(img, size, position = 'center', name = 'ad.jpg') {
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  const scale = Math.max(size.width / img.naturalWidth, size.height / img.naturalHeight);
  const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
  const free = { x: size.width - w, y: size.height - h };
  const at = value => (position === 'start' ? 0 : position === 'end' ? value : value / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, at(free.x), at(free.y), w, h);
  return new Promise(resolve => canvas.toBlob(blob => {
    resolve(new File([blob], name.replace(/\.[a-z0-9]+$/i, '') + '-fit.jpg', { type: 'image/jpeg' }));
  }, 'image/jpeg', 0.9));
}
