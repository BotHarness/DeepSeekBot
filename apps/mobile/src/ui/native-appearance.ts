import { useSyncExternalStore } from 'react';

import { appearanceStore, type AppearanceSnapshot } from './appearance-store';

export function useAppearance(): AppearanceSnapshot {
  return useSyncExternalStore(
    appearanceStore.subscribe,
    appearanceStore.getSnapshot,
    appearanceStore.getSnapshot,
  );
}

export {
  appearanceFile,
  parseAppearanceDocument,
  type AppearanceDocument,
} from './appearance-document';
export {
  appearanceStore,
  documentScheme,
  type AppearanceSnapshot,
  type AppearanceStorage,
} from './appearance-store';
