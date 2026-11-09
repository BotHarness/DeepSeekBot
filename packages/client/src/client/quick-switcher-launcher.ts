export type QuickSwitcherSource = 'shortcut' | 'rail';

export interface QuickSwitcherLauncher {
  open(source: QuickSwitcherSource): void;
  subscribe(listener: (source: QuickSwitcherSource) => void): () => void;
}

export function createQuickSwitcherLauncher(): QuickSwitcherLauncher {
  const listeners = new Set<(source: QuickSwitcherSource) => void>();
  return {
    open: (source) => {
      for (const listener of listeners) listener(source);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
