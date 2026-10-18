import type { ReactElement } from 'react';

export const nativeStreamReveal = false;

export function StreamReveal({ children }: { children: ReactElement; active: boolean }) {
  return children;
}
