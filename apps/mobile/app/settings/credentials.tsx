import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHostSession } from '../../src/host/host-session';
import type { HostClient as SettingsHostClient } from '../../src/host/host-settings';
import { useDesignTheme } from '../../src/ui/design/theme';
import { CredentialsView, credentialsPort } from '../../src/ui/credentials-screen';

export default function CredentialsScreen() {
  const router = useRouter();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { client } = useHostSession();
  const port = useMemo(
    () => (client === undefined ? undefined : credentialsPort(client as SettingsHostClient)),
    [client],
  );
  if (port === undefined) return null;
  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.overlay.fill }}>
      <CredentialsView port={port} onClose={() => router.back()} />
    </View>
  );
}
