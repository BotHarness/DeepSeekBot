import { Directory, File, Paths } from 'expo-file-system';

import type { CatalogStore, StoredCatalog } from './model-catalog-cache';

const VERSION = 1;

const root = (): Directory => new Directory(Paths.cache, 'deepseekbot-model-catalog');

const fileFor = (hostId: string): File => new File(root(), `${encodeURIComponent(hostId)}.json`);

export const nativeModelCatalogStore: CatalogStore = {
  read(hostId) {
    const file = fileFor(hostId);
    if (!file.exists) return undefined;
    const value = JSON.parse(file.textSync()) as Partial<StoredCatalog> & { version?: unknown };
    if (value.version !== VERSION || typeof value.savedAt !== 'number') return undefined;
    return { savedAt: value.savedAt, answer: value.answer };
  },
  write(hostId, value) {
    const directory = root();
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
    fileFor(hostId).writeSync(JSON.stringify({ version: VERSION, ...value }));
  },
};
