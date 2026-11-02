import { Stack, router, useLocalSearchParams } from 'expo-router';
import { memo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Platform,
  View,
  type NativeScrollEvent,
  type ViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MarketplaceSort } from '../../../../../packages/core/src/marketplace/client';
import { marketplace, useCatalogueResource } from '../../marketplace/native-catalogue';
import { space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { MarketplaceDiscovery } from './marketplace-discovery';
import { PullToRefresh } from '../primitives/pull-to-refresh';
import { Text } from '../primitives/text';
import { HeaderIconButton } from './header-icon-button';
import { HeaderSearch } from './header-search';
import { useDesignTheme } from '../design/theme';
import { haptic } from '../haptics';
import { useStrings, locale } from '../strings';
import { MarketplaceRow } from './marketplace-row';
import { MarketplaceTopics } from './marketplace-topics';
import { MarketplaceDailyPicks } from './marketplace-daily-picks';
import { marketplaceTarget, openMarketplaceBot } from './marketplace-navigation';
import { MarketplaceSections } from './marketplace-sections';
import type { CatalogueList } from '../../marketplace/catalogue';

export function MarketplaceScreen() {
  const t = useStrings();
  const { hostId, entry } = useLocalSearchParams<{ hostId?: string; entry?: string }>();
  const theme = useDesignTheme();
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<MarketplaceSort>('updated');
  const [topic, setTopic] = useState('');
  const [choosingTopic, setChoosingTopic] = useState(false);
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === 'ios';
  const resource = marketplace.list({ q: query, sort, topic, lang: locale });
  const searchNow = (submitted = search) => {
    Keyboard.dismiss();
    const next = submitted.trim();
    setSearch(next);
    if (next === query) void resource.refresh();
    else setQuery(next);
  };
  const openSearch = () => {
    haptic('selection');
    setSearching(true);
  };
  const closeSearch = () => {
    setSearching(false);
    setSearch('');
    setQuery('');
  };
  const openFilters = () => {
    haptic('menu');
    Keyboard.dismiss();
    setChoosingTopic(true);
  };
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.base }}>
      <Stack.Screen
        options={
          ios && !searching
            ? {
                title: '',
                headerTitle: '',
                headerShown: true,
                headerTransparent: true,
                headerStyle: {},
                headerShadowVisible: false,
                headerBackVisible: false,
                headerTintColor: theme.color.fg,
                scrollEdgeEffects: { top: 'automatic', bottom: 'hidden' },
                unstable_headerLeftItems: () => [
                  {
                    type: 'button',
                    label: t.back,
                    identifier: 'marketplace-back',
                    icon: { type: 'sfSymbol', name: 'chevron.left' },
                    onPress: () => router.back(),
                  },
                ],
                unstable_headerRightItems: () => [
                  {
                    type: 'button',
                    label: t.marketplace.search,
                    identifier: 'marketplace-search-button',
                    icon: { type: 'sfSymbol', name: 'magnifyingglass' },
                    onPress: openSearch,
                  },
                  {
                    type: 'button',
                    label: t.marketplace.topics,
                    identifier: 'marketplace-filter-button',
                    icon: { type: 'sfSymbol', name: 'line.3.horizontal.decrease' },
                    onPress: openFilters,
                  },
                ],
              }
            : { title: t.marketplace.title, headerShown: false }
        }
      />
      {!ios || searching ? (
        <View
          style={{
            paddingTop: insets.top + space.x2,
            paddingHorizontal: space.x4,
            paddingBottom: space.x3,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x2,
          }}
        >
          {searching ? (
            <HeaderSearch
              testID="marketplace-search"
              maxLength={100}
              value={search}
              placeholder={t.marketplace.search}
              onChangeText={setSearch}
              onSubmitEditing={searchNow}
              onClose={closeSearch}
            />
          ) : (
            <>
              <HeaderIconButton
                icon="back"
                label={t.back}
                testID="marketplace-back"
                onPress={() => router.back()}
              />
              <Text variant="title" strong accessibilityRole="header" style={{ flex: 1 }}>
                {t.marketplace.title}
              </Text>
              <HeaderIconButton
                icon="search"
                label={t.marketplace.search}
                testID="marketplace-search-button"
                onPress={openSearch}
              />
              <HeaderIconButton
                icon="filter"
                label={t.marketplace.topics}
                testID="marketplace-filter-button"
                selected={topic !== ''}
                onPress={openFilters}
              />
            </>
          )}
        </View>
      ) : null}
      <MarketplaceCatalogue
        query={query}
        sort={sort}
        topic={topic}
        hostId={hostId}
        entry={entry}
        onSort={setSort}
        onTopic={setTopic}
      />
      {choosingTopic ? (
        <MarketplaceTopics
          value={topic}
          onChange={(value) => {
            setTopic(value);
            setChoosingTopic(false);
          }}
          onClose={() => setChoosingTopic(false)}
        />
      ) : null}
    </View>
  );
}

const MarketplaceCatalogue = memo(function MarketplaceCatalogue({
  query,
  sort,
  topic,
  hostId,
  entry,
  onSort,
  onTopic,
}: {
  query: string;
  sort: MarketplaceSort;
  topic: string;
  hostId: string | undefined;
  entry: string | undefined;
  onSort(sort: MarketplaceSort): void;
  onTopic(topic: string): void;
}) {
  const t = useStrings();
  const insets = useSafeAreaInsets();
  const target = marketplaceTarget({ entry, hostId });
  const home = query === '' && topic === '';
  const resource = marketplace.list({ q: query, sort, topic, lang: locale });
  const state = useCatalogueResource(resource);
  const pagingIntent = useRef<CatalogueList | null>(null);
  const loadNextPage = () => {
    const current = resource.getSnapshot();
    if (pagingIntent.current !== resource) return;
    pagingIntent.current = null;
    if (current.busy || current.error || !current.value?.nextCursor) return;
    void resource.more();
  };
  const scrollNearEnd = (event: NativeScrollEvent) => {
    if (
      event.contentOffset.y + event.layoutMeasurement.height >=
      event.contentSize.height - event.layoutMeasurement.height / 2
    )
      loadNextPage();
  };
  const mounted = useMounted<ViewInstance>(() => {
    pagingIntent.current = null;
    void resource.refresh();
  }, [resource]);
  return (
    <View ref={mounted} style={{ flex: 1 }}>
      <PullToRefresh
        refreshing={state.busy && state.operation !== 'more' && state.value !== undefined}
        onRefresh={() => void resource.refresh()}
      >
        {(scroll) => (
          <FlatList
            {...scroll}
            testID="marketplace-list"
            data={state.value?.bots ?? []}
            keyExtractor={(bot) => bot.id}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScrollBeginDrag={({ nativeEvent }) => {
              pagingIntent.current = resource;
              scrollNearEnd(nativeEvent);
            }}
            onScroll={({ nativeEvent }) => scrollNearEnd(nativeEvent)}
            onEndReached={loadNextPage}
            onEndReachedThreshold={0.5}
            contentContainerStyle={{
              padding: space.x5,
              paddingBottom: insets.bottom + space.x5,
              gap: space.x4,
            }}
            ListHeaderComponent={
              <View style={{ gap: space.x4 }}>
                {home ? (
                  <View testID="marketplace-home" style={{ gap: space.x6 }}>
                    <MarketplaceDailyPicks target={target} />
                    <MarketplaceSections target={target} />
                  </View>
                ) : null}
                <MarketplaceDiscovery sort={sort} onSort={onSort} topic={topic} onTopic={onTopic} />
                {query || topic ? (
                  <Text variant="meta" tone="muted">
                    {[query, topic].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                {state.error && state.operation !== 'more' ? (
                  <View style={{ gap: space.x3 }}>
                    <Text accessibilityRole="alert">{t.marketplace.unavailable}</Text>
                    <Button
                      testID="marketplace-retry"
                      label={t.marketplace.retry}
                      onPress={() => void resource.refresh()}
                    />
                  </View>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              state.status === 'idle' || state.status === 'loading' ? (
                <LoadingIndicator accessibilityLabel={t.marketplace.loading} />
              ) : state.status === 'ready' ? (
                <Text>{t.marketplace.empty}</Text>
              ) : (
                <></>
              )
            }
            ListFooterComponent={
              state.operation === 'more' && state.busy ? (
                <View testID="marketplace-page-loading">
                  <LoadingIndicator accessibilityLabel={t.marketplace.loading} />
                </View>
              ) : state.operation === 'more' && state.error ? (
                <View style={{ gap: space.x3 }}>
                  <Text accessibilityRole="alert">{t.marketplace.unavailable}</Text>
                  <Button
                    testID="marketplace-page-retry"
                    label={t.marketplace.retry}
                    onPress={() => void resource.more()}
                  />
                </View>
              ) : state.value?.nextCursor ? (
                <Button
                  testID="marketplace-more"
                  label={t.marketplace.more}
                  disabled={state.busy}
                  onPress={() => {
                    pagingIntent.current = null;
                    void resource.more();
                  }}
                />
              ) : (
                <></>
              )
            }
            renderItem={({ item }) => (
              <MarketplaceRow bot={item} onPress={() => openMarketplaceBot(item, target, 'list')} />
            )}
          />
        )}
      </PullToRefresh>
    </View>
  );
});
