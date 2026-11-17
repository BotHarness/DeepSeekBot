import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View, type ViewInstance } from 'react-native';

import { groupActions, groupInfo, loadGroupAssignments } from '../../host/group-channel';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { pickAvatarImage } from '../../host/pick-avatar-image';
import {
  loadChannelNickname,
  saveChannelNickname,
  useHumanIdentity,
} from '../../host/human-profile';
import { useMounted } from '../mounted';
import { sessionStopper } from '../../host/session-stop';
import { ChannelFilesTab } from './channel-files-tab';
import { GroupProfilePage } from './group-info';
import { profileTabMemory } from './native-profile-tab-memory';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { useProfileFocused } from './profile-visibility';

export function GroupProfileScreen({
  id,
  hostId,
  onClose,
}: {
  id: string;
  hostId?: string | undefined;
  onClose?: () => void;
}) {
  const t = useStrings();
  const focused = useProfileFocused();

  const router = useRouter();
  const theme = useDesignTheme();
  const { client, saved } = useHostSession(hostId);
  const [openedOn, setOpenedOn] = useState(saved?.hostId);
  if (openedOn === undefined && saved?.hostId !== undefined) setOpenedOn(saved.hostId);
  const sourceChanged = (hostId ?? openedOn) !== saved?.hostId;
  const snapshot = useHostSnapshot(sourceChanged ? undefined : client, focused);
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
  const [nickname, setNickname] = useState<string | null>();
  const human = useHumanIdentity(sourceChanged ? undefined : client);
  const nicknameMount = useMounted<ViewInstance>(() => {
    let live = true;
    let loaded = false;
    let pending = false;
    setNickname(undefined);
    if (sourceChanged || client === undefined || id === undefined) return;
    const load = (): void => {
      if (loaded || pending) return;
      pending = true;
      loadChannelNickname(client, id).then(
        (value) => {
          loaded = true;
          pending = false;
          if (live) setNickname(value);
        },
        () => {
          pending = false;
        },
      );
    };
    load();
    const unfollow = client.subscribe(() => {
      if (client.getSnapshot().connection.status === 'connected') load();
    });
    return () => {
      live = false;
      unfollow();
    };
  }, [sourceChanged, client, id]);
  const humanMount = human.mount;
  const profileMount = useCallback(
    (node: ViewInstance | null) => {
      nicknameMount(node);
      humanMount(node);
    },
    [nicknameMount, humanMount],
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
    <View ref={profileMount} style={{ flex: 1 }}>
      <GroupProfilePage
        nickname={{
          value: nickname,
          name: human.identity?.displayName,
          save: async (next) => {
            setNickname(await saveChannelNickname(client, info.channel.id, next));
          },
        }}
        key={`${saved?.hostId}:${info.channel.id}`}
        info={info}
        actions={actions}
        tabMemory={profileTabMemory}
        pickAvatar={pickAvatarImage}
        onClose={onClose ?? (() => router.back())}
        onOpenBot={(slug) =>
          router.push({ pathname: '/bot/[slug]', params: { slug, hostId: saved?.hostId } })
        }
        onDisbanded={() => router.dismissAll()}
        {...(refused ? {} : { loadWork, stopper: sessionStopper(client, info.channel.id) })}
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
                  active={active && focused}
                >
                  {render}
                </ChannelFilesTab>
              )
            : undefined
        }
      />
    </View>
  );
}
