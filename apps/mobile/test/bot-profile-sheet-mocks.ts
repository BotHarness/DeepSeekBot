import { vi, type Mock } from 'vitest';

export const navigation = (() => {
  const listeners = new Set<(event: { data: { closing: boolean } }) => void>();
  return {
    listeners,
    addListener(_event: string, listener: (event: { data: { closing: boolean } }) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
})();

export const alert: Mock = vi.fn();
