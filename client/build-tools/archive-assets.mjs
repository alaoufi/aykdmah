import { archivePreviousBuild } from './compatibilityAssets.mjs';

const count = await archivePreviousBuild();
if (count) console.log(`Preserved ${count} immutable files from the previous release.`);
