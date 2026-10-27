(function () {
  try {
    var stored = localStorage.getItem('ryza_theme');
    document.documentElement.setAttribute('data-theme', stored === 'dark' ? 'dark' : 'default');
  } catch (_) {}
})();
