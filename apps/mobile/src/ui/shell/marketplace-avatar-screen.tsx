import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Keyboard, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MAX_MARKETPLACE_AVATAR_QUERY,
  type MarketplaceAvatar,
} from '@botharness/host-protocol/marketplace-avatar';
import { useHostSession } from '../../host/host-session';
import { marketplaceAvatars, type MarketplaceAvatars } from '../../marketplace/avatars';
import { pressTint, useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { PullToRefresh } from '../primitives/pull-to-refresh';
import { SearchField } from '../primitives/search-field';
import { MarketplaceSectionPicker } from './marketplace-section-picker';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import {
  AvatarLoadState,
  MarketplaceAvatarImage,
  useAvatarResource,
} from './marketplace-avatar-parts';
import { MarketplaceTopics } from './marketplace-topics';

export function MarketplaceAvatarScreen() {
  const copy = useStrings().marketplaceAvatars;
  const { hostId } = useLocalSearchParams<{ hostId?: string }>();
  const { client, saved } = useHostSession(hostId);
  const goToBots = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/marketplace');
  };
  const picker = <MarketplaceSectionPicker section="avatars" onChange={goToBots} />;
  return (
    <>
      <Stack.Screen options={{ title: copy.browse }} />
      {client && saved ? (
        <AvatarCatalogue
          key={saved.hostId}
          actions={marketplaceAvatars(client)}
          hostId={saved.hostId}
          owner={saved.member === undefined}
          picker={picker}
        />
      ) : (
        <View style={{ padding: space.x5, gap: space.x5 }}>
          {picker}
          {saved === undefined ? (
            <AvatarLoadState loading onRetry={() => {}} />
          ) : (
            <Text>{copy.pair}</Text>
          )}
        </View>
      )}
    </>
  );
}

function AvatarCatalogue({
  actions,
  hostId,
  owner,
  picker,
}: {
  actions: MarketplaceAvatars;
  hostId: string;
  owner: boolean;
  picker: React.ReactNode;
}) {
  const t = useStrings();
  const copy = t.marketplaceAvatars;
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [q, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [choosing, setChoosing] = useState(false);
  const resource = actions.list({ ...(q ? { q } : {}), ...(tag ? { tag } : {}) });
  const state = useAvatarResource(resource);
  const columns = theme.largeText ? 1 : 2;
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.base }}>
      <PullToRefresh
        refreshing={state.busy && state.operation === 'refresh' && !!state.value}
        onRefresh={() => void resource.refresh()}
      >
        {(scroll) => (
          <FlatList
            {...scroll}
            key={columns}
            testID="marketplace-avatar-grid"
            numColumns={columns}
            data={state.value?.avatars ?? []}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{
              padding: space.x5,
              paddingBottom: insets.bottom + space.x5,
              gap: space.x4,
            }}
            columnWrapperStyle={columns === 1 ? undefined : { gap: space.x4 }}
            ListHeaderComponent={
              <View style={{ gap: space.x4 }}>
                {picker}
                <SearchField
                  inset={0}
                  testID="marketplace-avatar-search"
                  value={search}
                  placeholder={copy.search}
                  maxLength={MAX_MARKETPLACE_AVATAR_QUERY}
                  onChangeText={setSearch}
                  onSubmitEditing={(value) => {
                    Keyboard.dismiss();
                    const next = value.trim();
                    if (next === q) void resource.refresh();
                    else setQuery(next);
                  }}
                />
                <Button
                  label={tag || copy.allTags}
                  testID="marketplace-avatar-tags"
                  selected={!!tag}
                  onPress={() => {
                    Keyboard.dismiss();
                    setChoosing(true);
                  }}
                />
                {owner ? (
                  <View style={{ gap: space.x3 }}>
                    <Button
                      label={copy.publish}
                      testID="marketplace-avatar-publish"
                      onPress={() =>
                        router.push({ pathname: '/marketplace-avatar-editor', params: { hostId } })
                      }
                    />
                    <Button
                      label={copy.mine}
                      testID="marketplace-avatar-mine"
                      onPress={() =>
                        router.push({ pathname: '/marketplace-avatar-mine', params: { hostId } })
                      }
                    />
                  </View>
                ) : null}
                {state.operation !== 'more' ? (
                  <AvatarLoadState
                    error={state.error}
                    loading={!state.value && !state.error}
                    onRetry={() => void resource.refresh()}
                  />
                ) : null}
              </View>
            }
            ListEmptyComponent={
              state.status === 'ready' && !state.error ? <Text>{copy.empty}</Text> : <></>
            }
            ListFooterComponent={
              state.value?.nextCursor ? (
                <Button
                  label={state.error && state.operation === 'more' ? t.retry : t.marketplace.more}
                  testID="marketplace-avatar-more"
                  busy={state.busy}
                  onPress={() => void resource.more()}
                />
              ) : (
                <></>
              )
            }
            renderItem={({ item }) => (
              <View style={{ flex: 1 / columns }}>
                <MarketplaceAvatarCard
                  avatar={item}
                  onPress={() =>
                    router.push({
                      pathname: '/marketplace-avatar',
                      params: { id: item.id, hostId },
                    })
                  }
                />
              </View>
            )}
          />
        )}
      </PullToRefresh>
      {choosing ? (
        <MarketplaceTopics
          resource={actions.tags}
          title={copy.tags}
          allLabel={copy.allTags}
          testIDPrefix="marketplace-avatar-tag"
          value={tag}
          onChange={(value) => {
            setTag(value);
            setChoosing(false);
          }}
          onClose={() => setChoosing(false)}
        />
      ) : null}
    </View>
  );
}

export function MarketplaceAvatarCard({
  avatar,
  onPress,
}: {
  avatar: MarketplaceAvatar;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  const copy = useStrings().marketplaceAvatars;
  return (
    <Pressable
      testID={`marketplace-avatar-${avatar.id}`}
      accessibilityRole="button"
      accessibilityLabel={[
        avatar.name,
        copy.author(avatar.author.name, avatar.author.id),
        copy.count(avatar.applyCount),
      ].join(', ')}
      onPress={onPress}
      android_ripple={{ color: pressTint(theme.color.fg) }}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      <MarketplaceAvatarImage uri={avatar.imageUrl} />
      <View style={{ gap: space.x2, padding: space.x4 }}>
        <Text strong>{avatar.name}</Text>
        <Text variant="meta" tone="muted">
          {copy.author(avatar.author.name, avatar.author.id)}
        </Text>
        <Text variant="meta" tone="muted">
          {copy.count(avatar.applyCount)}
        </Text>
      </View>
    </Pressable>
  );
}
