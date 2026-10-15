import { useId } from 'react';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { BandGradient } from '../design/host-look';

export function GradientFill({ gradient }: { gradient: BandGradient }) {
  const id = `band-${useId().replace(/[^a-z0-9]/giu, '')}`;
  const diagonal = gradient.direction === 'diagonal';
  return (
    <Svg
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2={diagonal ? '1' : '0'} y2="1">
          <Stop offset="0" stopColor={gradient.from} stopOpacity={gradient.fromOpacity} />
          <Stop offset="1" stopColor={gradient.to} stopOpacity={gradient.toOpacity} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
