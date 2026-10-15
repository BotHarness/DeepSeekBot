import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { groupActions, groupInfo } from '../../src/host/group-channel';
import { useHostSession, useHostSnapshot } from '../../src/host/host-session';
import { pickGroupAvatar } from '../../src/host/pick-group-avatar';
import { GroupInfoSheet } from '../../src/ui/chat/group-info';
import { useDesignTheme } from '../../src/ui/design/theme';
import { space } from '../../src/ui/design/tokens';
import { Text } from '../../src/ui/primitives/text';
import { t } from '../../src/ui/strings';

export default function GroupInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useDesignTheme();
  const { client } = useHostSession();
  const roster = useHostSnapshot(client).roster;
  const info = useMemo(() => groupInfo(roster, id ?? ''), [roster, id]);
  const actions = useMemo(
    () => (client === undefined || id === undefined ? undefined : groupActions(client, id)),
    [client, id],
  );

  if (info === undefined || actions === undefined)
    return (
      <View style={{ flex: 1, padding: space.x6, backgroundColor: theme.color.surface }}>
        {roster === undefined ? null : <Text tone="muted">{t.groupGone}</Text>}
      </View>
    );

  return (
    <GroupInfoSheet
      info={info}
      actions={actions}
      pickAvatar={pickGroupAvatar}
      onOpenBot={(slug) => router.push({ pathname: '/bot/[slug]', params: { slug } })}
      onDisbanded={() => router.dismissAll()}
    />
  );
}
