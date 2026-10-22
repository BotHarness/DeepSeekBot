import type { ComponentType } from 'react';

/** Platforms not migrated by T1 retain their existing Computer surface. */
export function LocalComputerScreen({ Legacy }: { Legacy: ComponentType }) {
  return <Legacy />;
}
