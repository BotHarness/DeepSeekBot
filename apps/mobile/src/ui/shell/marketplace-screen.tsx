import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Keyboard, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MarketplaceSort } from '../../../../../packages/core/src/marketplace/client';
import { marketplace, useCatalogueResource } from '../../marketplace/native-catalogue';
import { space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { renderKeyboardFormScroll } from '../primitives/keyboard-form';
import { PullToRefresh } from '../primitives/pull-to-refresh';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { HeaderIconButton } from './header-icon-button';
import { HeaderGlyph } from './header-glyph';
import { ChevronLeftIcon, CloseIcon } from './icons';
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
  const resource = marketplace.list({ q: query, sort, topic, lang: locale });
  const state = useCatalogueResource(resource);
  const mounted = useMounted<ViewInstance>(() => {
    void resource.refresh();
  }, [resource]);
  const searchNow = () => {
    Keyboard.dismiss();
    setQuery(search.trim());
  };
  return (
    <View ref={mounted} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t.marketplace.title, headerShown: false }} />
      <View
        style={{
          paddingTop: insets.top + space.x2,
          paddingBottom: space.x3,
          paddingHorizontal: space.x4,
          gap: space.x3,
          backgroundColor: theme.color.base,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
          <HeaderIconButton label={t.back} testID="marketplace-back" onPress={() => router.back()}>
            <ChevronLeftIcon color={theme.color.fg} size={theme.type.title.line} />
          </HeaderIconButton>
          {theme.fontScale > 1.5 ? (
            <View style={{ flex: 1 }} />
          ) : (
            <Text variant="title" strong accessibilityRole="header" style={{ flex: 1 }}>
              {t.marketplace.title}
            </Text>
          )}
          <HeaderIconButton
            label={t.marketplace.search}
            testID="marketplace-search-button"
            selected={searching || query !== ''}
            onPress={() => {
              haptic('selection');
              setSearching(!searching);
              if (searching) Keyboard.dismiss();
            }}
          >
            <HeaderGlyph icon="search" active={searching || query !== ''} />
          </HeaderIconButton>
          <HeaderIconButton
            label={t.marketplace.filters}
            testID="marketplace-filter-button"
            selected={topic !== '' || sort !== 'updated'}
            onPress={() => {
              haptic('menu');
              Keyboard.dismiss();
              setChoosingTopic(true);
            }}
          >
            <HeaderGlyph icon="filter" active={topic !== '' || sort !== 'updated'} />
          </HeaderIconButton>
        </View>
        {theme.fontScale > 1.5 ? (
          <Text variant="title" strong accessibilityRole="header">
            {t.marketplace.title}
          </Text>
        ) : null}
        {searching ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
            <View style={{ flex: 1 }}>
              <TextField
                autoFocus
                testID="marketplace-search"
                accessibilityLabel={t.marketplace.search}
                placeholder={t.marketplace.search}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
                onSubmitEditing={searchNow}
                maxLength={100}
              />
            </View>
            <HeaderIconButton
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
            </HeaderIconButton>
          </View>
        ) : null}
      </View>
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
            renderScrollComponent={renderKeyboardFormScroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{
              padding: space.x5,
              paddingBottom: insets.bottom + space.x5,
              gap: space.x4,
            }}
            ListHeaderComponent={
              <View style={{ gap: space.x4 }}>
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
      {choosingTopic ? (
        <MarketplaceTopics
          sort={sort}
          onSort={setSort}
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
