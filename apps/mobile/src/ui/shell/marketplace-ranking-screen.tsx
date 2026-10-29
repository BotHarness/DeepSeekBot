import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MARKETPLACE_SECTIONS,
  type MarketplaceSectionName,
} from '../../../../../packages/core/src/marketplace/client';
import { marketplace, useCatalogueResource } from '../../marketplace/native-catalogue';
import { space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { PullToRefresh } from '../primitives/pull-to-refresh';
import { Text } from '../primitives/text';
import { locale, useStrings } from '../strings';
import { marketplaceTarget, openMarketplaceBot } from './marketplace-navigation';
import { MarketplaceRow } from './marketplace-row';
import { useSectionTitle } from './marketplace-sections';

function sectionName(value: string | undefined): MarketplaceSectionName {
  return (MARKETPLACE_SECTIONS as readonly string[]).includes(value ?? '')
    ? (value as MarketplaceSectionName)
    : 'hot';
}

export function MarketplaceRankingScreen() {
  const t = useStrings();
  const title = useSectionTitle();
  const params = useLocalSearchParams<{ section?: string; entry?: string; hostId?: string }>();
  const target = marketplaceTarget(params);
  const name = sectionName(params.section);
  const resource = marketplace.sections(locale);
  const state = useCatalogueResource(resource);
  const insets = useSafeAreaInsets();
  const mounted = useMounted<ViewInstance>(() => {
    void resource.refresh();
  }, [resource]);
  const section = state.value?.find((item) => item.section === name);
  return (
    <View ref={mounted} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: title(name) }} />
      <PullToRefresh
        refreshing={state.busy && state.value !== undefined}
        onRefresh={() => void resource.refresh()}
      >
        {(scroll) => (
          <FlatList
            {...scroll}
            testID={`marketplace-ranking-${name}`}
            data={section?.entries ?? []}
            keyExtractor={(entry) => entry.bot.id}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{
              padding: space.x5,
              paddingBottom: insets.bottom + space.x5,
              gap: space.x4,
            }}
            ListHeaderComponent={
              state.error ? (
                <View style={{ gap: space.x3 }}>
                  <Text accessibilityRole="alert">{t.marketplace.unavailable}</Text>
                  <Button
                    testID="marketplace-ranking-retry"
                    label={t.marketplace.retry}
                    busy={state.busy}
                    onPress={() => void resource.refresh()}
                  />
                </View>
              ) : (
                <></>
              )
            }
            ListEmptyComponent={
              state.status === 'idle' || state.status === 'loading' ? (
                <LoadingIndicator accessibilityLabel={t.marketplace.loading} />
              ) : state.status === 'ready' ? (
                <Text tone="muted">{t.marketplace.empty}</Text>
              ) : (
                <></>
              )
            }
            renderItem={({ item }) => (
              <MarketplaceRow
                bot={item.bot}
                onPress={() => openMarketplaceBot(item.bot, target, name)}
              />
            )}
          />
        )}
      </PullToRefresh>
    </View>
  );
}
