import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MarketplaceDigestSummary } from '../../../../../packages/core/src/marketplace/client';
import { marketplace, useCatalogueResource } from '../../marketplace/native-catalogue';
import { useDesignTheme } from '../design/theme';
import { marketplaceHome, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { PullToRefresh } from '../primitives/pull-to-refresh';
import { Text } from '../primitives/text';
import { locale, useStrings } from '../strings';
import { DigestCard } from './marketplace-daily-picks';
import { marketplaceTarget, openDigest } from './marketplace-navigation';

export function MarketplacePastPicksScreen() {
  const t = useStrings();
  const target = marketplaceTarget(useLocalSearchParams<{ entry?: string; hostId?: string }>());
  const resource = marketplace.digests(locale);
  const state = useCatalogueResource(resource);
  const insets = useSafeAreaInsets();
  const theme = useDesignTheme();
  const columns = theme.largeText ? 1 : marketplaceHome.gridColumns;
  const digests = state.value ?? [];
  const cells: (MarketplaceDigestSummary | null)[] = [
    ...digests,
    ...Array.from<null>({
      length: (columns - (digests.length % columns)) % columns,
    }).fill(null),
  ];
  const mounted = useMounted<ViewInstance>(() => {
    void resource.refresh();
  }, [resource]);
  return (
    <View ref={mounted} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t.marketplace.pastPicks }} />
      <PullToRefresh
        refreshing={state.busy && state.value !== undefined}
        onRefresh={() => void resource.refresh()}
      >
        {(scroll) => (
          <FlatList
            {...scroll}
            testID="marketplace-past-picks-grid"
            data={cells}
            keyExtractor={(digest, index) => digest?.day ?? `spacer-${index}`}
            key={columns}
            numColumns={columns}
            contentInsetAdjustmentBehavior="automatic"
            columnWrapperStyle={columns > 1 ? { gap: space.x3, alignItems: 'stretch' } : undefined}
            contentContainerStyle={{
              padding: space.x5,
              paddingBottom: insets.bottom + space.x5,
              gap: space.x3,
            }}
            ListHeaderComponent={
              state.error ? (
                <View style={{ gap: space.x3 }}>
                  <Text accessibilityRole="alert">{t.marketplace.unavailable}</Text>
                  <Button
                    testID="marketplace-past-picks-retry"
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
                <LoadingIndicator accessibilityLabel={t.marketplace.loadingPicks} />
              ) : state.status === 'ready' ? (
                <Text tone="muted">{t.marketplace.noPastPicks}</Text>
              ) : (
                <></>
              )
            }
            renderItem={({ item }) => (
              <View style={{ flex: 1 }}>
                {item ? (
                  <DigestCard
                    digest={item}
                    grid
                    onPress={() => openDigest(item.day, 'archive', target)}
                  />
                ) : null}
              </View>
            )}
          />
        )}
      </PullToRefresh>
    </View>
  );
}
