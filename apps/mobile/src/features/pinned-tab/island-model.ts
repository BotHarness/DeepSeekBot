import type { PinnedTabSlot, PinnedTarget } from './prototype-model';

export type IslandItem = {
  slot: PinnedTabSlot;
  label: string;
  focused: boolean;
  menuLabel?: string | undefined;
  onPress(): void;
  onLongPress(): void;
};

export type IslandLayout = { width: number; height: number; pad: number };

export type IslandToolbarProps = {
  items: readonly IslandItem[];
  target: PinnedTarget;
  onLayout?: ((layout: IslandLayout) => void) | undefined;
};
