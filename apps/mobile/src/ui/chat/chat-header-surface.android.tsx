import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import type { RefObject } from 'react';
import { StyleSheet, View, type ViewInstance } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { chatHeaderSurface } from '../design/tokens';
import { EdgeFade } from './header-chrome';

export function ChatHeaderSurface({
  target,
  height,
  solid,
}: {
  target: RefObject<ViewInstance | null>;
  height: number;
  solid: number;
}) {
  const theme = useDesignTheme();
  const fadeHeight = height + chatHeaderSurface.fade;
  const mask = <EdgeFade edge="top" height={fadeHeight} cover={height} solid={solid} />;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: fadeHeight }}
    >
      <MaskedView style={StyleSheet.absoluteFill} maskElement={mask}>
        <BlurView
          style={StyleSheet.absoluteFill}
          blurTarget={target}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={chatHeaderSurface.intensity}
          tint={theme.scheme}
        />
      </MaskedView>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: solid,
          backgroundColor: theme.color.base,
        }}
      />
    </View>
  );
}
