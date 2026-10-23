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
import { Segmented } from '../primitives/segmented';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { locale, t } from '../strings';
import { MarketplaceRow } from './marketplace-row';
import { MarketplaceTopics } from './marketplace-topics';

export function MarketplaceScreen() {
  const { hostId, entry } = useLocalSearchParams<{ hostId?: string; entry?: string }>();
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
      <Stack.Screen options={{ title: t.marketplace.title }} />
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
                <TextField
                  testID="marketplace-search"
                  accessibilityLabel={t.marketplace.search}
                  placeholder={t.marketplace.search}
                  value={search}
                  onChangeText={setSearch}
                  returnKeyType="search"
                  onSubmitEditing={searchNow}
                  maxLength={100}
                />
                <Button
                  testID="marketplace-search-submit"
                  label={t.marketplace.search}
                  onPress={searchNow}
                />
                <View testID="marketplace-sort">
                  <Segmented<MarketplaceSort>
                    label={t.marketplace.sort}
                    value={sort}
                    onChange={setSort}
                    options={[
                      { value: 'updated', label: t.marketplace.updated },
                      { value: 'created', label: t.marketplace.newest },
                      { value: 'stars', label: t.marketplace.popular },
                    ]}
                  />
                </View>
                <Button
                  testID="marketplace-topics"
                  label={topic || t.marketplace.allTopics}
                  onPress={() => {
                    Keyboard.dismiss();
                    setChoosingTopic(true);
                  }}
                />
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
