import { createContext } from 'react';

type MeasuredView = {
  measureInWindow(read: (x: number, y: number, width: number, height: number) => void): void;
};

export function createMemoryVisibility(frame: () => MeasuredView | null) {
  const listeners = new Set<() => void>();
  return {
    notify() {
      for (const read of listeners) read();
    },
    observe(node: MeasuredView, visible: () => void) {
      let active = true;
      const read = () =>
        frame()?.measureInWindow((_x, top, _width, height) => {
          if (!active || height <= 0) return;
          node.measureInWindow((_nx, y, _nw, h) => {
            if (active && h > 0 && y < top + height && y + h > top) {
              active = false;
              listeners.delete(read);
              visible();
            }
          });
        });
      listeners.add(read);
      read();
      return () => {
        active = false;
        listeners.delete(read);
      };
    },
  };
}
export const MemoryVisibility = createContext<
  ReturnType<typeof createMemoryVisibility> | undefined
>(undefined);
