import { useRouter } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';

import { hostSession, useHostSession } from '../src/host/host-session';
import type { SavedHost } from '../src/host/hosts';
import { radius, space } from '../src/ui/design/tokens';
import { useDesignTheme } from '../src/ui/design/theme';
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
        <Text
          style={{
            color: theme.color.muted,
            fontSize: theme.type.meta.size,
            lineHeight: theme.type.meta.line,
            paddingBottom: space.x3,
          }}
        >
          {t.computersHint}
        </Text>
      }
      renderItem={({ item }) => {
        const current = item.hostId === saved?.hostId;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.hostName}
            accessibilityState={{ selected: current }}
            onPress={() => show(item)}
            style={({ pressed }) => ({
              minHeight: theme.touch,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: space.x5,
              borderRadius: radius.md,
              backgroundColor: pressed ? theme.color.hover : theme.color.surface,
            })}
          >
            <Text
              numberOfLines={1}
              style={{
                color: theme.color.fg,
                fontSize: theme.type.body.size,
                lineHeight: theme.type.body.line,
                fontWeight: current ? theme.weight.strong : theme.weight.regular,
                flexShrink: 1,
              }}
            >
              {item.hostName}
            </Text>
            {current ? (
              <Text
                style={{
                  color: theme.color.accent,
                  fontSize: theme.type.meta.size,
                  lineHeight: theme.type.meta.line,
                }}
              >
                {t.showing}
              </Text>
            ) : null}
          </Pressable>
        );
      }}
      ListFooterComponent={
        <View style={{ paddingTop: space.x3 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/pair')}
            style={{
              minHeight: theme.touch,
              justifyContent: 'center',
              paddingHorizontal: space.x5,
            }}
          >
            <Text
              style={{
                color: theme.color.accent,
                fontSize: theme.type.body.size,
                lineHeight: theme.type.body.line,
                fontWeight: theme.weight.strong,
              }}
            >
              {t.pairAnother}
            </Text>
          </Pressable>
        </View>
      }
    />
  );
}
