import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ReactElement } from 'react';
import type { ViewProps } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { streamReveal } from '../design/tokens';

type RevealProps = ViewProps & {
  active: boolean;
  duration: number;
  stagger: number;
  maxGlyphs: number;
};

export const nativeStreamReveal = requireOptionalNativeModule('StreamReveal') !== null;
const NativeReveal = nativeStreamReveal
  ? requireNativeView<RevealProps>('StreamReveal')
  : undefined;

export function StreamReveal({ children, active }: { children: ReactElement; active: boolean }) {
  const reduced = useReducedMotion();
  if (NativeReveal === undefined) return children;
  return (
    <NativeReveal
      active={active && !reduced}
      duration={streamReveal.duration}
      stagger={streamReveal.stagger}
      maxGlyphs={streamReveal.maxGlyphs}
    >
      {children}
    </NativeReveal>
  );
}
