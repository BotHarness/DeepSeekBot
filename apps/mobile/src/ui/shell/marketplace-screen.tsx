import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Keyboard, Platform, View, type ViewInstance } from 'react-native';
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
  const target = marketplaceTarget({ entry, hostId });
  const home = query === '' && topic === '';
  const resource = marketplace.list({ q: query, sort, topic, lang: locale });
  const state = useCatalogueResource(resource);
  const mounted = useMounted<ViewInstance>(() => {
    void resource.refresh();
  }, [resource]);
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
    <View ref={mounted} style={{ flex: 1, backgroundColor: theme.color.base }}>
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
      <PullToRefresh
        refreshing={state.busy && state.value !== undefined}
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
                <MarketplaceDiscovery
                  sort={sort}
                  onSort={setSort}
                  topic={topic}
                  onTopic={setTopic}
                />
                {query || topic ? (
                  <Text variant="meta" tone="muted">
                    {[query, topic].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                {state.error ? (
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
              state.value?.nextCursor ? (
                <Button
                  testID="marketplace-more"
                  label={t.marketplace.more}
                  busy={state.busy}
                  onPress={() => void resource.more()}
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
