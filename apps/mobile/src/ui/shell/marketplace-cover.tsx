import { Image } from 'expo-image';
import { View, type ViewStyle } from 'react-native';
import type { MarketplaceDigestPick } from '../../../../../packages/core/src/marketplace/client';
import type { MarketplaceLanguage } from '../../../../../packages/core/src/marketplace/language';
import { digestBanner, pickArt } from '../../marketplace/artwork';
import {
  DIGEST_COVER_PICKS,
  digestCoverLayout,
  digestDayOfMonth,
  digestMonth,
  digestShortDate,
} from '../../marketplace/digest';
import { useDesignTheme } from '../design/theme';
import { marketplaceHome, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { MarketplaceAvatarImage, MarketplaceBannerImage } from './marketplace-art';

const FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

function CoverTile({ pick, avatarSize }: { pick: MarketplaceDigestPick; avatarSize: number }) {
  const theme = useDesignTheme();
  return (
    <View
      testID={`digest-cover-pick-${pick.id}`}
      style={{ flex: 1, overflow: 'hidden', backgroundColor: theme.layer.raised.fill }}
    >
      <MarketplaceBannerImage bot={pickArt(pick)} style={FILL} />
      <View style={{ position: 'absolute', left: space.x3, bottom: space.x3 }}>
        <MarketplaceAvatarImage bot={pickArt(pick)} size={avatarSize} />
      </View>
    </View>
  );
}

function DateTile({ day, lang }: { day: string; lang: MarketplaceLanguage }) {
  const theme = useDesignTheme();
  const banner = digestBanner(day);
  return (
    <View style={{ flex: 1, overflow: 'hidden', backgroundColor: theme.layer.raised.fill }}>
      <Image
        testID="digest-cover-banner"
        source={{ uri: banner }}
        recyclingKey={banner}
        contentFit="cover"
        cachePolicy="memory"
        style={FILL}
      />
      <View
        testID="digest-cover-day"
        style={{
          position: 'absolute',
          left: space.x3,
          top: space.x3,
          minWidth: marketplaceHome.dateMark,
          alignItems: 'center',
          paddingVertical: space.x2,
          paddingHorizontal: space.x3,
          borderRadius: radius.md,
          backgroundColor: theme.layer.raised.fill,
        }}
      >
        <Text variant="meta" tone="accent" strong>
          {digestMonth(day, lang)}
        </Text>
        <Text variant="title" strong>
          {digestDayOfMonth(day)}
        </Text>
      </View>
    </View>
  );
}

export function DigestCover({
  day,
  title,
  picks,
  lang,
  art,
  avatarSize = marketplaceHome.coverAvatar,
  caption = true,
  pressed = false,
  fill = false,
}: {
  day: string;
  title: string;
  picks: readonly MarketplaceDigestPick[];
  lang: MarketplaceLanguage;
  art: Pick<ViewStyle, 'height' | 'aspectRatio'>;
  avatarSize?: number;
  caption?: boolean;
  pressed?: boolean;
  fill?: boolean;
}) {
  const theme = useDesignTheme();
  const layout = digestCoverLayout(picks.length);
  const shown = picks.slice(0, DIGEST_COVER_PICKS);
  const tile = (pick: MarketplaceDigestPick) => (
    <CoverTile key={pick.id} pick={pick} avatarSize={avatarSize} />
  );
  return (
    <View
      accessibilityElementsHidden={!caption}
      importantForAccessibility={caption ? 'auto' : 'no-hide-descendants'}
      style={{
        flexGrow: fill ? 1 : 0,
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: theme.layer.raised.fill,
      }}
    >
      <View
        testID={`digest-cover-${layout}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          { width: '100%', gap: space.x1 },
          art,
          { flexDirection: layout === 'four' ? 'column' : 'row' },
        ]}
      >
        {layout === 'date' ? <DateTile day={day} lang={lang} /> : null}
        {layout === 'one' || layout === 'two' ? shown.map(tile) : null}
        {layout === 'three' ? (
          <>
            <View style={{ flex: 2, flexDirection: 'row' }}>{tile(shown[0]!)}</View>
            <View style={{ flex: 1, gap: space.x1 }}>{shown.slice(1).map(tile)}</View>
          </>
        ) : null}
        {layout === 'four' ? (
          <>
            <View style={{ flex: 1, flexDirection: 'row', gap: space.x1 }}>
              {shown.slice(0, 2).map(tile)}
            </View>
            <View style={{ flex: 1, flexDirection: 'row', gap: space.x1 }}>
              {shown.slice(2).map(tile)}
            </View>
          </>
        ) : null}
      </View>
      {caption ? (
        <View
          style={{
            flexGrow: 1,
            padding: space.x4,
            gap: space.x1,
            backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
          }}
        >
          <Text variant="meta" tone="muted" strong>
            {digestShortDate(day, lang)}
          </Text>
          <Text
            variant="title"
            numberOfLines={2}
            style={fill ? { minHeight: theme.type.title.line * 2 } : undefined}
          >
            {title}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
