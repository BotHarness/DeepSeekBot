import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { ScrollView } from 'react-native';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { space } from '../design/tokens';
import { SheetScreen } from '../primitives/sheet-screen';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { ChannelFilesAction } from './channel-files-action';

export function ChannelDetailsScreen({ hostId, channelId }: { hostId: string; channelId: string }) {
  const { client, saved } = useHostSession(hostId);
  const host = useHostSnapshot(client);
  const t = useStrings();
  const insets = useSafeAreaInsets();
  const channel = host.roster?.activityChannels?.find(
    (entry) =>
      entry.id === channelId &&
      entry.type === 'dm' &&
      entry.botSlug === undefined &&
      entry.deletedAt === undefined,
  );
  const unavailable =
    saved?.hostId !== hostId
      ? t.sourceChanged
      : host.connection.status === 'refused'
        ? t.refused
        : host.roster && !channel
          ? t.noChannel
          : undefined;
  return (
    <SheetScreen modalGrabber>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          padding: space.x5,
          paddingBottom: space.x5 + insets.bottom,
          gap: space.x4,
        }}
      >
        {unavailable ? (
          <Text tone="muted">{unavailable}</Text>
        ) : !channel ? (
          <LoadingIndicator />
        ) : (
          <>
            <Text variant="title" accessibilityRole="header">
              {channel?.members
                .map(
                  (member) =>
                    host.roster?.bots.find((bot) => bot.slug === member)?.displayName ??
                    t.activityRow.unavailableBot,
                )
                .join('、')}
            </Text>
            <ChannelFilesAction hostId={hostId} channelId={channelId} />
          </>
        )}
      </ScrollView>
    </SheetScreen>
  );
}
