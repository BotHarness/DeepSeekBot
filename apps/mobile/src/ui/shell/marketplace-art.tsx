import { Image } from 'expo-image';
import { useState } from 'react';
import { View, type StyleProp, type ImageStyle } from 'react-native';
import {
  marketplaceAvatar,
  marketplaceBanner,
  type MarketplaceArtSource,
} from '../../marketplace/artwork';
import { useDesignTheme } from '../design/theme';
import { marketplaceArt, radius, space } from '../design/tokens';

export function MarketplaceBannerImage({
  bot,
  style,
}: {
  bot: MarketplaceArtSource;
  style: StyleProp<ImageStyle>;
}) {
  const theme = useDesignTheme();
  const [failed, setFailed] = useState<string>();
  const requested = marketplaceBanner(bot);
  const source = failed === requested ? marketplaceBanner(bot, true) : requested;
  return (
    <Image
      testID="marketplace-banner"
      source={{ uri: source }}
      recyclingKey={source}
      contentFit="cover"
      cachePolicy="memory-disk"
      onError={() => setFailed(requested)}
      style={[{ backgroundColor: theme.layer.raised.fill }, style]}
    />
  );
}

export function MarketplaceAvatarImage({ bot, size }: { bot: MarketplaceArtSource; size: number }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        padding: marketplaceArt.avatarEdge,
        borderRadius: radius.round,
        backgroundColor: theme.layer.raised.fill,
      }}
    >
      <Image
        testID="marketplace-avatar"
        source={{ uri: marketplaceAvatar(bot) }}
        contentFit="contain"
        cachePolicy="memory"
        style={{ width: size, height: size, borderRadius: radius.round }}
      />
    </View>
  );
}

export function MarketplaceArt({
  bot,
  profile = false,
}: {
  bot: MarketplaceArtSource;
  profile?: boolean;
}) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MarketplaceBannerImage
        bot={bot}
        style={{ width: '100%', aspectRatio: marketplaceArt.aspectRatio }}
      />
      <View
        style={{
          marginTop: -(profile ? marketplaceArt.profileOverlap : marketplaceArt.cardOverlap),
          marginHorizontal: space.x5,
        }}
      >
        <MarketplaceAvatarImage
          bot={bot}
          size={profile ? marketplaceArt.profileAvatar : marketplaceArt.cardAvatar}
        />
      </View>
    </View>
  );
}
