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
import { t } from '../strings';
import { CheckIcon } from './icons';

export function MarketplaceTopics({
  value,
  onChange,
  onClose,
}: {
  value: string;
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
        style={{ flex: 1, backgroundColor: theme.overlay.fill, paddingBottom: insets.bottom }}
      >
        <View
          style={{ paddingHorizontal: space.x5, paddingTop: space.x5, paddingBottom: space.x3 }}
        >
          <DrawerHeader
            title={t.marketplace.topics}
            onClose={onClose}
            glassClose={Platform.OS === 'ios'}
          />
        </View>
        <FlatList
          testID="marketplace-topic-list"
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
