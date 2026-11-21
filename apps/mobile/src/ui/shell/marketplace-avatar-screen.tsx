import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Keyboard, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MAX_MARKETPLACE_AVATAR_QUERY,
  type MarketplaceAvatar,
} from '@botharness/host-protocol/marketplace-avatar';
import { useHostSession } from '../../host/host-session';
import { marketplaceAvatars, type MarketplaceAvatars } from '../../marketplace/avatars';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { PullToRefresh } from '../primitives/pull-to-refresh';
import { haptic } from '../haptics';
import { MarketplaceHeader } from './marketplace-header';
import { MarketplaceCard, MarketplaceCardCopy } from './marketplace-row';
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
  const theme = useDesignTheme();
  const { hostId } = useLocalSearchParams<{ hostId?: string }>();
  const { client, saved } = useHostSession(hostId);
  const actions = client && saved ? marketplaceAvatars(client) : undefined;
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [q, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [choosing, setChoosing] = useState(false);
  const resource = actions?.list({ ...(q ? { q } : {}), ...(tag ? { tag } : {}) });
  const goToBots = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/marketplace');
  };
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.base }}>
      <MarketplaceHeader
        title={copy.browse}
        showNativeTitle
        prefix="marketplace-avatar"
        showControls={resource !== undefined}
        searching={searching && resource !== undefined}
        onBack={goToBots}
        onOpenSearch={() => {
          haptic('selection');
          setSearching(true);
        }}
        search={{
          testID: 'marketplace-avatar-search',
          maxLength: MAX_MARKETPLACE_AVATAR_QUERY,
          value: search,
          placeholder: copy.search,
          onChangeText: setSearch,
          onSubmitEditing: (value) => {
            Keyboard.dismiss();
            const next = value.trim();
            setSearch(next);
            if (next === q) void resource?.refresh();
            else setQuery(next);
          },
          onClose: () => {
            setSearching(false);
            setSearch('');
            setQuery('');
          },
        }}
        filter={{
          label: copy.tags,
          selected: tag !== '',
          onPress: () => {
            haptic('menu');
            Keyboard.dismiss();
            setChoosing(true);
          },
        }}
        menu={
          actions && saved && saved.member === undefined
            ? {
                label: copy.moreActions,
                actions: [
                  {
                    key: 'marketplace-avatar-publish',
                    label: copy.publish,
                    glyph: 'share',
                    symbol: 'square.and.arrow.up',
                    run: () =>
                      router.push({
                        pathname: '/marketplace-avatar-editor',
                        params: { hostId: saved.hostId },
                      }),
                  },
                  {
                    key: 'marketplace-avatar-mine',
                    label: copy.mine,
                    glyph: 'photo',
                    symbol: 'photo.on.rectangle',
                    run: () =>
                      router.push({
                        pathname: '/marketplace-avatar-mine',
                        params: { hostId: saved.hostId },
                      }),
                  },
                ],
              }
            : undefined
        }
      />
      {resource && saved ? (
        <AvatarCatalogue
          key={saved.hostId}
          resource={resource}
          hostId={saved.hostId}
          q={q}
          tag={tag}
          onBots={goToBots}
        />
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: space.x5, gap: space.x5 }}
        >
          <MarketplaceSectionPicker section="avatars" onChange={goToBots} />
          {saved === undefined ? (
            <AvatarLoadState loading onRetry={() => {}} />
          ) : (
            <Text>{copy.pair}</Text>
          )}
        </ScrollView>
      )}
      {choosing && actions ? (
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

function AvatarCatalogue({
  resource,
  hostId,
  q,
  tag,
  onBots,
}: {
  resource: ReturnType<MarketplaceAvatars['list']>;
  hostId: string;
  q: string;
  tag: string;
  onBots(): void;
}) {
  const t = useStrings();
  const copy = t.marketplaceAvatars;
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const state = useAvatarResource(resource);
  const columns = theme.largeText ? 1 : 2;
  return (
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
          contentInsetAdjustmentBehavior="automatic"
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
              <MarketplaceSectionPicker section="avatars" onChange={onBots} />
              {q || tag ? (
                <Text variant="meta" tone="muted">
                  {[q, tag].filter(Boolean).join(' · ')}
                </Text>
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
  );
}

export function MarketplaceAvatarCard({
  avatar,
  onPress,
}: {
  avatar: MarketplaceAvatar;
  onPress(): void;
}) {
  const copy = useStrings().marketplaceAvatars;
  const author = copy.author(avatar.author.name, avatar.author.id);
  const count = copy.count(avatar.applyCount);
  return (
    <MarketplaceCard
      testID={`marketplace-avatar-${avatar.id}`}
      label={[avatar.name, author, count].join(', ')}
      onPress={onPress}
    >
      <MarketplaceAvatarImage uri={avatar.imageUrl} rounded={false} />
      <MarketplaceCardCopy title={avatar.name} attribution={author} count={count} />
    </MarketplaceCard>
  );
}
