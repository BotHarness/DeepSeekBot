import { BackHandler } from 'react-native';

let held = 0;
const watchers = new Set<() => void>();

function changed(by: number) {
  held += by;
  for (const watcher of watchers) watcher();
}

export function holdBack(handler: () => boolean): { remove(): void } {
  const subscription = BackHandler.addEventListener('hardwareBackPress', handler);
  let live = true;
  changed(1);
  return {
    remove() {
      if (!live) return;
      live = false;
      subscription.remove();
      changed(-1);
    },
  };
}

export function backHeld(): boolean {
  return held > 0;
}

export function watchBackHeld(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}
