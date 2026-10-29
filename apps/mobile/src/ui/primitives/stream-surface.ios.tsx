import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { processColor, StyleSheet, View, type ViewProps } from 'react-native';

import { spring } from '../design/motion';
import { streamReveal } from '../design/tokens';

type SurfaceProps = ViewProps & {
  active: boolean;
  duration: number;
  surfaceColor: number;
  corners: number[];
  mass: number;
  stiffness: number;
  damping: number;
};
const NativeSurface = requireOptionalNativeModule('StreamSurface')
  ? requireNativeView<SurfaceProps>('StreamSurface')
  : undefined;

export function StreamSurface({ active, style, ...props }: ViewProps & { active: boolean }) {
  const flat = StyleSheet.flatten(style) ?? {};
  const color = processColor(flat.backgroundColor);
  const radius = flat.borderRadius ?? 0;
  const corners = [
    flat.borderTopLeftRadius ?? radius,
    flat.borderTopRightRadius ?? radius,
    flat.borderBottomRightRadius ?? radius,
    flat.borderBottomLeftRadius ?? radius,
  ];
  if (
    NativeSurface === undefined ||
    typeof color !== 'number' ||
    !corners.every((value): value is number => typeof value === 'number' && Number.isFinite(value))
  )
    return <View {...props} style={style} />;
  return (
    <NativeSurface
      {...props}
      active={active}
      duration={streamReveal.surfaceDuration}
      surfaceColor={color >>> 0}
      corners={corners}
      mass={spring.effects.fast.mass}
      stiffness={spring.effects.fast.stiffness}
      damping={spring.effects.fast.damping}
      style={[style, { backgroundColor: 'transparent' }]}
    />
  );
}
