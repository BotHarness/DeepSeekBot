import { Link } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';

import { zoomTransition } from './profile-shell';
import type { ProfileZoomSourceProps } from './profile-zoom-source';

export function ProfileZoomSource({ href, onPress, children }: ProfileZoomSourceProps) {
  const reduced = useReducedMotion();
  if (!zoomTransition || reduced) return children(onPress);
  return (
    <Link href={href} push asChild>
      <Link.AppleZoom>{children(undefined)}</Link.AppleZoom>
    </Link>
  );
}
