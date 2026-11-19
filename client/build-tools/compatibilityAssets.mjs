import { readdir, mkdir, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const hashedAsset = /-[A-Za-z0-9_-]{8,}\.(?:js|mjs|css|wasm)$/;
const clientRoot = fileURLToPath(new URL('../', import.meta.url));
const archiveDirectory = path.join(clientRoot, 'compat-assets');

export async function copyHashedAssets(source, destination) {
  let files;
  try { files = await readdir(source, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
  await mkdir(destination, { recursive: true });
  let copied = 0;
  for (const file of files) {
    if (!file.isFile() || !hashedAsset.test(file.name)) continue;
    const target = path.join(destination, file.name);
    try { await access(target); continue; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await copyFile(path.join(source, file.name), target);
    copied += 1;
  }
  return copied;
}

export function compatibilityAssetsPlugin() {
  let outputDirectory;
  return {
    name: 'aykdmh-compatibility-assets',
    configResolved(config) { outputDirectory = path.resolve(config.root, config.build.outDir, 'assets'); },
    // Run after Workbox creates the current release's precache. Old chunks
    // remain available to existing tabs without caching entire old releases.
    closeBundle: {
      order: 'post',
      async handler() { await copyHashedAssets(archiveDirectory, outputDirectory); },
    },
  };
}

export async function archivePreviousBuild() {
  return copyHashedAssets(path.join(clientRoot, 'dist', 'assets'), archiveDirectory);
}
