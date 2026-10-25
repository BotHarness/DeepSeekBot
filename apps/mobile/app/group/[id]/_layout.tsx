import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useHostSession } from '../../../src/host/host-session';
import { HostScope } from '../../../src/host/host-scope';
import { SheetStack } from '../../../src/ui/primitives/sheet-stack';
import { t } from '../../../src/ui/strings';
export default function GroupLayout() {
  const { hostId } = useLocalSearchParams<{ hostId?: string }>();
  const { saved } = useHostSession(hostId);
  const [origin, setOrigin] = useState(hostId ?? saved?.hostId);
  if (origin === undefined && saved) setOrigin(saved.hostId);
  return (
    <HostScope value={hostId ?? origin}>
      <SheetStack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="chat-background" options={{ title: t.chatBackground.title }} />
        <Stack.Screen name="notifications" options={{ title: t.notifications }} />
      </SheetStack>
    </HostScope>
  );
}
