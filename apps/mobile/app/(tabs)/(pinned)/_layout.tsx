import { Stack } from 'expo-router';

import { TabStack } from '../../../src/ui/shell/tab-stack';

export const unstable_settings = { initialRouteName: 'pinned' };

export default function PinnedLayout() {
  return (
    <TabStack>
      <Stack.Screen name="pinned" options={{ headerShown: false }} />
    </TabStack>
  );
}
