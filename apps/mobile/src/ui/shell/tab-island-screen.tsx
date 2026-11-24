import type { ReactNode } from 'react';

import { ChatIslandInset } from '../primitives/chat-keyboard';
import { useTabChrome } from './tab-chrome';

export function TabIslandScreen({ children }: { children: ReactNode }) {
  const chrome = useTabChrome();
  return <ChatIslandInset value={chrome?.islandTop ?? 0}>{children}</ChatIslandInset>;
}
