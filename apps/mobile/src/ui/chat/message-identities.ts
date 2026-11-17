import { createContext } from 'react';
import type { RosterBot } from '@botharness/host-client/client';
import type { HostLook } from '@botharness/host-client/ui/design/host-look';

export const MessageIdentities = createContext<{
  bots: readonly RosterBot[];
  openBot?: (id: string) => void;
  host?: { name: string; look: HostLook };
}>({ bots: [] });
