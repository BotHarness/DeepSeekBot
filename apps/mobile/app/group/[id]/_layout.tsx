import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { useHostSession } from '../../../src/host/host-session';
import { HostScope } from '../../../src/host/host-scope';
import { profileHostSource } from '../../../src/ui/chat/profile-host-source';
import { SheetStack } from '../../../src/ui/primitives/sheet-stack';
import { sheetScreenOptions } from '../../../src/ui/primitives/sheet-screen';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { useStrings } from '../../../src/ui/strings';
export default function GroupLayout() {
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
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="chat-background" options={{ title: t.chatBackground.title }} />
        <Stack.Screen name="notifications" options={{ title: t.notifications }} />
        <Stack.Screen name="assignment/[session]" options={sheetScreenOptions(theme)} />
      </SheetStack>
    </HostScope>
  );
}
