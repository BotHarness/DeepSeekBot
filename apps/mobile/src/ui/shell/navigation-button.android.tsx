import { PlatformPressable } from 'expo-router/react-navigation';
import type { ComponentProps } from 'react';

export function NavigationButton({ style, ...props }: ComponentProps<typeof PlatformPressable>) {
  return <PlatformPressable {...props} style={[style, { justifyContent: 'center', padding: 0 }]} />;
}
