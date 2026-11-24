import { createContext, useContext } from 'react';
import type { PinnedTarget } from './prototype-model';

export type FixtureTabOrder = {
  swapped: boolean;
  toggle(): void;
  target?: PinnedTarget;
  picked?: string | undefined;
  scrolled?: ((offset: number) => void) | undefined;
};

export const FixtureTabOrderContext = createContext<FixtureTabOrder>({
  swapped: false,
  toggle: () => undefined,
});

export function useFixtureTabOrder(): FixtureTabOrder {
  return useContext(FixtureTabOrderContext);
}
