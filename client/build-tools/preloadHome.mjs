// AYK-316: the home page is a separate file loaded only after the main bundle has run, so on a
// first open the phone fetched its ~15 small files in a second wave (about 1 s on a weak network).
// This adds <link rel="modulepreload"> for the home page and everything it imports to index.html,
// so the browser fetches them together with the main bundle.
const HOME = /\/src\/pages\/HomePage\.jsx$/;

export function preloadHomePlugin() {
  return {
    name: 'ayk-preload-home',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle || {};
        const chunks = Object.values(bundle).filter(item => item.type === 'chunk');
        const home = chunks.find(chunk => chunk.facadeModuleId && HOME.test(chunk.facadeModuleId.replace(/\\/g, '/')));
        if (!home) return html;
        const entry = chunks.find(chunk => chunk.isEntry);
        const already = new Set([entry?.fileName, ...(entry?.imports || [])]);
        const files = new Set();
        const walk = name => {
          if (!name || files.has(name) || already.has(name)) return;
          files.add(name);
          for (const next of bundle[name]?.imports || []) walk(next);
        };
        walk(home.fileName);
        return [...files].map(file => ({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: `/${file}` }, injectTo: 'head' }));
      },
    },
  };
}
