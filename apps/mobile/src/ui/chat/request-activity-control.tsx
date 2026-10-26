import { Platform } from 'react-native';
import { useCallback, useSyncExternalStore } from 'react';
import type { HostClient, RosterBot } from '../../host/client';
import { useConversation } from '../../host/host-session';
import { activityStartTarget } from '../../host/live-activity-routing';
import { Button } from '../primitives/creation-button';
import { useRequestActivityAction } from './request-activity-action';

type Props = {
  client: HostClient;
  bot: RosterBot;
  hostId: string;
  messageId: string | undefined;
  channelId: string | undefined;
  refused: boolean;
};

export function RequestActivityControl(props: Props) {
  return Platform.OS === 'ios' ? <ActivityControl {...props} /> : null;
}

function ActivityControl({ client, bot, hostId, messageId, channelId, refused }: Props) {
  const conversation = useConversation(messageId && !refused ? client : undefined, bot);
  const snapshot = useSyncExternalStore(
    useCallback(
      (listener: () => void) => conversation?.subscribe(listener) ?? (() => {}),
      [conversation],
    ),
    () => conversation?.getSnapshot(),
  );
  const committed = snapshot?.messages.find(
    (message) =>
      message.id === messageId && message.author === 'human' && message.delivery === 'committed',
  );
  const target = activityStartTarget(
    messageId && !refused
      ? { hostId, botSlug: bot.slug, messageId, ...(channelId === undefined ? {} : { channelId }) }
      : undefined,
    hostId,
    committed?.source?.channelId,
    committed ? [committed.id] : [],
  );
  const action = useRequestActivityAction(target);
  return (
    <Button
      testID="request-activity"
      label={action.label}
      disabled={action.disabled}
      busy={action.busy}
      onPress={action.onPress}
      variant="text"
    />
  );
}
