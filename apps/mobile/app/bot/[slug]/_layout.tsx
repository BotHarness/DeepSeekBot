import { Stack } from 'expo-router';
import { t } from '../../../src/ui/strings';
import { SheetStack } from '../../../src/ui/primitives/sheet-stack';

export default function BotProfileLayout() {
  return (
    <SheetStack>
      <Stack.Screen name="chat-background" options={{ title: t.chatBackground.title }} />
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="memory" />
      <Stack.Screen name="activity" />
      <Stack.Screen name="routine/[id]" />
      <Stack.Screen name="routine-new" />
      <Stack.Screen name="routine-edit/[id]" />
      <Stack.Screen name="model" />
      <Stack.Screen name="model-picker" />
      <Stack.Screen name="workspace" />
      <Stack.Screen name="notifications" options={{ title: t.notifications }} />
    </SheetStack>
  );
}
