import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MarketplaceAvatar } from '@botharness/host-protocol/marketplace-avatar';
import { useHostSession } from '../../host/host-session';
import { marketplaceAvatars, type MarketplaceAvatars } from '../../marketplace/avatars';
import { space } from '../design/tokens';
import { confirmDestructive, showActionMenu } from '../primitives/app-dialog';
import { PullToRefresh } from '../primitives/pull-to-refresh';
import { SettingsRow } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { useAvatarAction } from './marketplace-avatar-action';
import { AvatarLoadState, useAvatarResource } from './marketplace-avatar-parts';

export function MarketplaceAvatarMineScreen() {
  const { hostId } = useLocalSearchParams<{ hostId?: string }>();
  const { client, saved } = useHostSession(hostId);
  const copy = useStrings().marketplaceAvatars;
  return (
    <>
      <Stack.Screen options={{ title: copy.mine }} />
      {hostId && client && saved && saved.member === undefined ? (
        <MyAvatars key={hostId} actions={marketplaceAvatars(client)} hostId={hostId} />
      ) : (
        <View style={{ padding: space.x5 }}>
          <Text>{copy.unavailable}</Text>
        </View>
      )}
    </>
  );
}

function MyAvatars({ actions, hostId }: { actions: MarketplaceAvatars; hostId: string }) {
  const t = useStrings();
  const copy = t.marketplaceAvatars;
  const state = useAvatarResource(actions.mine);
  const insets = useSafeAreaInsets();
  const action = useAvatarAction();
  const [removed, setRemoved] = useState<string[]>([]);
  const select = (avatar: MarketplaceAvatar) => {
    showActionMenu(avatar.name, [
      {
        text: copy.edit,
        icon: 'settings',
        onPress: () =>
          router.push({
            pathname: '/marketplace-avatar-editor',
            params: { hostId, id: avatar.id },
          }),
      },
      {
        text: copy.delete,
        icon: 'delete',
        style: 'destructive',
        onPress: () =>
          confirmDestructive(copy.deleteTitle(avatar.name), copy.deleteWarning, copy.delete, () =>
            action.run(
              async () => {
                await actions.remove(avatar.id);
                setRemoved((ids) => [...ids, avatar.id]);
                await actions.mine.refresh();
              },
              () => t.dialogFailed,
            ),
          ),
      },
    ]);
  };
  return (
    <PullToRefresh
      refreshing={state.busy && !!state.value}
      onRefresh={() => void actions.mine.refresh()}
    >
      {(scroll) => (
        <FlatList
          {...scroll}
          testID="marketplace-avatar-mine-list"
          data={state.value?.filter((avatar) => !removed.includes(avatar.id)) ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: space.x5,
            paddingBottom: insets.bottom + space.x5,
            gap: space.x3,
          }}
          ListHeaderComponent={
            <View style={{ gap: space.x3 }}>
              <AvatarLoadState
                error={state.error}
                loading={(!state.value && !state.error) || action.busy}
                onRetry={() => void actions.mine.refresh()}
              />
              {action.error ? (
                <Text tone="danger" accessibilityRole="alert">
                  {action.error}
                </Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            state.status === 'ready' && !state.error ? <Text>{copy.mineEmpty}</Text> : <></>
          }
          renderItem={({ item }) => (
            <SettingsRow
              title={item.name}
              detail={copy.count(item.applyCount)}
              testID={`marketplace-owned-avatar-${item.id}`}
              onPress={action.busy ? undefined : () => select(item)}
            />
          )}
        />
      )}
    </PullToRefresh>
  );
}
