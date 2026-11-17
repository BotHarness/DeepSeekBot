import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHostSession } from '../../src/host/host-session';
import {
  describeSettings,
  saveSettingsValue,
  type HostClient as SettingsHostClient,
} from '../../src/host/host-settings';
import { useDesignTheme } from '../../src/ui/design/theme';
import { HostSettingsView, type HostSettingsPort } from '../../src/ui/host-settings-screen';

export default function HostSettingsScreen() {
  const router = useRouter();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { client } = useHostSession();
  const port = useMemo<HostSettingsPort | undefined>(
    () =>
      client === undefined
        ? undefined
        : {
            describe: () => describeSettings(client as SettingsHostClient),
            save: (ns, patch, revision) =>
              saveSettingsValue(client as SettingsHostClient, ns, patch, revision),
          },
    [client],
  );
  if (port === undefined) return null;
  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.overlay.fill }}>
      <HostSettingsView port={port} onClose={() => router.back()} />
    </View>
  );
}
