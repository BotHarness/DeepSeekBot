import { Stack } from 'expo-router';
import { SheetStack } from '../../../src/ui/primitives/sheet-stack';
import { useStrings } from '../../../src/ui/strings';
export default function GroupLayout() {
  const t = useStrings();
  return (
    <SheetStack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="chat-background" options={{ title: t.chatBackground.title }} />
      <Stack.Screen name="notifications" options={{ title: t.notifications }} />
    </SheetStack>
  );
}
