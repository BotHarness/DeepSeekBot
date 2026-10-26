import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { processColor, StyleSheet, View, type ViewProps } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { streamReveal } from '../design/tokens';

type SurfaceProps = ViewProps & {
  active: boolean;
  duration: number;
  surfaceColor: number;
  corners: number[];
};
const NativeSurface = requireOptionalNativeModule('StreamSurface')
  ? requireNativeView<SurfaceProps>('StreamSurface')
  : undefined;

export function StreamSurface({ active, style, ...props }: ViewProps & { active: boolean }) {
  const reduced = useReducedMotion();
  const flat = StyleSheet.flatten(style) ?? {};
  const color = processColor(flat.backgroundColor);
  if (!active || reduced || NativeSurface === undefined || typeof color !== 'number')
    return <View {...props} style={style} />;
  const radius = flat.borderRadius ?? 0;
  const corners = [
    flat.borderTopLeftRadius ?? radius,
    flat.borderTopRightRadius ?? radius,
    flat.borderBottomRightRadius ?? radius,
    flat.borderBottomLeftRadius ?? radius,
  ];
  if (!corners.every((value): value is number => typeof value === 'number'))
    return <View {...props} style={style} />;
  return (
    <NativeSurface
      {...props}
      active
      duration={streamReveal.surfaceDuration}
      surfaceColor={color}
      corners={corners}
      style={[style, { backgroundColor: 'transparent' }]}
    />
  );
}
