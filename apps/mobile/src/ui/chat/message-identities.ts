import { createContext } from 'react';
import type { RosterBot } from '../../host/client';

export const MessageIdentities = createContext<{
  bots: readonly RosterBot[];
  openBot?: (id: string) => void;
}>({ bots: [] });
