import type { ReactNode } from 'react';

import type { SettingsScroll } from '../primitives/settings-scroll';

export function SettingsTabPage({ children }: { onScroll: SettingsScroll; children: ReactNode }) {
  return children;
}
