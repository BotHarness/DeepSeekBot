import { Platform, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { EdgeFade } from '../chat/header-chrome';
import { useDesignTheme } from '../design/theme';
import { island, space } from '../design/tokens';
import { useTabChrome } from './tab-chrome';

export function ListEdgeFades() {
  const theme = useDesignTheme();
  const chrome = useTabChrome();
  const band = chrome?.islandTop ?? 0;
  const bottom = useAnimatedStyle(() => ({ opacity: 1 - (chrome?.hidden.value ?? 0) }));
  return (
    <>
      <EdgeFade edge="top" height={space.x6} color={theme.color.base} />
      {band > 0 ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, bottom]}>
          <EdgeFade
            edge="bottom"
            height={band + space.x6}
            cover={band}
            solid={0}
            color={theme.color.base}
            {...(Platform.OS === 'android' ? { shape: island.fade } : {})}
          />
        </Animated.View>
      ) : null}
    </>
  );
}
