import { useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';

import { hostSession, useHostSession } from '../src/host/host-session';
import type { SavedHost } from '../src/host/hosts';
import { space } from '../src/ui/design/tokens';
import { useDesignTheme } from '../src/ui/design/theme';
import { SettingsGroup, SettingsRow } from '../src/ui/primitives/settings-row';
import { Text } from '../src/ui/primitives/text';
import { t } from '../src/ui/strings';

export default function HostsScreen() {
  const theme = useDesignTheme();
  const router = useRouter();
  const { saved, hosts } = useHostSession();

  const show = (host: SavedHost) => {
    void hostSession.switchTo(host.hostId).then(() => router.dismissTo('/'));
  };

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.color.base }}
      contentContainerStyle={{ padding: space.x5, gap: space.x3 }}
      data={hosts}
      keyExtractor={(host) => host.hostId}
      ListHeaderComponent={
        <Text variant="meta" tone="muted" style={{ paddingBottom: space.x3 }}>
          {t.computersHint}
        </Text>
      }
      renderItem={({ item }) => {
        const current = item.hostId === saved?.hostId;
        return (
          <SettingsGroup>
            <SettingsRow
              label={item.hostName}
              strong={current}
              selected={current}
              onPress={() => show(item)}
              trailing={
                current ? (
                  <Text variant="meta" tone="accent">
                    {t.showing}
                  </Text>
                ) : null
              }
            />
          </SettingsGroup>
        );
      }}
      ListFooterComponent={
        <View style={{ paddingTop: space.x3 }}>
          <SettingsGroup>
            <SettingsRow
              label={t.pairAnother}
              onPress={() => router.push('/pair')}
              trailing={
                <Text tone="accent" strong>
                  +
                </Text>
              }
            />
          </SettingsGroup>
        </View>
      }
    />
  );
}
