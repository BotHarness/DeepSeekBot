import type { Context as ClientContext } from '@deepseek-ai/cordis';

import type { ClientStore } from './store.js';

export function registerModeShadow(
  ctx: ClientContext,
  name: 'sidebar.workspaces' | 'main',
  register: () => () => void,
  clientStore: ClientStore,
  presentation?: {
    enabled(): boolean;
    subscribe(listener: () => void): () => void;
  },
): void {
  ctx.slots.inject(name, () => {
    let dispose: (() => void) | undefined;
    const reconcile = (): void => {
      if (clientStore.getSnapshot().mode === 'bot' && (presentation?.enabled() ?? true)) {
        if (dispose === undefined) dispose = register();
      } else if (dispose !== undefined) {
        dispose();
        dispose = undefined;
      }
    };
    const unsubscribe = clientStore.subscribe(reconcile);
    const unsubscribePresentation = presentation?.subscribe(reconcile);
    reconcile();
    return () => {
      unsubscribe();
      unsubscribePresentation?.();
      dispose?.();
      dispose = undefined;
    };
  });
}
