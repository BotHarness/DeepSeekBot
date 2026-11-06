import type { ComponentProps } from 'react';
import type { View } from 'react-native';

export function ChatBackdrop({ children }: ComponentProps<typeof View>) {
  return <>{children}</>;
}
