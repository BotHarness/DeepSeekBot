import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { useHostSession } from '../../../src/host/host-session';
import { HostScope } from '../../../src/host/host-scope';
import { profileHostSource } from '../../../src/ui/chat/profile-host-source';
import { useStrings } from '../../../src/ui/strings';
import { SheetStack } from '../../../src/ui/primitives/sheet-stack';
import { sheetScreenOptions } from '../../../src/ui/primitives/sheet-screen';
import { useDesignTheme } from '../../../src/ui/design/theme';

export default function BotProfileLayout() {
  const t = useStrings();
  const theme = useDesignTheme();
  const { hostId } = useLocalSearchParams<{ hostId?: string }>();
  const { saved } = useHostSession(hostId);
  const [origin, setOrigin] = useState(hostId ?? saved?.hostId);
  if (origin === undefined && saved) setOrigin(saved.hostId);
  const screenLayout = useCallback<NonNullable<ComponentProps<typeof Stack>['screenLayout']>>(
    ({ children, route, navigation }) => (
      <HostScope
        value={profileHostSource(
          route.params,
          navigation.getState().routes[0]?.params,
          hostId ?? origin,
        )}
      >
        {children}
      </HostScope>
    ),
    [hostId, origin],
  );

  return (
    <HostScope value={hostId ?? origin}>
      <SheetStack fullScreen screenLayout={screenLayout}>
        <Stack.Screen name="chat-background" options={{ title: t.chatBackground.title }} />
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="memory" />
        <Stack.Screen name="memory-commit" />
        <Stack.Screen name="memory-history" />
        <Stack.Screen name="activity" />
        <Stack.Screen name="routine/[id]" />
        <Stack.Screen name="assignment/[id]" options={sheetScreenOptions(theme)} />
        <Stack.Screen name="routine-new" />
        <Stack.Screen name="routine-edit/[id]" />
        <Stack.Screen name="model" />
        <Stack.Screen name="model-picker" />
        <Stack.Screen name="workspace" />
        <Stack.Screen name="approval-history" />
        <Stack.Screen name="approval-rules" />
        <Stack.Screen name="access" />
        <Stack.Screen name="inbox" />
        <Stack.Screen name="notifications" options={{ title: t.notifications }} />
      </SheetStack>
    </HostScope>
  );
}
