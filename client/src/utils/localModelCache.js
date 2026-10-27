import { LOCAL_MODEL_CACHE, modelFileDescriptor, pinnedModelDownloadUrl } from './localLanguage.js';

const CHUNK_BYTES = 4 * 1024 * 1024;
const CHUNK_HEADER = 'X-Awtad-Model-Chunks';
const chunkKey = (url, index) => `${url}?awtad_model_chunk=${index}`;

// Some browsers fail Cache.put() for a single 300 MB Response even when there
// is sufficient quota. Keep public weights in small entries and publish their
// manifest only after every chunk is saved. No conversation data enters here.
export function createLocalModelCache(storage, chunkBytes = CHUNK_BYTES) {
  const open = () => storage.open(LOCAL_MODEL_CACHE);
  return {
    async match(request) {
      const url = pinnedModelDownloadUrl(typeof request === 'string' ? request : request.url);
      if (!url) return undefined;
      try {
        const cache = await open();
        const response = await cache.match(url);
        if (!response || !response.headers.get(CHUNK_HEADER)) return response;
        const manifest = await response.json();
        const descriptor = modelFileDescriptor(url);
        if (!descriptor || manifest.size !== descriptor.size || !Number.isSafeInteger(manifest.chunks)
            || manifest.chunks < 1 || manifest.chunks > 200 || !Number.isSafeInteger(manifest.chunkBytes)
            || manifest.chunkBytes < 1 || Math.ceil(manifest.size / manifest.chunkBytes) !== manifest.chunks) return undefined;
        // Checking each entry avoids advertising incomplete or evicted weights
        // as a cached model. Bodies are read only when inference needs them.
        for (let index = 0; index < manifest.chunks; index++) {
          const chunk = await cache.match(chunkKey(url, index));
          const expected = Math.min(manifest.chunkBytes, manifest.size - index * manifest.chunkBytes);
          if (!chunk || Number(chunk.headers.get('X-Awtad-Model-Bytes')) !== expected) return undefined;
        }
        let index = 0;
        const stream = new ReadableStream({
          async pull(controller) {
            if (index >= manifest.chunks) { controller.close(); return; }
            const expected = Math.min(manifest.chunkBytes, manifest.size - index * manifest.chunkBytes);
            const chunk = await cache.match(chunkKey(url, index++));
            if (!chunk) { controller.error(new Error('Incomplete public model cache')); return; }
            const bytes = new Uint8Array(await chunk.arrayBuffer());
            if (bytes.byteLength !== expected) { controller.error(new Error('Incomplete public model chunk')); return; }
            controller.enqueue(bytes);
          },
        });
        return new Response(stream, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(manifest.size) } });
      } catch { return undefined; }
    },

    async put(request, response) {
      const url = pinnedModelDownloadUrl(typeof request === 'string' ? request : request.url);
      const descriptor = url && modelFileDescriptor(url);
      if (!descriptor || response.status !== 200) return;
      let cache;
      let reader;
      const written = [];
      try {
        cache = await open();
        if (descriptor.size <= chunkBytes) { await cache.put(url, response); return; }
        const existing = await cache.keys();
        for (const key of existing) if (key.url.startsWith(`${url}?awtad_model_chunk=`)) await cache.delete(key);
        await cache.delete(url);
        reader = response.body.getReader();
        let size = 0;
        let index = 0;
        let buffer = new Uint8Array(Math.min(chunkBytes, descriptor.size));
        let offset = 0;
        const saveChunk = async () => {
          const key = chunkKey(url, index++);
          await cache.put(key, new Response(buffer.subarray(0, offset), { headers: { 'Content-Type': 'application/octet-stream', 'X-Awtad-Model-Bytes': String(offset) } }));
          written.push(key);
          buffer = new Uint8Array(Math.min(chunkBytes, descriptor.size - size));
          offset = 0;
        };
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          let cursor = 0;
          while (cursor < next.value.length) {
            if (size >= descriptor.size) throw new Error('Unexpected public model size');
            const count = Math.min(buffer.length - offset, next.value.length - cursor);
            buffer.set(next.value.subarray(cursor, cursor + count), offset);
            cursor += count; offset += count; size += count;
            if (offset === buffer.length) await saveChunk();
          }
        }
        if (size !== descriptor.size) throw new Error('Incomplete public model download');
        if (offset) await saveChunk();
        await cache.put(url, new Response(JSON.stringify({ size, chunks: index, chunkBytes }), {
          headers: { 'Content-Type': 'application/json', [CHUNK_HEADER]: '1' },
        }));
      } catch {
        // A cloned Response may be a tee branch. Cancel without waiting for
        // the inference branch, so a failed cache write cannot keep buffering
        // hundreds of megabytes that will never be saved.
        const cancelled = reader ? reader.cancel() : response.body?.cancel();
        void cancelled?.catch(() => {});
        if (cache) {
          await cache.delete(url).catch(() => {});
          for (const key of written) await cache.delete(key).catch(() => {});
        }
        // Quota/private-mode failures don't fabricate a cache hit. The current
        // in-memory inference may still work; a later visit may need a download.
      }
    },
  };
}
