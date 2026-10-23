import { ScrollView, View, type ViewInstance } from 'react-native';
import type { MarketplaceSort } from '../../../../../packages/core/src/marketplace/client';
import { marketplace, useCatalogueResource } from '../../marketplace/native-catalogue';
import { marketplaceDiscovery, space } from '../design/tokens';
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
