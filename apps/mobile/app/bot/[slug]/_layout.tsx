import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useHostSession } from '../../../src/host/host-session';
import { HostScope } from '../../../src/host/host-scope';
import { useStrings } from '../../../src/ui/strings';
import { SheetStack } from '../../../src/ui/primitives/sheet-stack';

export default function BotProfileLayout() {
  const t = useStrings();
  const { hostId } = useLocalSearchParams<{ hostId?: string }>();
  const { saved } = useHostSession(hostId);
  const [origin, setOrigin] = useState(hostId ?? saved?.hostId);
  if (origin === undefined && saved) setOrigin(saved.hostId);

  return (
    <HostScope value={hostId ?? origin}>
      <SheetStack fullScreen>
        <Stack.Screen name="chat-background" options={{ title: t.chatBackground.title }} />
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="memory" />
        <Stack.Screen name="activity" />
        <Stack.Screen name="routine/[id]" />
        <Stack.Screen name="assignment/[id]" />
        <Stack.Screen name="routine-new" />
        <Stack.Screen name="routine-edit/[id]" />
        <Stack.Screen name="model" />
        <Stack.Screen name="model-picker" />
        <Stack.Screen name="workspace" />
        <Stack.Screen name="approval-history" />
        <Stack.Screen name="approval-rules" />
        <Stack.Screen name="inbox" />
        <Stack.Screen name="notifications" options={{ title: t.notifications }} />
      </SheetStack>
    </HostScope>
  );
}
