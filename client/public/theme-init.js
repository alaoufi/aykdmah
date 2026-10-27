(function () {
  // Runs before React: base theme, contrast and text size from saved preferences.
  try {
    var root = document.documentElement;
    var prefs = JSON.parse(localStorage.getItem('ayk_theme_prefs') || 'null');
    var legacy = localStorage.getItem('ayk_theme');
    var mode = prefs && prefs.mode ? prefs.mode : (legacy === 'dark' ? 'dark' : 'light');
    var dark = mode === 'dark' || (mode === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'default');
    var scales = { s: 0.92, m: 1, l: 1.1, xl: 1.22 };
    var scale = prefs && scales[prefs.scale];
    if (scale && scale !== 1) { root.style.zoom = String(scale); root.style.setProperty('--ayk-scale', String(scale)); }
    if (prefs && prefs.contrast === true) root.setAttribute('data-contrast', 'high');
  } catch (_) {}
})();
