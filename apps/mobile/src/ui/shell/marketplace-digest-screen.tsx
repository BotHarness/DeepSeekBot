import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { digestArticlePicks, digestDate } from '../../marketplace/digest';
import { marketplace, useCatalogueResource } from '../../marketplace/native-catalogue';
import { marketplaceHome, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { PullToRefresh } from '../primitives/pull-to-refresh';
import { Text } from '../primitives/text';
import { locale, useStrings } from '../strings';
import { DigestCover } from './marketplace-cover';
import { MarketplaceLink } from './marketplace-heading';
import { marketplaceTarget, openMarketplaceBot, openPastPicks } from './marketplace-navigation';
import { MarketplaceRow } from './marketplace-row';

export function MarketplaceDigestScreen() {
  const t = useStrings();
  const params = useLocalSearchParams<{ day?: string; entry?: string; hostId?: string }>();
  const target = marketplaceTarget(params);
  const day = params.day ?? '';
  const resource = marketplace.digest(day, locale);
  const state = useCatalogueResource(resource);
  const insets = useSafeAreaInsets();
  const mounted = useMounted<ViewInstance>(() => {
    if (day) void resource.refresh();
  }, [day, resource]);
  const digest = state.value;
  return (
    <View ref={mounted} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: digest?.title ?? t.marketplace.dailyPicks }} />
      <PullToRefresh
        refreshing={state.busy && digest !== undefined}
        onRefresh={() => void resource.refresh()}
      >
        {(scroll) => (
          <ScrollView
            {...scroll}
            testID="marketplace-digest-article"
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{
              padding: space.x5,
              paddingBottom: insets.bottom + space.x5,
              gap: space.x5,
            }}
          >
            {state.error || !day ? (
              <View style={{ gap: space.x3 }}>
                <Text accessibilityRole="alert">{t.marketplace.unavailable}</Text>
                {day ? (
                  <Button
                    testID="marketplace-digest-retry"
                    label={t.marketplace.retry}
                    busy={state.busy}
                    onPress={() => void resource.refresh()}
                  />
                ) : null}
              </View>
            ) : null}
            {!digest && !state.error && day ? (
              <LoadingIndicator accessibilityLabel={t.marketplace.loadingPicks} />
            ) : null}
            {digest ? (
              <>
                <DigestCover
                  day={digest.day}
                  title={digest.title}
                  picks={digestArticlePicks(digest)}
                  lang={locale}
                  art={{ height: marketplaceHome.articleCover }}
                  avatarSize={marketplaceHome.articleAvatar}
                  caption={false}
                />
                <View style={{ gap: space.x3 }}>
                  <Text variant="meta" tone="muted" selectable>
                    {digestDate(digest.day, locale)}
                  </Text>
                  <Text variant="title" strong accessibilityRole="header" selectable>
                    {digest.title}
                  </Text>
                  <Text tone="muted" selectable>
                    {digest.lede}
                  </Text>
                </View>
                {digest.sections.map((section, index) => (
                  <View
                    key={`${index}:${section.heading}`}
                    testID={`marketplace-digest-section-${index}`}
                    style={{ gap: space.x3 }}
                  >
                    <Text variant="title" strong accessibilityRole="header" selectable>
                      {section.heading}
                    </Text>
                    <Text selectable>{section.body}</Text>
                    {section.bot ? (
                      <MarketplaceRow
                        bot={section.bot}
                        onPress={() => openMarketplaceBot(section.bot!, target, 'digest')}
                      />
                    ) : null}
                  </View>
                ))}
                <View style={{ alignItems: 'flex-start' }}>
                  <MarketplaceLink
                    label={t.marketplace.seePastPicks}
                    testID="marketplace-digest-past-picks"
                    onPress={() => openPastPicks(target)}
                  />
                </View>
              </>
            ) : null}
          </ScrollView>
        )}
      </PullToRefresh>
    </View>
  );
}
