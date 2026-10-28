import { useSyncExternalStore } from 'react';

let open = 0;
const watchers = new Set<() => void>();

function changed(by: number): void {
  open += by;
  for (const watcher of watchers) watcher();
}

export function holdTobMode(): () => void {
  let live = true;
  changed(1);
  return () => {
    if (!live) return;
    live = false;
    changed(-1);
  };
}

export function tobModeOpen(): boolean {
  return open > 0;
}

function watch(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}

export function useTobModeOpen(): boolean {
  return useSyncExternalStore(watch, tobModeOpen, tobModeOpen);
}
