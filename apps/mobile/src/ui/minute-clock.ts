import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let now = new Date();
let timer: ReturnType<typeof setTimeout> | undefined;

function tick(): void {
  now = new Date();
  for (const listener of listeners) listener();
  schedule();
}

function schedule(): void {
  timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    now = new Date();
    schedule();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) clearTimeout(timer);
  };
}

export function useMinuteClock(): Date {
  return useSyncExternalStore(subscribe, () => now);
}
