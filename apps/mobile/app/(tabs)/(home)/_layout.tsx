import { Stack } from 'expo-router';

import {
  channelRouteId,
  channelStackRouter,
  conversationRouteOptions,
} from '../../../src/ui/shell/channel-navigation';
import { swipeEntryListeners } from '../../../src/ui/shell/swipe-entry';
import { sessionRouteOptions, TabStack } from '../../../src/ui/shell/tab-stack';

export const unstable_settings = { initialRouteName: 'index' };

export default function ChatsLayout() {
  return (
    <TabStack router={channelStackRouter}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="dm/[slug]"
        dangerouslySingular={channelRouteId}
        options={conversationRouteOptions}
        listeners={swipeEntryListeners('default')}
      />
      <Stack.Screen
        name="channel/[id]"
        dangerouslySingular={channelRouteId}
        options={conversationRouteOptions}
        listeners={swipeEntryListeners('default')}
      />
      <Stack.Screen name="session/[id]" options={sessionRouteOptions} />
    </TabStack>
  );
}
