import type { Href } from 'expo-router';
import type { ReactNode } from 'react';

export type ProfileZoomSourceProps = {
  href: Href;
  onPress(): void;
  children(onPress: (() => void) | undefined): ReactNode;
};

export function ProfileZoomSource({ onPress, children }: ProfileZoomSourceProps) {
  return children(onPress);
}
