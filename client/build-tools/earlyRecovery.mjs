import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

// The same tested implementation serves both the pre-React bootstrap and the
// application. The classic script also works when the entry module fails.
export async function earlyRecoverySource() {
  const shared = (await readFile(new URL('../src/utils/chunkRecovery.js', import.meta.url), 'utf8')).replace(/^export /gm, '');
  const boot = await readFile(new URL('../src/utils/earlyRecoveryBootstrap.js', import.meta.url), 'utf8');
  return (await transformWithEsbuild(shared + '\n' + boot, 'app-recovery.js', { target: 'es2018', format: 'iife', minify: true })).code;
}

export function earlyRecoveryPlugin() {
  return {
    name: 'awtad-early-asset-recovery',
    configureServer(server) {
      server.middlewares.use('/app-recovery.js', async (request, response, next) => {
        if (!['GET', 'HEAD'].includes(request.method)) return next();
        try {
          const source = await earlyRecoverySource();
          response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.end(request.method === 'HEAD' ? '' : source);
        } catch (error) { next(error); }
      });
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'app-recovery.js', source: await earlyRecoverySource() });
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        const entry = Object.values(context.bundle || {}).find(file => file.type === 'chunk' && file.isEntry);
        return [{ tag: 'meta', attrs: { name: 'awtad-build', content: entry?.fileName || 'development' }, injectTo: 'head' }];
      },
    },
  };
}
