import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { cornerBadge, radius, space } from '../design/tokens';
import { badgeCount } from '../primitives/badge-count';
import type { CountBadgeTone } from '../primitives/count-badge';
import { Text } from '../primitives/text';
import { CONVERSATION_AVATAR as AVATAR, CONVERSATION_RING as RING } from './avatar-slot';

/** Visible width of the tab that extends to the right of a row avatar in the All view. */
export const AVATAR_RAIL_REACH = 30;

/**
 * All-environments row avatar: a rounded tab extends from behind the avatar's right edge,
 * with the unread count on top and the environment mark below. Only needs-you uses the
 * warning fill; unread and muted share the neutral inset fill.
 */
export function AvatarRail({
  avatar,
  badge,
  mark,
}: {
  avatar: ReactNode;
  badge?: { count: number; tone: CountBadgeTone } | undefined;
  mark: (ink: string | undefined) => ReactNode;
}) {
  const theme = useDesignTheme();
  const needsYou = badge?.tone === 'needs-you';
  const fill = needsYou ? theme.color.warning : theme.layer.canvas.inset;
  const ink = needsYou
    ? theme.color[theme.scheme === 'dark' ? 'base' : 'fg']
    : badge?.tone === 'muted'
      ? theme.color.muted
      : theme.color.fg;
  const inset = RING / 2;
  return (
    <View
      style={{
        width: inset + AVATAR + AVATAR_RAIL_REACH,
        height: AVATAR + RING,
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: inset,
          left: inset + AVATAR / 2,
          width: AVATAR / 2 + AVATAR_RAIL_REACH,
          height: AVATAR,
          borderRadius: radius.md,
          backgroundColor: fill,
        }}
      />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          top: inset,
          right: 0,
          width: AVATAR_RAIL_REACH,
          height: AVATAR,
          alignItems: 'center',
          justifyContent: badge === undefined ? 'center' : 'space-between',
          paddingVertical: space.x3,
          paddingLeft: space.x1,
        }}
      >
        {badge === undefined ? null : (
          <Text
            variant="meta"
            strong
            maxFontSizeMultiplier={cornerBadge.maxTextScale}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              color: ink,
              textAlign: 'center',
              fontVariant: ['tabular-nums'],
            }}
          >
            {badgeCount(badge.count)}
          </Text>
        )}
        {mark(needsYou ? ink : undefined)}
      </View>
      <View style={{ position: 'absolute', top: 0, left: 0 }}>{avatar}</View>
    </View>
  );
}
