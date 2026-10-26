import { Link } from 'expo-router';
import type { ReactNode } from 'react';

export function ProfileZoomTarget({ children }: { children: ReactNode }) {
  return <Link.AppleZoomTarget>{children}</Link.AppleZoomTarget>;
}
