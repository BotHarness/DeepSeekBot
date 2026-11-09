export type QuickSwitcherSource = 'shortcut' | 'rail';

export interface QuickSwitcherLauncher {
  open(source: QuickSwitcherSource): void;
  subscribe(listener: (source: QuickSwitcherSource) => boolean): () => void;
}

export function createQuickSwitcherLauncher(): QuickSwitcherLauncher {
  const listeners = new Set<(source: QuickSwitcherSource) => boolean>();
  return {
    open: (source) => {
      for (const listener of [...listeners].reverse()) if (listener(source)) return;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
