import type { ReactNode } from 'react';
import { Platform } from 'react-native';

import { useHostSession } from '../../host/host-session';
import { useHostLook } from '../../host/native-host-look';
import { HOST_COLORS } from '../design/host-look';
import { AccentProvider, useDesignTheme } from '../design/theme';

export function HostAccentProvider({ children }: { children: ReactNode }) {
  const { saved } = useHostSession();
  const look = useHostLook(saved?.hostId);
  const { scheme } = useDesignTheme();
  const accent =
    Platform.OS === 'android' && look.color !== undefined
      ? HOST_COLORS[look.color][scheme]
      : undefined;
  return <AccentProvider accent={accent}>{children}</AccentProvider>;
}
