import { useState } from 'react';
import { FlatList, Pressable, View, type ViewInstance } from 'react-native';
import type {
  MarketplaceEntry,
  MarketplaceSection,
  MarketplaceSectionName,
} from '../../../../../packages/core/src/marketplace/client';
import { marketplace, useCatalogueResource } from '../../marketplace/native-catalogue';
import { recordFeature } from '../../telemetry/features';
import { pressTint, useDesignTheme } from '../design/theme';
import { marketplaceHome, radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { locale, useStrings } from '../strings';
import { MarketplaceAvatarImage, MarketplaceBannerImage } from './marketplace-art';
import {
  MarketplaceHeading,
  MarketplacePlaceholder,
  MarketplaceRetry,
} from './marketplace-heading';
import {
  importMarketplaceBot,
  openMarketplaceBot,
  openRanking,
  type MarketplaceTarget,
} from './marketplace-navigation';

export function marketplaceAuthor(bot: MarketplaceEntry): string {
  return bot.source === 'upload' ? (bot.author?.name ?? bot.owner) : bot.fullName;
}

export function useSectionTitle() {
  const t = useStrings();
  return (section: MarketplaceSectionName) => t.marketplace[section];
}

function PosterCard({
  bot,
  busy,
  onOpen,
  onImport,
}: {
  bot: MarketplaceEntry;
  busy: boolean;
  onOpen(): void;
  onImport(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const name = bot.displayName ?? bot.name;
  return (
    <View
      testID={`marketplace-poster-${bot.id}`}
      style={{
        width: marketplaceHome.posterWidth,
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: theme.layer.raised.fill,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${bot.fullName}`}
        onPress={onOpen}
        android_ripple={{ color: pressTint(theme.color.fg) }}
        style={{ aspectRatio: marketplaceHome.posterAspect, justifyContent: 'flex-end' }}
      >
        {({ pressed }) => (
          <>
            <MarketplaceBannerImage
              bot={bot}
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
            />
            <View
              style={{
                padding: space.x4,
                paddingBottom: space.x3,
                gap: space.x2,
                backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
              }}
            >
              <View style={{ marginTop: -(marketplaceHome.posterAvatar / 2 + space.x4) }}>
                <MarketplaceAvatarImage bot={bot} size={marketplaceHome.posterAvatar} />
              </View>
              <Text strong numberOfLines={2}>
                {name}
              </Text>
            </View>
          </>
        )}
      </Pressable>
      <View style={{ paddingHorizontal: space.x4, paddingBottom: space.x4, gap: space.x3 }}>
        <Text variant="meta" tone="muted">
          {t.marketplace.installs(bot.installs)}
        </Text>
        <Button
          testID={`marketplace-poster-import-${bot.id}`}
          label={t.marketplace.importShort}
          tone="primary"
          busy={busy}
          onPress={onImport}
        />
      </View>
    </View>
  );
}

export function CompactRow({ bot, onPress }: { bot: MarketplaceEntry; onPress(): void }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const name = bot.displayName ?? bot.name;
  return (
    <Pressable
      testID={`marketplace-compact-${bot.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${bot.fullName}`}
      onPress={onPress}
      android_ripple={{ color: pressTint(theme.color.fg) }}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.x4,
        padding: space.x4,
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <MarketplaceAvatarImage bot={bot} size={marketplaceHome.compactAvatar} />
      </View>
      <View style={{ flex: 1, gap: space.x1 }}>
        <Text strong>{name}</Text>
        <Text variant="meta" tone="muted" numberOfLines={1}>
          {marketplaceAuthor(bot)}
        </Text>
        {bot.description ? <Text numberOfLines={2}>{bot.description}</Text> : null}
        <Text variant="meta" tone="muted">
          {t.marketplace.installs(bot.installs)}
        </Text>
      </View>
    </Pressable>
  );
}

function HotCarousel({
  section,
  target,
}: {
  section: MarketplaceSection;
  target: MarketplaceTarget;
}) {
  const [importing, setImporting] = useState<string>();
  const start = (bot: MarketplaceEntry) => {
    if (importing) return;
    setImporting(bot.id);
    void importMarketplaceBot(bot, target, 'hot').finally(() => setImporting(undefined));
  };
  return (
    <FlatList
      testID="marketplace-hot"
      horizontal
      showsHorizontalScrollIndicator={false}
      data={section.entries}
      keyExtractor={(entry) => entry.bot.id}
      style={{ marginHorizontal: -space.x5 }}
      contentContainerStyle={{ paddingHorizontal: space.x5, gap: space.x3 }}
      renderItem={({ item }) => (
        <PosterCard
          bot={item.bot}
          busy={importing === item.bot.id}
          onOpen={() => openMarketplaceBot(item.bot, target, 'hot')}
          onImport={() => start(item.bot)}
        />
      )}
    />
  );
}

export function MarketplaceSections({ target }: { target: MarketplaceTarget }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const title = useSectionTitle();
  const resource = marketplace.sections(locale);
  const state = useCatalogueResource(resource);
  const mounted = useMounted<ViewInstance>(() => {
    void resource.refresh().then(() => {
      if (resource.getSnapshot().value?.some((section) => section.entries.length > 0))
        recordFeature('marketplace:section_view', {});
    });
  }, [resource]);
  const shown = (state.value ?? []).filter((section) => section.entries.length > 0);
  return (
    <View ref={mounted} testID="marketplace-sections" style={{ gap: space.x6 }}>
      {shown.map((section) => (
        <View
          key={section.section}
          testID={`marketplace-section-${section.section}`}
          style={{ gap: space.x3 }}
        >
          <MarketplaceHeading
            title={title(section.section)}
            link={{
              label: t.marketplace.seeAll,
              accessibilityLabel: t.marketplace.seeAllSection(title(section.section)),
              testID: `marketplace-see-all-${section.section}`,
              onPress: () => openRanking(section.section, target),
            }}
          />
          {section.section === 'hot' ? (
            <HotCarousel section={section} target={target} />
          ) : (
            <View style={{ gap: space.x3 }}>
              {section.entries.slice(0, marketplaceHome.compactRows).map(({ bot }) => (
                <CompactRow
                  key={bot.id}
                  bot={bot}
                  onPress={() => openMarketplaceBot(bot, target, section.section)}
                />
              ))}
            </View>
          )}
        </View>
      ))}
      {state.error && shown.length === 0 ? (
        <MarketplaceRetry
          testID="marketplace-sections-retry"
          busy={state.busy}
          onRetry={() => void resource.refresh()}
        />
      ) : state.value === undefined ? (
        <MarketplacePlaceholder
          testID="marketplace-sections-loading"
          label={t.contextLoading}
          blocks={[
            { width: '30%', height: theme.type.title.line },
            { height: marketplaceHome.posterWidth / marketplaceHome.posterAspect },
          ]}
        />
      ) : null}
    </View>
  );
}
