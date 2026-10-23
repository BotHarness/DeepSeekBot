import { Platform, Pressable, ScrollView, View, type ViewInstance } from 'react-native';
import type { MarketplaceSort } from '../../../../../packages/core/src/marketplace/client';
import { marketplace, useCatalogueResource } from '../../marketplace/native-catalogue';
import { marketplaceDiscovery, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { CheckIcon } from './icons';
import { useMounted } from '../mounted';
import { Chip } from '../primitives/chip';
import { Segmented } from '../primitives/segmented';
import { useSelectionFeedback } from '../selection-feedback';
import { t } from '../strings';

export function MarketplaceDiscovery({
  sort,
  onSort,
  topic,
  onTopic,
}: {
  sort: MarketplaceSort;
  onSort(value: MarketplaceSort): void;
  topic: string;
  onTopic(value: string): void;
}) {
  const theme = useDesignTheme();
  const chooseSort = useSelectionFeedback(sort, onSort);
  const options = [
    { value: 'updated' as const, label: t.marketplace.updated },
    { value: 'created' as const, label: t.marketplace.newest },
    { value: 'stars' as const, label: t.marketplace.popular },
  ];
  const topics = useCatalogueResource(marketplace.topics);
  const mounted = useMounted<ViewInstance>(() => {
    void marketplace.topics.refresh();
  }, []);
  const select = useSelectionFeedback(topic, onTopic);
  const featured = [...(topics.value ?? [])]
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
    .slice(0, marketplaceDiscovery.featuredTopics);
  if (topic && !featured.some((item) => item.topic === topic)) featured.push({ topic, count: 0 });
  return (
    <View ref={mounted} style={{ gap: space.x4 }}>
      <View testID="marketplace-sort">
        {Platform.OS === 'ios' && theme.largeText ? (
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t.marketplace.sort}
            style={{ gap: space.x1 }}
          >
            {options.map((option) => (
              <Pressable
                key={option.value}
                testID={`marketplace-sort-${option.value}`}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: sort === option.value }}
                onPress={() => chooseSort(option.value)}
                style={({ pressed }) => ({
                  minHeight: theme.touch,
                  padding: space.x3,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.x3,
                  backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
                })}
              >
                <Text style={{ flex: 1 }}>{option.label}</Text>
                {sort === option.value ? (
                  <CheckIcon color={theme.color.fg} size={theme.type.body.line} />
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : (
          <Segmented<MarketplaceSort>
            label={t.marketplace.sort}
            value={sort}
            onChange={onSort}
            options={options}
          />
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.x2, paddingVertical: space.x1 }}
      >
        <Chip
          testID="marketplace-featured-all"
          label={t.marketplace.allTopics}
          selected={topic === ''}
          onPress={() => select('')}
        />
        {featured.map((item) => (
          <Chip
            key={item.topic}
            testID={`marketplace-featured-${item.topic}`}
            label={item.topic}
            selected={topic === item.topic}
            onPress={() => select(item.topic)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
