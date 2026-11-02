import { useMemo } from 'react';

import {
  hostPush,
  quietChannels,
  useHostSession,
  useHostSnapshot,
  usePushStatus,
} from '../../host/host-session';
import { ChannelNotifications, type ChannelNotificationsPort } from '../channel-notifications';

export default function ChannelNotificationScreen({ channelId }: { channelId: string }) {
  const { saved, client } = useHostSession();
  const status = usePushStatus();
  const roster = useHostSnapshot(client).roster;
  const port = useMemo<ChannelNotificationsPort | undefined>(
    () =>
      saved === null || saved === undefined || client === undefined
        ? undefined
        : {
            load: () => hostPush.settings(saved),
            async setQuiet(quiet) {
              const settings = await hostPush.setQuiet(saved, channelId, quiet);
              quietChannels.set(saved.hostId, settings.quietChannelIds);
              return settings;
            },
            async setHostMuted(muted) {
              await client.call<unknown>('channelMuteSet', { channelId, muted });
              await client.refresh().catch(() => undefined);
            },
          },
    [saved, client, channelId],
  );
  if (saved === null || saved === undefined || port === undefined) return null;
  return (
    <ChannelNotifications
      status={status}
      channelId={channelId}
      hostMuted={roster?.arrangement?.muted?.includes(channelId) === true}
      port={port}
      key={`${saved.hostId}:${channelId}`}
    />
  );
}
