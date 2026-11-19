// The text-size preference zooms the whole page (AYK-028). Screen measurements
// (getBoundingClientRect, innerWidth, visualViewport) are in screen pixels,
// while fixed positions are laid out in zoomed CSS pixels: divide by this.
export function pageZoom() {
  if (typeof document === 'undefined') return 1;
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ayk-scale'));
  return Number.isFinite(value) && value > 0 ? value : 1;
}
