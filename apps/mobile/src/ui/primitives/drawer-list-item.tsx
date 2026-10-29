import type { ReactNode } from 'react';

export type DrawerListItemProps = {
  label: string;
  detail?: string;
  accessibilityLabel?: string;
  testID?: string;
  selected?: boolean;
  disabled?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress(): void;
  onLongPress?(): void;
};

// Only the Android drawer uses this platform adapter.
export function DrawerListItem(_props: DrawerListItemProps) {
  return null;
}
