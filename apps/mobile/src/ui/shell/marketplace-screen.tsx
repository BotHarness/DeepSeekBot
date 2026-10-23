import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Keyboard, Platform, View, type ViewInstance } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MarketplaceSort } from '../../../../../packages/core/src/marketplace/client';
import { marketplace, useCatalogueResource } from '../../marketplace/native-catalogue';
import { space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { MarketplaceDiscovery } from './marketplace-discovery';
import { SearchField } from '../primitives/search-field';
import { HeaderCircleButton } from '../chat/header-chrome';
import { PullToRefresh } from '../primitives/pull-to-refresh';
import { Text } from '../primitives/text';
import { HeaderIconButton } from './header-icon-button';
import { HeaderGlyph } from './header-glyph';
import { ChevronLeftIcon, CloseIcon, CheckIcon } from './icons';
import { useDesignTheme } from '../design/theme';
import { haptic } from '../haptics';
import { locale, t } from '../strings';
import { MarketplaceRow } from './marketplace-row';
import { MarketplaceTopics } from './marketplace-topics';

export function MarketplaceScreen() {
  const { hostId, entry } = useLocalSearchParams<{ hostId?: string; entry?: string }>();
  const theme = useDesignTheme();
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<MarketplaceSort>('updated');
  const [topic, setTopic] = useState('');
  const [choosingTopic, setChoosingTopic] = useState(false);
  const insets = useSafeAreaInsets();
  const [searchHeight, setSearchHeight] = useState(theme.touch + space.x5 * 2 + insets.bottom);
  const ios = Platform.OS === 'ios';
  const resource = marketplace.list({ q: query, sort, topic, lang: locale });
  const state = useCatalogueResource(resource);
  const mounted = useMounted<ViewInstance>(() => {
    void resource.refresh();
  }, [resource]);
  const searchNow = () => {
    Keyboard.dismiss();
    const next = search.trim();
    setSearch(next);
    if (next === query) void resource.refresh();
    else setQuery(next);
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
          ios
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
      {!ios ? (
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
          <HeaderIconButton label={t.back} testID="marketplace-back" onPress={() => router.back()}>
            <ChevronLeftIcon color={theme.color.fg} size={theme.type.title.line} />
          </HeaderIconButton>
          <Text variant="title" strong accessibilityRole="header" style={{ flex: 1 }}>
            {t.marketplace.title}
          </Text>
          <HeaderIconButton
            label={t.marketplace.topics}
            testID="marketplace-filter-button"
            selected={topic !== ''}
            onPress={openFilters}
          >
            <HeaderGlyph icon="filter" active={topic !== ''} />
          </HeaderIconButton>
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
              paddingBottom: searchHeight + space.x5,
              gap: space.x4,
            }}
            ListHeaderComponent={
              <View style={{ gap: space.x4 }}>
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
              <MarketplaceRow
                bot={item}
                onPress={() =>
                  router.push({
                    pathname: '/marketplace-bot',
                    params: {
                      id: item.id,
                      ...(entry === 'host' && hostId
                        ? { entry: 'host', hostId }
                        : { entry: 'all' }),
                    },
                  })
                }
              />
            )}
          />
        )}
      </PullToRefresh>
      <KeyboardAvoidingView
        behavior="padding"
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          justifyContent: 'flex-end',
        }}
      >
        <View
          pointerEvents="box-none"
          onLayout={(event) => setSearchHeight(event.nativeEvent.layout.height)}
          style={{
            paddingHorizontal: space.x5,
            paddingTop: space.x3,
            paddingBottom: Math.max(insets.bottom, space.x3),
            gap: space.x2,
          }}
        >
          {searching ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
              <View style={{ flex: 1 }}>
                <SearchField
                  floating
                  autoFocus
                  inset={0}
                  testID="marketplace-search"
                  maxLength={100}
                  placeholder={t.marketplace.search}
                  value={search}
                  onChangeText={setSearch}
                  onSubmitEditing={searchNow}
                />
              </View>
              <HeaderCircleButton
                label={t.marketplace.search}
                testID="marketplace-search-submit"
                onPress={searchNow}
              >
                <CheckIcon color={theme.color.fg} size={theme.type.title.line} />
              </HeaderCircleButton>
              <HeaderCircleButton
                label={t.closeSearch}
                testID="marketplace-search-close"
                onPress={() => {
                  Keyboard.dismiss();
                  setSearching(false);
                  setSearch('');
                  setQuery('');
                }}
              >
                <CloseIcon color={theme.color.fg} size={theme.type.title.line} />
              </HeaderCircleButton>
            </View>
          ) : (
            <View style={{ alignSelf: 'flex-end' }}>
              <HeaderCircleButton
                label={t.marketplace.search}
                testID="marketplace-search-button"
                onPress={() => {
                  haptic('selection');
                  setSearching(true);
                }}
              >
                <HeaderGlyph icon="search" active={false} />
              </HeaderCircleButton>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
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
