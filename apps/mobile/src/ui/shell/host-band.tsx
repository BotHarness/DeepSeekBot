import { useMemo, type ReactNode } from 'react';
import { Image, View } from 'react-native';

import {
  headerFill,
  type HostAvatar,
  hostBand,
  screenBackground,
  type HostBand,
  type HostBanner,
} from '../design/host-look';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { GradientFill } from './gradient-fill';
import { HostTile } from './host-tile';
import { ChevronDownIcon } from './icons';

export function useHostBand(banner: HostBanner): HostBand {
  const theme = useDesignTheme();
  return useMemo(() => hostBand(theme.scheme, theme.color, banner), [theme, banner]);
}

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

export function HostBandLayer({
  band,
  banner,
  header,
  children,
  flex = true,
}: {
  band: HostBand;
  banner: HostBanner;
  header: ReactNode;
  children: ReactNode;
  flex?: boolean;
}) {
  const fill = headerFill(band, banner);
  return (
    <View
      style={{
        flex: flex ? 1 : undefined,
        backgroundColor: band.bottom,
        experimental_backgroundImage: screenBackground(band),
      }}
    >
      <View>
        {band.image === undefined && fill === undefined ? null : (
          <View style={{ ...FILL, bottom: -radius.lg, backgroundColor: band.top }}>
            {band.image === undefined ? null : (
              <Image source={{ uri: band.image }} resizeMode="cover" style={FILL} />
            )}
            {fill === undefined ? null : <GradientFill gradient={fill} />}
          </View>
        )}
        {header}
      </View>
      {children}
    </View>
  );
}

export function HostChipFace({
  hostName,
  avatar,
  band,
  singleLine = false,
}: {
  hostName: string;
  avatar: HostAvatar;
  band: HostBand;
  singleLine?: boolean;
}) {
  const theme = useDesignTheme();
  return (
    <>
      <HostTile
        hostName={hostName}
        avatar={avatar}
        size={theme.touch - space.x2}
        fill={band.ink}
        letter={band.tileInk}
      />
      <Text
        variant="title"
        strong
        numberOfLines={singleLine ? 1 : theme.largeText ? 2 : 1}
        ellipsizeMode="tail"
        style={{
          flexShrink: 1,
          minWidth: 0,
          color: band.ink,
          textShadowColor: band.shadow,
          textShadowRadius: band.shadow === undefined ? 0 : radius.xs,
        }}
      >
        {hostName}
      </Text>
      <ChevronDownIcon color={band.ink} size={theme.type.title.size + space.x2} />
    </>
  );
}
