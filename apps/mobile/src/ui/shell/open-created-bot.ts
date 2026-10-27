import { router } from 'expo-router';
import { AppState } from 'react-native';
import { hostSession } from '../../host/host-session';
import { conversationFilter } from '../../host/native-conversation-filter';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { botCreation } from '../../host/native-bot-creation';
import { openBotCreationResult } from '../../host/bot-creation-navigation';

export async function openCreatedBot(
  stillHere: () => boolean = () => true,
  depth = 0,
): Promise<boolean> {
  await conversationFilter.ready;
  return openBotCreationResult(
    {
      recover: botCreation.resume,
      snapshot: botCreation.getSnapshot,
      deviceId: (id) => hostSession.getState().hosts.find((host) => host.hostId === id)?.deviceId,
      switchHost: hostSession.switchTo,
      async open(hostId, slug) {
        conversationFilter.set(computerEnvironmentKey(hostId));
        if (depth > 0) router.dismiss(depth);
        router.replace({ pathname: '/dm/[slug]', params: { slug, hostId } });
      },
      acknowledge: botCreation.acknowledge,
    },
    () => AppState.currentState === 'active' && stillHere(),
  );
}
