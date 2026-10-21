import type { ReactNode } from 'react';
import { Platform } from 'react-native';

import { computerEnvironmentKey } from '../../host/conversation-environments';
import { useConversationFilter } from '../../host/native-conversation-filter';
import { useHostSession } from '../../host/host-session';
import { useHostLook } from '../../host/native-host-look';
import { HOST_COLORS } from '../design/host-look';
import { AccentProvider, useDesignTheme } from '../design/theme';

export function HostAccentProvider({ children }: { children: ReactNode }) {
  const { saved } = useHostSession();
  const [filter] = useConversationFilter();
  const look = useHostLook(saved?.hostId);
  const { scheme } = useDesignTheme();
  const accent =
    Platform.OS === 'android' &&
    saved != null &&
    filter === computerEnvironmentKey(saved.hostId) &&
    look.color !== undefined
      ? HOST_COLORS[look.color][scheme]
      : undefined;
  return <AccentProvider accent={accent}>{children}</AccentProvider>;
}
