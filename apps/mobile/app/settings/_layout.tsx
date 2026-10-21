import { Stack } from 'expo-router';
import { SheetStack } from '../../src/ui/primitives/sheet-stack';
import { t } from '../../src/ui/strings';

export default function SettingsLayout() {
  return (
    <SheetStack modalGrabber>
      <Stack.Screen name="chat-background" options={{ title: t.chatBackground.global }} />
      <Stack.Screen
        name="index"
        options={{
          title: t.settings,
          headerShown: false,
        }}
      />
      <Stack.Screen name="usage" options={{ title: t.usage }} />
      <Stack.Screen name="storage" options={{ title: t.storage.title }} />
      <Stack.Screen name="app-icon" options={{ title: t.appIcon }} />
      <Stack.Screen name="activity-count" options={{ title: t.activityCountSettings.title }} />
      <Stack.Screen name="models" options={{ title: t.modelSettings.title }} />
      <Stack.Screen name="model-picker" />
      <Stack.Screen name="model-preset" />
      <Stack.Screen name="notifications" options={{ title: t.notifications }} />
    </SheetStack>
  );
}
