import { Pressable, View, type ViewInstance } from 'react-native';
import type { MarketplaceDigestSummary } from '../../../../../packages/core/src/marketplace/client';
import { marketplace, useCatalogueResource } from '../../marketplace/native-catalogue';
import { recordFeature } from '../../telemetry/features';
import { pressTint, useDesignTheme } from '../design/theme';
import { marketplaceHome, radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { locale, useStrings } from '../strings';
import { DigestCover } from './marketplace-cover';
import {
  MarketplaceHeading,
  MarketplacePlaceholder,
  MarketplaceRetry,
} from './marketplace-heading';
import { openDigest, openPastPicks, type MarketplaceTarget } from './marketplace-navigation';

export function DigestCard({
  digest,
  grid = false,
  onPress,
}: {
  digest: MarketplaceDigestSummary;
  grid?: boolean;
  onPress(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={`marketplace-digest-${digest.day}`}
      accessibilityRole="button"
      accessibilityLabel={t.marketplace.readDigest(digest.title)}
      onPress={onPress}
      android_ripple={{ color: pressTint(theme.color.fg) }}
      style={{ flex: grid ? 1 : undefined, borderRadius: radius.lg, overflow: 'hidden' }}
    >
      {({ pressed }) => (
        <DigestCover
          pressed={pressed}
          day={digest.day}
          title={digest.title}
          picks={digest.picks}
          lang={locale}
          art={
            grid
              ? { aspectRatio: marketplaceHome.gridCoverAspect }
              : { height: marketplaceHome.heroCover }
          }
          avatarSize={grid ? marketplaceHome.coverAvatar : marketplaceHome.heroAvatar}
          fill={grid}
        />
      )}
    </Pressable>
  );
}

export function MarketplaceDailyPicks({ target }: { target: MarketplaceTarget }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const resource = marketplace.digests(locale);
  const state = useCatalogueResource(resource);
  const mounted = useMounted<ViewInstance>(() => {
    void resource.refresh().then(() => {
      if ((resource.getSnapshot().value?.length ?? 0) > 0)
        recordFeature('marketplace:digest_view', {});
    });
  }, [resource]);
  const today = state.value?.[0];
  return (
    <View ref={mounted} testID="marketplace-daily-picks" style={{ gap: space.x3 }}>
      {today ? (
        <>
          <MarketplaceHeading
            title={t.marketplace.dailyPicks}
            link={{
              label: t.marketplace.seePastPicks,
              testID: 'marketplace-past-picks',
              onPress: () => openPastPicks(target),
            }}
          />
          <DigestCard digest={today} onPress={() => openDigest(today.day, 'hero', target)} />
        </>
      ) : state.status === 'failed' ? (
        <MarketplaceRetry
          testID="marketplace-daily-picks-retry"
          busy={state.busy}
          onRetry={() => void resource.refresh()}
        />
      ) : state.value === undefined ? (
        <MarketplacePlaceholder
          testID="marketplace-daily-picks-loading"
          label={t.marketplace.loadingPicks}
          blocks={[
            { width: '40%', height: theme.type.title.line },
            { height: marketplaceHome.heroCover + theme.type.body.line * 3 },
          ]}
        />
      ) : null}
    </View>
  );
}
