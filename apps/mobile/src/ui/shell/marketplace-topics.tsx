import { FlatList, Platform, Pressable, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { marketplace, useCatalogueResource } from '../../marketplace/native-catalogue';
import { pressTint, useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { DrawerHeader } from '../primitives/drawer-header';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { MarketplaceTopicSheet } from '../primitives/marketplace-topic-sheet';
import { RadioMark } from '../primitives/radio-mark';
import { Text } from '../primitives/text';
import type { MarketplaceSort } from '../../../../../packages/core/src/marketplace/client';
import { Segmented } from '../primitives/segmented';
import { t } from '../strings';
import { CheckIcon } from './icons';

export function MarketplaceTopics({
  value,
  sort,
  onSort,
  onChange,
  onClose,
}: {
  value: string;
  sort?: MarketplaceSort;
  onSort?(sort: MarketplaceSort): void;
  onChange(value: string): void;
  onClose(): void;
}) {
  const resource = marketplace.topics;
  const state = useCatalogueResource(resource);
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const mounted = useMounted<ViewInstance>(() => {
    void resource.refresh();
  }, [resource]);
  return (
    <MarketplaceTopicSheet onClose={onClose}>
      <View
        ref={mounted}
        style={{ flex: 1, backgroundColor: theme.layer.sheet.fill, paddingBottom: insets.bottom }}
      >
        <DrawerHeader
          title={onSort ? t.marketplace.filters : t.marketplace.topics}
          onClose={onClose}
        />
        <FlatList
          testID="marketplace-topic-list"
          contentInsetAdjustmentBehavior="automatic"
          data={[{ topic: '', count: 0 }, ...(state.value ?? [])]}
          keyExtractor={(item) => item.topic}
          contentContainerStyle={{ padding: space.x5, gap: space.x2 }}
          ListHeaderComponent={
            <View style={{ gap: space.x5 }}>
              {onSort && sort ? (
                <View testID="marketplace-sort" style={{ gap: space.x3 }}>
                  <Text strong>{t.marketplace.sort}</Text>
                  <Segmented<MarketplaceSort>
                    label={t.marketplace.sort}
                    value={sort}
                    onChange={onSort}
                    options={[
                      { value: 'updated', label: t.marketplace.updated },
                      { value: 'created', label: t.marketplace.newest },
                      { value: 'stars', label: t.marketplace.popular },
                    ]}
                  />
                </View>
              ) : null}
              <Text strong>{t.marketplace.topics}</Text>
              {state.busy ? (
                <LoadingIndicator accessibilityLabel={t.marketplace.loading} />
              ) : state.error ? (
                <View>
                  <Text accessibilityRole="alert">{t.marketplace.unavailable}</Text>
                  <Button
                    testID="marketplace-topics-retry"
                    label={t.marketplace.retry}
                    onPress={() => void resource.refresh()}
                  />
                </View>
              ) : (
                <></>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`marketplace-topic-${item.topic || 'all'}`}
              accessibilityRole="radio"
              accessibilityLabel={item.topic || t.marketplace.allTopics}
              accessibilityState={{ checked: item.topic === value }}
              onPress={() => onChange(item.topic)}
              android_ripple={{ color: pressTint(theme.color.fg) }}
              style={({ pressed }) => ({
                minHeight: theme.touch,
                padding: space.x4,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x4,
                backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
              })}
            >
              {Platform.OS === 'android' ? <RadioMark selected={item.topic === value} /> : null}
              <Text style={{ flex: 1 }}>
                {item.topic ? `${item.topic} (${item.count})` : t.marketplace.allTopics}
              </Text>
              {Platform.OS === 'ios' && item.topic === value ? (
                <CheckIcon color={theme.color.accent} size={theme.type.body.line} />
              ) : null}
            </Pressable>
          )}
        />
      </View>
    </MarketplaceTopicSheet>
  );
}
