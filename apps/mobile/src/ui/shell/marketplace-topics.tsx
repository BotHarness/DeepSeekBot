import { FlatList, Platform, Pressable, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CatalogueResource } from '../../marketplace/catalogue';
import { marketplace, useCatalogueResource } from '../../marketplace/native-catalogue';
import { pressTint, useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { CheckmarkRow } from '../primitives/checkmark-row';
import { DrawerHeader } from '../primitives/drawer-header';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { MarketplaceTopicSheet } from '../primitives/marketplace-topic-sheet';
import { RadioMark } from '../primitives/radio-mark';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

export function MarketplaceTopics({
  value,
  onChange,
  onClose,
  resource = marketplace.topics,
  title,
  allLabel,
  testIDPrefix = 'marketplace-topic',
}: {
  value: string;
  onChange(value: string): void;
  onClose(): void;
  resource?: CatalogueResource<{ topic: string; count: number }[]>;
  title?: string;
  allLabel?: string;
  testIDPrefix?: string;
}) {
  const t = useStrings();
  const all = allLabel ?? t.marketplace.allTopics;
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
        style={{ flex: 1, backgroundColor: theme.overlay.fill, paddingBottom: insets.bottom }}
      >
        <View
          style={{ paddingHorizontal: space.x5, paddingTop: space.x5, paddingBottom: space.x3 }}
        >
          <DrawerHeader
            title={title ?? t.marketplace.topics}
            onClose={onClose}
            glassClose={Platform.OS === 'ios'}
          />
        </View>
        <FlatList
          testID={`${testIDPrefix}-list`}
          contentInsetAdjustmentBehavior="automatic"
          data={[{ topic: '', count: 0 }, ...(state.value ?? [])]}
          keyExtractor={(item) => item.topic}
          contentContainerStyle={{ padding: space.x5, gap: space.x2 }}
          ListHeaderComponent={
            <View style={{ gap: space.x5 }}>
              {state.busy ? (
                <LoadingIndicator accessibilityLabel={t.marketplace.loading} />
              ) : state.error ? (
                <View>
                  <Text accessibilityRole="alert">{t.marketplace.unavailable}</Text>
                  <Button
                    testID={`${testIDPrefix}s-retry`}
                    label={t.marketplace.retry}
                    onPress={() => void resource.refresh()}
                  />
                </View>
              ) : (
                <></>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const label = item.topic ? `${item.topic} (${item.count})` : all;
            const testID = `${testIDPrefix}-${item.topic || 'all'}`;
            if (Platform.OS === 'ios')
              return (
                <View style={{ backgroundColor: theme.layer.raised.fill }}>
                  <CheckmarkRow
                    testID={testID}
                    label={label}
                    selected={item.topic === value}
                    onPress={() => onChange(item.topic)}
                  />
                </View>
              );
            return (
              <Pressable
                testID={testID}
                accessibilityRole="radio"
                accessibilityLabel={label}
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
                <RadioMark selected={item.topic === value} />
                <Text style={{ flex: 1 }}>{label}</Text>
              </Pressable>
            );
          }}
        />
      </View>
    </MarketplaceTopicSheet>
  );
}
