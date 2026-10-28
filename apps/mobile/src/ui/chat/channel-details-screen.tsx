import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { RosterBot } from '../../host/client';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { botBanner } from '../../marketplace/artwork';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { profileShell, radius, space } from '../design/tokens';
import { Button } from '../primitives/creation-button';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { ProfileHero } from './profile-hero';
import { ChannelFilesTab } from './channel-files-tab';
import { ProfileShell, type ProfileTabBody } from './profile-shell';
import { profileTabs } from './profile-tabs';

const PAIR_TABS = profileTabs('bot-pair');

export function ChannelDetailsScreen({ hostId, channelId }: { hostId: string; channelId: string }) {
  const { client, saved } = useHostSession(hostId);
  const host = useHostSnapshot(client);
  const t = useStrings();
  const router = useRouter();
  const offline = host.connection.status === 'unreachable' || host.connection.status === 'stopped';
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
          : !channel && offline
            ? t.channelFiles.disconnected
            : undefined;
  const members: (RosterBot | undefined)[] =
    channel?.members.map((member) => host.roster?.bots.find((bot) => bot.slug === member)) ?? [];
  const title = members.map((bot) => bot?.displayName ?? t.activityRow.unavailableBot).join('、');
  const shell = (body: ProfileTabBody) => (
    <ProfileShell
      identity={<PairIdentity members={members} title={title} />}
      tabs={PAIR_TABS}
      options={[]}
      tab="files"
      onTab={() => {}}
      body={() => body}
      onClose={() => router.back()}
    />
  );
  const note = (node: ReactNode) => shell({ rows: [{ key: 'note', render: () => node }] });

  if (unavailable !== undefined)
    return note(
      <View style={{ gap: space.x3 }}>
        <Text tone="muted">{unavailable}</Text>
        {unavailable === t.channelFiles.disconnected ? (
          <Button
            testID="channel-details-retry"
            variant="text"
            label={host.connection.status === 'unreachable' ? t.retry : t.back}
            onPress={() =>
              host.connection.status === 'unreachable' ? client?.retryNow() : router.back()
            }
          />
        ) : null}
      </View>,
    );
  if (!channel || !client || !saved) return note(<LoadingIndicator />);
  return (
    <ChannelFilesTab client={client} hostId={hostId} channelId={channelId} active>
      {shell}
    </ChannelFilesTab>
  );
}

function PairIdentity({
  members,
  title,
}: {
  members: readonly (RosterBot | undefined)[];
  title: string;
}) {
  const theme = useDesignTheme();
  const first = members.find((bot) => bot !== undefined);
  return (
    <ProfileHero
      banner={
        first === undefined ? undefined : { source: botBanner(first), headers: first.bannerHeaders }
      }
      name={title}
      avatar={
        <View pointerEvents="none" style={{ flexDirection: 'row' }}>
          {members.map((bot, index) =>
            bot === undefined ? null : (
              <View
                key={bot.slug}
                style={{
                  padding: index === 0 ? 0 : profileShell.avatarEdge,
                  marginVertical: index === 0 ? 0 : -profileShell.avatarEdge,
                  borderRadius: radius.round,
                  backgroundColor: theme.overlay.fill,
                  marginLeft: index === 0 ? 0 : -profileShell.overlap,
                }}
              >
                <BotAvatar bot={bot} size={profileShell.avatar} />
              </View>
            ),
          )}
        </View>
      }
    />
  );
}
