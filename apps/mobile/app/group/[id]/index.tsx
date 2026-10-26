import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { groupActions, groupInfo } from '../../../src/host/group-channel';
import { useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import { pickAvatarImage } from '../../../src/host/pick-avatar-image';
import { SettingsRow, SettingsSection } from '../../../src/ui/primitives/settings-row';
import { ChannelFilesAction } from '../../../src/ui/chat/channel-files-action';
import { GroupInfoSheet } from '../../../src/ui/chat/group-info';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { space } from '../../../src/ui/design/tokens';
import { Text } from '../../../src/ui/primitives/text';
import { useStrings } from '../../../src/ui/strings';

export default function GroupInfoScreen() {
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

  if (sourceChanged || info === undefined || actions === undefined)
    return (
      <View style={{ flex: 1, padding: space.x6, backgroundColor: theme.color.surface }}>
        {sourceChanged ? (
          <Text tone="muted">{t.sourceChanged}</Text>
        ) : roster === undefined ? null : (
          <Text tone="muted">{t.groupGone}</Text>
        )}
      </View>
    );

  return (
    <GroupInfoSheet
      info={info}
      background={
        saved && id ? (
          <>
            {snapshot.connection.status !== 'refused' ? (
              <ChannelFilesAction hostId={saved.hostId} channelId={id} />
            ) : null}
            <SettingsSection>
              <SettingsRow
                title={t.chatBackground.title}
                disclosure
                onPress={() =>
                  router.push({
                    pathname: '/group/[id]/chat-background',
                    params: { id, hostId: saved.hostId, channelId: id },
                  })
                }
              />
            </SettingsSection>
            <SettingsSection>
              <SettingsRow
                title={t.notifications}
                disclosure
                onPress={() =>
                  router.push({
                    pathname: '/group/[id]/notifications',
                    params: { id, hostId: saved.hostId },
                  })
                }
              />
            </SettingsSection>
          </>
        ) : null
      }
      actions={actions}
      pickAvatar={pickAvatarImage}
      onOpenBot={(slug) =>
        router.push({ pathname: '/bot/[slug]', params: { slug, hostId: saved?.hostId } })
      }
      onDisbanded={() => router.dismissAll()}
    />
  );
}
