import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { groupActions, groupInfo, loadGroupAssignments } from '../../../src/host/group-channel';
import { useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import { pickAvatarImage } from '../../../src/host/pick-avatar-image';
import { ChannelFilesTab } from '../../../src/ui/chat/channel-files-tab';
import { GroupProfilePage } from '../../../src/ui/chat/group-info';
import { profileTabMemory } from '../../../src/ui/chat/native-profile-tab-memory';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { space } from '../../../src/ui/design/tokens';
import { Text } from '../../../src/ui/primitives/text';
import { useStrings } from '../../../src/ui/strings';

export default function GroupProfileScreen() {
  const t = useStrings();
  const { id, hostId } = useLocalSearchParams<{ id: string; hostId?: string }>();
  const router = useRouter();
  const theme = useDesignTheme();
  const { client, saved } = useHostSession(hostId);
  const [openedOn, setOpenedOn] = useState(saved?.hostId);
  if (openedOn === undefined && saved?.hostId !== undefined) setOpenedOn(saved.hostId);
  const sourceChanged = (hostId ?? openedOn) !== saved?.hostId;
  const snapshot = useHostSnapshot(sourceChanged ? undefined : client);
  const roster = snapshot.roster;
  const refused = snapshot.connection.status === 'refused';
  const info = useMemo(
    () => (sourceChanged ? undefined : groupInfo(roster, id ?? '')),
    [sourceChanged, roster, id],
  );
  const actions = useMemo(
    () =>
      sourceChanged || client === undefined || id === undefined
        ? undefined
        : groupActions(client, id),
    [sourceChanged, client, id],
  );
  const loadWork = useCallback(
    () =>
      client === undefined || id === undefined
        ? Promise.resolve([])
        : loadGroupAssignments(client, id),
    [client, id],
  );

  if (sourceChanged || info === undefined || actions === undefined || client === undefined)
    return (
      <View style={{ flex: 1, padding: space.x6, backgroundColor: theme.overlay.fill }}>
        {sourceChanged ? (
          <Text tone="muted">{t.sourceChanged}</Text>
        ) : roster === undefined ? null : (
          <Text tone="muted">{t.groupGone}</Text>
        )}
      </View>
    );

  const params = { id: info.channel.id, hostId: saved?.hostId };
  return (
    <GroupProfilePage
      key={`${saved?.hostId}:${info.channel.id}`}
      info={info}
      actions={actions}
      tabMemory={profileTabMemory}
      pickAvatar={pickAvatarImage}
      onClose={() => router.back()}
      onOpenBot={(slug) =>
        router.push({ pathname: '/bot/[slug]', params: { slug, hostId: saved?.hostId } })
      }
      onDisbanded={() => router.dismissAll()}
      {...(refused ? {} : { loadWork })}
      onOpenAssignment={(assignment) => {
        if (assignment.botSlug === undefined) return;
        router.push({
          pathname: '/group/[id]/assignment/[session]',
          params: { ...params, slug: assignment.botSlug, session: assignment.sessionId },
        });
      }}
      onChatBackground={() =>
        router.push({
          pathname: '/group/[id]/chat-background',
          params: { ...params, channelId: info.channel.id },
        })
      }
      onNotifications={() => router.push({ pathname: '/group/[id]/notifications', params })}
      files={
        saved && !refused
          ? (active, render) => (
              <ChannelFilesTab
                client={client}
                hostId={saved.hostId}
                channelId={info.channel.id}
                active={active}
              >
                {render}
              </ChannelFilesTab>
            )
          : undefined
      }
    />
  );
}
